/**
 * Ingest a prep_source: URL (robots → fetch → extract), PDF, or paste.
 * Stores restated claims only; clears ephemeral paste_body after success.
 */

import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.109.0";
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
} from "../_shared/cors.ts";
import {
  checkRelevance,
  classifyClaim,
  extractClaims,
  htmlToText,
  isFirstPartyUrl,
  prepKeysFromApplication,
} from "../_shared/claims.ts";
import {
  embedClaims,
  insertAndCorroborate,
  type ChunkInsert,
} from "../_shared/corroborate.ts";
import {
  HttpError,
  logUpstreamFailure,
  outputConfig,
  readEnvironment,
} from "../_shared/model.ts";
import { PREP_USER_AGENT, robotsAllows } from "../_shared/robots.ts";
import { encodeBase64 } from "../_shared/pdf.ts";
import {
  allowanceStatus,
  assertUnderAllowance,
  spendAllowance,
} from "../_shared/quota.ts";

const MAX_FETCH_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") {
    return errorResponse("This endpoint only accepts POST requests.", 405);
  }

  try {
    return await ingest(req);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status);
    }
    console.error("ingest-prep-source failed", error);
    return errorResponse("Ingesting that source failed. Please try again.", 500);
  }
});

async function ingest(req: Request): Promise<Response> {
  const body = await req.json() as {
    sourceId?: string;
    force?: boolean;
    acknowledgeRelevance?: boolean;
  };
  const sourceId = body.sourceId?.trim() ?? "";
  if (sourceId === "") {
    throw new HttpError("A source id is required.", 400);
  }

  const env = readEnvironment("Source ingest");
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (token === "") {
    throw new HttpError("You need to be signed in to add a source.", 401);
  }

  const client = createClient(env.supabaseUrl, env.supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    "";
  if (serviceKey === "") {
    throw new HttpError("Source ingest is not configured on this server.", 500);
  }
  const service = createClient(env.supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await client.auth.getUser(token);
  const user = auth?.user;
  if (authError || !user) {
    throw new HttpError(
      "Your session has expired. Sign in again and try again.",
      401,
    );
  }

  const { data: source, error: sourceError } = await client
    .from("prep_sources")
    .select("*")
    .eq("id", sourceId)
    .single();

  if (sourceError || !source) {
    throw new HttpError("That source was not found.", 404);
  }

  const { data: application, error: appError } = await client
    .from("applications")
    .select("id, company, role, level, company_domain, company_id, role_id, level_id")
    .eq("id", source.application_id)
    .single();

  if (appError || !application) {
    throw new HttpError("That application was not found.", 404);
  }

  if (
    source.input_kind === "url" &&
    !(application.company_domain ?? "").trim()
  ) {
    throw new HttpError(
      "Confirm the company domain on this application before fetching URLs — we use it to tell first-party pages from everything else.",
      400,
    );
  }

  let rawText = "";
  let sourceUrl: string | null = source.url ?? null;
  let sourceTitle: string | null = source.title ?? null;

  try {
    if (source.input_kind === "url") {
      if (!sourceUrl) throw new HttpError("That source has no URL.", 400);
      const robots = await robotsAllows(sourceUrl);
      if (!robots.allowed) {
        await markFailed(client, sourceId, robots.reason ?? "Blocked by robots.txt.");
        throw new HttpError(
          robots.reason ??
            "That site's robots.txt disallows our crawler, so the page was not fetched.",
          422,
        );
      }
      rawText = await fetchPageText(sourceUrl);
    } else if (source.input_kind === "pdf") {
      if (!source.storage_path) {
        throw new HttpError("That PDF source has no file.", 400);
      }
      rawText = await loadPdfText(client, source.storage_path);
    } else if (source.input_kind === "paste") {
      rawText = (source.paste_body ?? "").trim();
      if (rawText === "") {
        throw new HttpError("Paste some notes before indexing.", 400);
      }
    } else {
      throw new HttpError("Unknown source type.", 400);
    }

    if (rawText.length < 40) {
      await markFailed(client, sourceId, "Not enough text to extract claims.");
      throw new HttpError(
        "There was not enough readable text to extract claims from.",
        422,
      );
    }

    // Soft relevance — warn unless acknowledgeRelevance.
    const relevance = await checkRelevance({
      company: application.company,
      role: application.role,
      preview: rawText,
    });

    if (!relevance.relevant && !body.acknowledgeRelevance) {
      return jsonResponse({
        warning: true,
        reason: relevance.reason,
        message:
          "This source may not be about this company or role. You can still index it — the first three soft checks a month are free; after that each one uses a chat turn from your plan.",
      });
    }

    if (!relevance.relevant && body.acknowledgeRelevance) {
      await spendRelevanceOrChat(client, user.id, sourceId);
    }

    const extracted = await extractClaims(rawText, {
      company: application.company,
      role: application.role,
    });

    if (extracted.length === 0) {
      await markFailed(
        client,
        sourceId,
        "No restatable claims found in the source.",
      );
      throw new HttpError(
        "No claims could be restated from that source without quoting it. Try a different page or paste your own notes.",
        422,
      );
    }

    const isNews =
      source.kind === "news" ||
      (sourceUrl !== null &&
        !isFirstPartyUrl(sourceUrl, application.company_domain) &&
        /news|press|funding|techcrunch|bloomberg|reuters/i.test(sourceUrl));

    const keys = prepKeysFromApplication(application);
    const company = keys.company;
    const roleScope = source.scope === "company" ? null : keys.role;
    const levelScope = source.scope === "company" ? null : keys.level;

    const classified = extracted.map((claim) =>
      classifyClaim(claim, {
        inputKind: source.input_kind,
        sourceUrl,
        companyDomain: application.company_domain,
        sourceKind: source.kind,
        isNewsAboutCompany: isNews && claim.claimKind === "company_fact",
      })
    );

    const embeddings = await embedClaims(classified.map((c) => c.content));

    const inserts: ChunkInsert[] = classified.map((claim, i) => ({
      userId: claim.shareImmediately ? null : user.id,
      applicationId: application.id,
      sourceId,
      recapId: null,
      company,
      role: roleScope,
      level: levelScope,
      interviewType: null,
      claimKind: claim.claimKind,
      content: claim.content,
      provenance: claim.provenance,
      sourceUrl,
      sourceTitle,
      embedding: embeddings[i],
    }));

    const { inserted } = await insertAndCorroborate(
      client,
      service,
      user.id,
      inserts,
    );

    await client
      .from("prep_sources")
      .update({
        status: "indexed",
        error: null,
        paste_body: null,
      })
      .eq("id", sourceId);

    return jsonResponse({
      ok: true,
      claims: inserted,
      sourceId,
    });
  } catch (error) {
    if (error instanceof HttpError && error.status !== 422) {
      await markFailed(client, sourceId, error.message).catch(() => {});
    }
    throw error;
  }
}

async function spendRelevanceOrChat(
  client: SupabaseClient,
  userId: string,
  sourceId: string,
): Promise<void> {
  const status = await allowanceStatus(client, userId, "relevance_check");
  if (status.remaining > 0) {
    await spendAllowance(client, userId, "relevance_check", sourceId);
    return;
  }
  await assertUnderAllowance(client, userId, "chat");
  await spendAllowance(client, userId, "chat", sourceId);
}

async function markFailed(
  client: SupabaseClient,
  sourceId: string,
  error: string,
): Promise<void> {
  await client
    .from("prep_sources")
    .update({ status: "failed", error, paste_body: null })
    .eq("id", sourceId);
}

async function fetchPageText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": PREP_USER_AGENT,
      accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new HttpError(
      `Could not fetch that page (${response.status}).`,
      422,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (
    !contentType.includes("text/html") &&
    !contentType.includes("text/plain") &&
    !contentType.includes("application/xhtml")
  ) {
    throw new HttpError(
      "That URL did not return a readable HTML or text page.",
      422,
    );
  }

  const buf = await response.arrayBuffer();
  if (buf.byteLength > MAX_FETCH_BYTES) {
    throw new HttpError("That page is too large to index.", 422);
  }
  const text = new TextDecoder().decode(buf);
  return contentType.includes("text/plain") ? text.trim() : htmlToText(text);
}

/**
 * PDFs: send raw bytes as a document to extraction by converting via a light
 * text path. Without a PDF text library in the Deno bundle, we pass a base64
 * note and ask extraction to treat it as unavailable — instead, store a
 * placeholder instructing the user. Better: use Anthropic document block.
 *
 * For v1 we download bytes and ask Haiku via a document content block in a
 * dedicated path below.
 */
async function loadPdfText(
  client: SupabaseClient,
  storagePath: string,
): Promise<string> {
  const { data, error } = await client.storage
    .from("prep-sources")
    .download(storagePath);

  if (error || !data) {
    throw new HttpError("Could not read that PDF from storage.", 500);
  }

  const bytes = new Uint8Array(await data.arrayBuffer());
  // Prefer real extraction via Claude document block.
  return await extractTextFromPdfBytes(bytes);
}

async function extractTextFromPdfBytes(bytes: Uint8Array): Promise<string> {
  const env = readEnvironment("PDF text extraction");
  const b64 = encodeBase64(bytes);
  const model = Deno.env.get("ANTHROPIC_EXTRACT_MODEL")?.trim() ||
    "claude-haiku-4-5-20251001";

  const response = await fetch(`${env.anthropicBase}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8_000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: b64,
              },
            },
            {
              type: "text",
              text:
                "Extract all readable text from this PDF verbatim for downstream claim extraction. Return plain text only, no commentary.",
            },
          ],
        },
      ],
      output_config: outputConfig(model, "low"),
    }),
  });

  if (!response.ok) {
    await logUpstreamFailure("pdf text extract", response);
    throw new HttpError("Could not read text from that PDF.", 502);
  }

  const body = await response.json() as {
    content?: { type?: string; text?: string }[];
  };
  const text = (body.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();

  if (text.length < 40) {
    throw new HttpError("That PDF did not contain enough readable text.", 422);
  }
  return text;
}
