/**
 * Corroboration and asymmetric promotion into the shared corpus.
 *
 * Interview claims stay private until corroboration_count >= 2 from independent
 * users with at least one candidate_report. Company facts that are already
 * shareImmediately are inserted shared by the ingest path; this module handles
 * matching groups and promoting interview claims.
 *
 * Shared rows are written with the service role client only.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.109.0";
import { embedTexts, EMBEDDING_MODEL } from "./embed.ts";
import type { ClaimKind, Provenance } from "./claims.ts";

export const CORROBORATION_SIMILARITY = 0.90;

export interface ChunkInsert {
  userId: string | null;
  applicationId: string | null;
  sourceId: string | null;
  recapId: string | null;
  company: string | null;
  role: string | null;
  level: string | null;
  interviewType: string | null;
  claimKind: ClaimKind;
  content: string;
  provenance: Provenance;
  sourceUrl: string | null;
  sourceTitle: string | null;
  embedding: number[];
  claimGroupId?: string;
  corroborationCount?: number;
}

interface ExistingChunk {
  id: string;
  user_id: string | null;
  claim_group_id: string;
  corroboration_count: number;
  provenance: string;
  content: string;
  embedding: number[] | string | null;
}

/**
 * Insert claims, merge into similar claim groups, and promote interview claims
 * when the rule is met. `userClient` writes private rows; `service` writes shared.
 */
export async function insertAndCorroborate(
  userClient: SupabaseClient,
  service: SupabaseClient,
  ownerId: string,
  chunks: ChunkInsert[],
): Promise<{ inserted: number; promoted: number }> {
  let inserted = 0;
  let promoted = 0;

  for (const chunk of chunks) {
    const match = await findNearest(
      service,
      chunk.company,
      chunk.role,
      chunk.claimKind,
      chunk.embedding,
    );

    const claimGroupId = match?.claim_group_id ??
      chunk.claimGroupId ??
      crypto.randomUUID();

    const row = {
      user_id: chunk.userId,
      application_id: chunk.applicationId,
      source_id: chunk.sourceId,
      recap_id: chunk.recapId,
      company: chunk.company,
      role: chunk.role,
      level: chunk.level,
      interview_type: chunk.interviewType,
      claim_kind: chunk.claimKind,
      content: chunk.content,
      embedding: chunk.embedding,
      embedding_model: EMBEDDING_MODEL,
      provenance: chunk.provenance,
      corroboration_count: chunk.corroborationCount ?? 1,
      claim_group_id: claimGroupId,
      source_url: chunk.sourceUrl,
      source_title: chunk.sourceTitle,
    };

    // Shared insert must use service role (RLS blocks client null user_id).
    const writer = chunk.userId === null ? service : userClient;
    const { data: created, error } = await writer
      .from("prep_chunks")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error("prep_chunks insert failed", error);
      continue;
    }
    inserted += 1;

    if (match && match.user_id !== ownerId) {
      // Independent user contributing to the same group.
      await bumpGroup(service, claimGroupId);
    } else if (match && match.claim_group_id) {
      // Same group id linkage even for same user: keep group coherent.
      await userClient
        .from("prep_chunks")
        .update({ claim_group_id: claimGroupId })
        .eq("id", created.id);
    }

    if (chunk.claimKind === "interview_process") {
      const did = await maybePromoteInterviewGroup(service, claimGroupId);
      if (did) promoted += 1;
    }
  }

  return { inserted, promoted };
}

async function findNearest(
  service: SupabaseClient,
  company: string | null,
  role: string | null,
  claimKind: ClaimKind,
  embedding: number[],
): Promise<ExistingChunk | null> {
  // RPC returns similar rows the invoker can see; service role sees all.
  const { data, error } = await service.rpc("match_prep_chunks", {
    query_embedding: embedding,
    p_company: company,
    p_role: role,
    p_level: null,
    p_interview_type: null,
    p_claim_kind: claimKind,
    match_count: 5,
    min_similarity: CORROBORATION_SIMILARITY,
  });

  if (error) {
    console.error("match_prep_chunks for corroboration failed", error);
    return null;
  }

  const hit = (data as { id: string; similarity: number }[] | null)?.[0];
  if (!hit) return null;

  const { data: row, error: loadError } = await service
    .from("prep_chunks")
    .select(
      "id, user_id, claim_group_id, corroboration_count, provenance, content, embedding",
    )
    .eq("id", hit.id)
    .maybeSingle();

  if (loadError || !row) return null;
  return row as ExistingChunk;
}

async function bumpGroup(
  service: SupabaseClient,
  claimGroupId: string,
): Promise<void> {
  const { data: rows } = await service
    .from("prep_chunks")
    .select("id, corroboration_count, user_id")
    .eq("claim_group_id", claimGroupId);

  if (!rows || rows.length === 0) return;

  const uniqueUsers = new Set(
    rows.map((r: { user_id: string | null }) => r.user_id).filter(Boolean),
  );
  const count = Math.max(rows.length, uniqueUsers.size);

  await service
    .from("prep_chunks")
    .update({ corroboration_count: count })
    .eq("claim_group_id", claimGroupId);
}

/**
 * Promote an interview claim group to a shared canonical row when:
 * corroboration_count >= 2 from independent users AND at least one
 * candidate_report exists in the group.
 */
async function maybePromoteInterviewGroup(
  service: SupabaseClient,
  claimGroupId: string,
): Promise<boolean> {
  const { data: rows } = await service
    .from("prep_chunks")
    .select(
      "id, user_id, content, company, role, level, interview_type, claim_kind, provenance, source_url, source_title, embedding, embedding_model, corroboration_count",
    )
    .eq("claim_group_id", claimGroupId)
    .eq("claim_kind", "interview_process");

  if (!rows || rows.length === 0) return false;

  const alreadyShared = rows.some((r: { user_id: string | null }) =>
    r.user_id === null
  );
  if (alreadyShared) return false;

  const users = new Set(
    rows
      .map((r: { user_id: string | null }) => r.user_id)
      .filter((id: string | null): id is string => !!id),
  );
  const hasCandidateReport = rows.some(
    (r: { provenance: string }) => r.provenance === "candidate_report",
  );
  const count = Math.max(
    ...rows.map((r: { corroboration_count: number }) => r.corroboration_count),
    users.size,
  );

  if (users.size < 2 || !hasCandidateReport || count < 2) return false;

  const seed = rows[0];
  const { error } = await service.from("prep_chunks").insert({
    user_id: null,
    application_id: null,
    source_id: null,
    recap_id: null,
    company: seed.company,
    role: seed.role,
    level: seed.level,
    interview_type: seed.interview_type,
    claim_kind: "interview_process",
    content: seed.content,
    embedding: seed.embedding,
    embedding_model: seed.embedding_model ?? EMBEDDING_MODEL,
    provenance: "candidate_report",
    corroboration_count: count,
    claim_group_id: claimGroupId,
    source_url: seed.source_url,
    source_title: seed.source_title,
  });

  if (error) {
    console.error("promote interview claim failed", error);
    return false;
  }
  return true;
}

/** Embed claim texts and return vectors in order. */
export async function embedClaims(texts: string[]): Promise<number[][]> {
  return embedTexts(texts);
}
