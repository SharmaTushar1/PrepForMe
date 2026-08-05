/**
 * Save user-confirmed claims from a prep chat exchange into private prep_chunks.
 */

import {
  createClient,
} from "npm:@supabase/supabase-js@2.109.0";
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
} from "../_shared/cors.ts";
import {
  prepKeysFromApplication,
  type ClaimKind,
  type Provenance,
} from "../_shared/claims.ts";
import {
  embedClaims,
  insertAndCorroborate,
  type ChunkInsert,
} from "../_shared/corroborate.ts";
import { HttpError, readEnvironment } from "../_shared/model.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") {
    return errorResponse("This endpoint only accepts POST requests.", 405);
  }

  try {
    return await save(req);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status);
    }
    console.error("save-prep-claims failed", error);
    return errorResponse("Saving those claims failed. Please try again.", 500);
  }
});

async function save(req: Request): Promise<Response> {
  const body = await req.json() as {
    applicationId?: string;
    claims?: {
      content?: string;
      claimKind?: string;
      /** candidate_report if from their experience; else ai_inferred */
      provenance?: string;
    }[];
  };

  const applicationId = body.applicationId?.trim() ?? "";
  const claims = (body.claims ?? []).filter((c) => (c.content ?? "").trim());
  if (applicationId === "" || claims.length === 0) {
    throw new HttpError("Pick at least one claim to save.", 400);
  }

  const env = readEnvironment("Save prep claims");
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (token === "") {
    throw new HttpError("You need to be signed in to save claims.", 401);
  }

  const client = createClient(env.supabaseUrl, env.supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    "";
  if (serviceKey === "") {
    throw new HttpError("Saving claims is not configured on this server.", 500);
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

  const { data: application, error: appError } = await client
    .from("applications")
    .select("id, company, role, level, company_id, role_id, level_id")
    .eq("id", applicationId)
    .single();

  if (appError || !application) {
    throw new HttpError("That application was not found.", 404);
  }

  const normalised: {
    content: string;
    claimKind: ClaimKind;
    provenance: Provenance;
  }[] = [];

  for (const claim of claims) {
    const content = (claim.content ?? "").trim();
    if (content.length < 12) continue;
    const claimKind: ClaimKind =
      claim.claimKind === "interview_process"
        ? "interview_process"
        : "company_fact";
    const provenance: Provenance =
      claim.provenance === "candidate_report"
        ? "candidate_report"
        : "ai_inferred";
    // ai_inferred never shared — always private insert below.
    normalised.push({ content, claimKind, provenance });
  }

  if (normalised.length === 0) {
    throw new HttpError("Pick at least one claim to save.", 400);
  }

  const embeddings = await embedClaims(normalised.map((c) => c.content));
  const keys = prepKeysFromApplication(application);

  const inserts: ChunkInsert[] = normalised.map((claim, i) => ({
    userId: user.id,
    applicationId: application.id,
    sourceId: null,
    recapId: null,
    company: keys.company,
    role: keys.role,
    level: keys.level,
    interviewType: null,
    claimKind: claim.claimKind,
    content: claim.content,
    provenance: claim.provenance,
    sourceUrl: null,
    sourceTitle: null,
    embedding: embeddings[i],
  }));

  const { inserted, promoted } = await insertAndCorroborate(
    client,
    service,
    user.id,
    inserts,
  );

  return jsonResponse({ ok: true, saved: inserted, promoted });
}
