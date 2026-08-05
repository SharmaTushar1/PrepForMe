/**
 * Prep chat grounded in prep_chunks, with multi-turn history.
 *
 * Each turn re-retrieves claims for the current question. Prior turns are
 * plain dialogue so pronouns and "save it" resolve. The model returns
 * structured JSON: the answer plus Save-to-prep suggestions from the
 * exchange — not a dump of retrieved corpus rows.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.109.0";
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
} from "../_shared/cors.ts";
import { prepKeysFromApplication } from "../_shared/claims.ts";
import { embedTexts } from "../_shared/embed.ts";
import {
  ANTHROPIC_VERSION,
  HttpError,
  logUpstreamFailure,
  outputConfig,
  readEnvironment,
  readModelResponse,
  upstreamMessage,
} from "../_shared/model.ts";
import { assertUnderAllowance, spendAllowance } from "../_shared/quota.ts";

const MAX_OUTPUT_TOKENS = 4_000;
const MAX_HISTORY = 8;

const CHAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "suggestedClaims"],
  properties: {
    answer: { type: "string" },
    suggestedClaims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["content", "claimKind", "fromExperience"],
        properties: {
          content: { type: "string" },
          claimKind: {
            type: "string",
            enum: ["company_fact", "interview_process"],
          },
          fromExperience: { type: "boolean" },
        },
      },
    },
  },
} as const;

type ClaimRow = {
  id: string;
  content: string;
  provenance: string;
  claim_kind: string;
  corroboration_count: number;
  source_url: string | null;
  source_title: string | null;
  is_personal: boolean;
  similarity: number;
};

type HistoryTurn = { role: "user" | "assistant"; content: string };

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") {
    return errorResponse("This endpoint only accepts POST requests.", 405);
  }

  try {
    return await chat(req);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status);
    }
    console.error("prep-chat failed", error);
    return errorResponse("The prep answer failed. Please try again.", 500);
  }
});

async function chat(req: Request): Promise<Response> {
  const body = await req.json() as {
    applicationId?: string;
    question?: string;
    history?: { role?: string; content?: string }[];
  };
  const applicationId = body.applicationId?.trim() ?? "";
  const question = body.question?.trim() ?? "";
  if (applicationId === "" || question === "") {
    throw new HttpError("An application and a question are required.", 400);
  }

  const history = normaliseHistory(body.history);

  const env = readEnvironment("Prep chat");
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (token === "") {
    throw new HttpError("You need to be signed in to ask in company prep.", 401);
  }

  const client = createClient(env.supabaseUrl, env.supabaseKey, {
    global: { headers: { Authorization: authorization } },
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

  const { data: application, error: appError } = await client
    .from("applications")
    .select("id, company, role, level, company_id, role_id, level_id")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    throw new HttpError("That application was not found.", 404);
  }

  await assertUnderAllowance(client, user.id, "chat");
  await spendAllowance(client, user.id, "chat", applicationId);

  const [embedding] = await embedTexts([question]);

  const keys = prepKeysFromApplication(application);
  const company = keys.company;
  const role = keys.role;

  let claims = await matchClaims(client, {
    embedding,
    company,
    role,
    level: keys.level,
    matchCount: 10,
    minSimilarity: 0.25,
  });

  // Soft fallback: thin careers pages often sit just under the similarity
  // floor for follow-up questions. Still company-scoped — never cross-company.
  if (claims.length === 0) {
    claims = await matchClaims(client, {
      embedding,
      company,
      role,
      level: keys.level,
      matchCount: 5,
      minSimilarity: 0,
    });
  }

  const contextBlock = claims.length === 0
    ? "(No stored claims matched this question yet.)"
    : claims
      .map((c, i) =>
        `[${i + 1}] (${c.provenance}${
          c.is_personal ? ", personal" : ", shared"
        }; ${c.claim_kind}) ${c.content}${
          c.source_url ? ` — ${c.source_url}` : ""
        }`
      )
      .join("\n");

  const system = buildSystemPrompt(
    application.company,
    application.role,
    application.level,
  );

  const model = Deno.env.get("ANTHROPIC_CHAT_MODEL")?.trim() ||
    "claude-haiku-4-5-20251001";

  const messages: { role: "user" | "assistant"; content: string }[] = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    {
      role: "user",
      content:
        `Claims retrieved for this turn:\n${contextBlock}\n\nCurrent question: ${question}`,
    },
  ];

  const response = await fetch(`${env.anthropicBase}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: [
        {
          type: "text",
          text: system,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages,
      output_config: outputConfig(model, "low", {
        type: "json_schema",
        schema: CHAT_SCHEMA,
      }),
    }),
  });

  if (!response.ok) {
    await logUpstreamFailure("prep-chat model", response);
    throw new HttpError(upstreamMessage(response.status), 502);
  }

  const result = await readModelResponse(response, "prep answer");
  const raw = result.raw as {
    answer?: string;
    suggestedClaims?: {
      content?: string;
      claimKind?: string;
      fromExperience?: boolean;
    }[];
  };

  const content = (raw.answer ?? "").trim();
  if (content === "") {
    throw new HttpError("The prep answer came back empty. Please try again.", 502);
  }

  const suggestedClaims = (raw.suggestedClaims ?? [])
    .map((c) => {
      const claimContent = (c.content ?? "").trim();
      if (claimContent === "") return null;
      const claimKind = c.claimKind === "company_fact"
        ? "company_fact" as const
        : c.claimKind === "interview_process"
        ? "interview_process" as const
        : null;
      if (!claimKind) return null;
      return {
        content: claimContent,
        claimKind,
        provenance: c.fromExperience === true
          ? "candidate_report" as const
          : "ai_inferred" as const,
        fromExperience: c.fromExperience === true,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .slice(0, 8);

  const citations = dedupeCitations(
    claims.map((c, i) => ({
      label: c.source_title || c.source_url || `Claim ${i + 1}`,
      layer: citationLayer(c.provenance, c.is_personal),
      provenance: c.provenance,
      claimKind: c.claim_kind,
      sourceUrl: c.source_url,
    })),
  );

  return jsonResponse({
    content,
    citations,
    suggestedClaims,
  });
}

function buildSystemPrompt(
  company: string,
  role: string,
  level: string | null,
): string {
  const label = `${company} · ${role}${level ? ` · ${level}` : ""}`;
  return `You are a company-prep coach for ${label}.

The numbered claims in the latest user message are what this product has indexed for them — you already have them. Never say you cannot access sources, indexes, personal accounts, or "custom" data. Never claim you lack access to something the claims list provides.

Rules:
1. Company-specific facts (interview loop, who they'll meet, what *this* company asks, values stated on their site) ONLY from the numbered claims. Cite like [1].
2. If claims do not cover the question: say so in one short sentence, then you MAY give general role coaching (practice algorithm problems, study tips, frameworks) clearly labeled "general guidance — not from your sources". Never present general coaching as ${company}-specific intel.
3. Never invent ${company}-specific interview content. Never invent numbers, names, or process steps not in the claims.
4. Resolve pronouns and vague follow-ups ("it", "that", "save it", "the problem") against prior turns in this conversation.
5. When the user asks to save something from the thread (especially if they say it was from a real interview), acknowledge that Save to prep is available and put that atomic claim in suggestedClaims with fromExperience=true when they affirmed lived experience. Do not pretend not to understand.
6. suggestedClaims must be short restated facts worth storing — from this exchange or clearly affirmed by the user — not a copy of the retrieved claim list. Empty array is fine when nothing new is worth saving.
7. Write the answer for a human reading a chat bubble. Use plain text; URLs may be written out so the UI can link them.`;
}

function normaliseHistory(
  raw: { role?: string; content?: string }[] | undefined,
): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];

  const cleaned: HistoryTurn[] = [];
  for (const item of raw) {
    const role = item.role === "assistant"
      ? "assistant" as const
      : item.role === "user"
      ? "user" as const
      : null;
    const content = (item.content ?? "").trim();
    if (!role || content === "") continue;
    cleaned.push({ role, content: content.slice(0, 4_000) });
  }

  let slice = cleaned.slice(-MAX_HISTORY);

  // Anthropic requires the first message to be user.
  while (slice.length > 0 && slice[0].role !== "user") {
    slice = slice.slice(1);
  }

  // The final turn we append is always user; drop a trailing user so we don't
  // send user→user (which happens if the client included the just-asked turn).
  while (slice.length > 0 && slice[slice.length - 1].role === "user") {
    slice = slice.slice(0, -1);
  }

  // Collapse accidental same-role doubles by merging content.
  const merged: HistoryTurn[] = [];
  for (const turn of slice) {
    const prev = merged[merged.length - 1];
    if (prev && prev.role === turn.role) {
      prev.content = `${prev.content}\n\n${turn.content}`;
    } else {
      merged.push({ ...turn });
    }
  }

  return merged.slice(-MAX_HISTORY);
}

async function matchClaims(
  client: SupabaseClient,
  opts: {
    embedding: number[];
    company: string;
    role: string;
    level: string | null;
    matchCount: number;
    minSimilarity: number;
  },
): Promise<ClaimRow[]> {
  const { data, error } = await client.rpc("match_prep_chunks", {
    query_embedding: opts.embedding,
    p_company: opts.company,
    p_role: opts.role,
    p_level: opts.level,
    p_interview_type: null,
    p_claim_kind: null,
    match_count: opts.matchCount,
    min_similarity: opts.minSimilarity,
  });

  if (error) {
    console.error("match_prep_chunks failed", error);
    throw new HttpError("Could not search prep claims. Please try again.", 500);
  }

  return (data ?? []) as ClaimRow[];
}

function dedupeCitations<T extends { label: string; sourceUrl?: string | null }>(
  citations: T[],
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const c of citations) {
    const key = (c.sourceUrl || c.label).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function citationLayer(
  provenance: string,
  isPersonal: boolean,
): "company" | "role" | "personal" | "general" {
  if (isPersonal || provenance === "candidate_report") return "personal";
  if (
    provenance === "company_site" ||
    provenance === "company_blog" ||
    provenance === "news"
  ) {
    return "company";
  }
  if (provenance === "general_pattern") return "general";
  return "role";
}
