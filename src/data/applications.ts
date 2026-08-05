import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import type { ApplicationRow, StageEventRow } from "../lib/db.types";
import type { Application, ApplicationDraft, Stage } from "../types";
import { STAGES } from "../data";
import { useSession } from "../auth/SessionProvider";
import { normaliseCompany } from "../lib/company";
import { keys } from "./queryKeys";

/**
 * Child ids are selected alongside each row so counts come back in one round
 * trip without depending on PostgREST aggregate support. `scope` rides along
 * because a company-scope source counts for every role at that company — see
 * `countSources`.
 */
type ApplicationWithCounts = ApplicationRow & {
  recaps: { id: string }[] | null;
  prep_sources: { id: string; scope: string | null }[] | null;
};

const SELECT = "*, recaps(id), prep_sources(id, scope)";

/**
 * `sourceCount` is passed in because it can't be read off one row: a role's
 * usable sources include company-scope ones owned by its siblings. The default
 * covers the single-row mutation returns, whose value is replaced moments later
 * by the invalidated list query.
 */
function toApplication(
  row: ApplicationWithCounts,
  sourceCount: number = row.prep_sources?.length ?? 0,
): Application {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    level: row.level,
    stage: row.stage,
    postingUrl: row.posting_url,
    companyDomain: row.company_domain ?? null,
    jobDescription: row.job_description,
    nextAction: row.next_action,
    nextActionAt: row.next_action_at,
    appliedAt: row.applied_at,
    resumeTailored: row.resume_tailored,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceCount,
    recapCount: row.recaps?.length ?? 0,
  };
}

/**
 * Sources this role can actually draw on: its own, plus every company-scope
 * source added under a sibling role at the same company.
 *
 * A company-scope source is stored with `role`/`level` null on its
 * `prep_chunks`, and `match_prep_chunks` matches null role against any role. So
 * the coach already answers a second Google role from the first one's careers
 * page. Counting only `application_id` rows made a role that had company-wide
 * claims behind it report "0 sources · Cold start", which reads as "the coach
 * has nothing" when the opposite is true.
 */
function countSources(rows: ApplicationWithCounts[]): Map<string, number> {
  const companyWide = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = normaliseCompany(row.company);
    for (const source of row.prep_sources ?? []) {
      if (source.scope !== "company") continue;
      const set = companyWide.get(key) ?? new Set<string>();
      set.add(source.id);
      companyWide.set(key, set);
    }
  }

  const counts = new Map<string, number>();
  for (const row of rows) {
    const own = row.prep_sources ?? [];
    const ownIds = new Set(own.map((s) => s.id));
    const shared = companyWide.get(normaliseCompany(row.company)) ?? new Set<string>();
    let extra = 0;
    for (const id of shared) if (!ownIds.has(id)) extra += 1;
    counts.set(row.id, own.length + extra);
  }
  return counts;
}

/** Guess a company domain from a posting URL host. */
export function guessCompanyDomain(postingUrl: string | null | undefined): string | null {
  if (!postingUrl?.trim()) return null;
  try {
    const host = new URL(
      postingUrl.includes("://") ? postingUrl : `https://${postingUrl}`,
    ).hostname
      .toLowerCase()
      .replace(/^www\./, "");
    // Skip common ATS hosts — those aren't the company domain.
    if (
      /greenhouse\.io$|lever\.co$|ashbyhq\.com$|workday\.com$|myworkdayjobs\.com$|jobs\.|careers\./
        .test(host)
    ) {
      return null;
    }
    return host || null;
  } catch {
    return null;
  }
}

export function useApplications() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.applications(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<Application[]> => {
      const rows = await unwrap<ApplicationWithCounts[]>(
        supabase.from("applications").select(SELECT).order("updated_at", { ascending: false }),
      );
      const counts = countSources(rows);
      return rows.map((row) => toApplication(row, counts.get(row.id) ?? 0));
    },
  });
}

/** Every stage transition the user has ever made — the basis for the funnel. */
export function useStageEvents() {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.stageEvents(userId ?? "anon"),
    enabled: !!userId,
    queryFn: async (): Promise<StageEventRow[]> =>
      unwrap<StageEventRow[]>(
        supabase
          .from("application_stage_events")
          .select("id, application_id, from_stage, to_stage, occurred_at")
          .order("occurred_at", { ascending: true }),
      ),
  });
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (draft: ApplicationDraft): Promise<Application> => {
      const row = await unwrap<ApplicationWithCounts>(
        supabase
          .from("applications")
          .insert({
            company: draft.company.trim(),
            role: draft.role.trim(),
            level: draft.level?.trim() || null,
            stage: draft.stage ?? "Saved",
            posting_url: draft.postingUrl?.trim() || null,
            company_domain:
              draft.companyDomain?.trim() ||
              guessCompanyDomain(draft.postingUrl) ||
              null,
            job_description: draft.jobDescription?.trim() || null,
            next_action: draft.nextAction?.trim() || null,
            next_action_at: draft.nextActionAt || null,
          })
          .select(SELECT)
          .single(),
      );
      return toApplication(row);
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
      queryClient.invalidateQueries({ queryKey: keys.stageEvents(userId) });
    },
  });
}

export interface ApplicationPatch {
  company?: string;
  role?: string;
  level?: string | null;
  stage?: Stage;
  postingUrl?: string | null;
  companyDomain?: string | null;
  jobDescription?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  resumeTailored?: boolean;
}

export function useUpdateApplication() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: ApplicationPatch }) => {
      const payload: Record<string, unknown> = {};
      if (patch.company !== undefined) payload.company = patch.company.trim();
      if (patch.role !== undefined) payload.role = patch.role.trim();
      if (patch.level !== undefined) payload.level = patch.level?.trim() || null;
      if (patch.stage !== undefined) payload.stage = patch.stage;
      if (patch.postingUrl !== undefined) payload.posting_url = patch.postingUrl?.trim() || null;
      if (patch.companyDomain !== undefined) {
        payload.company_domain = patch.companyDomain?.trim() || null;
      }
      if (patch.jobDescription !== undefined) {
        payload.job_description = patch.jobDescription?.trim() || null;
      }
      if (patch.nextAction !== undefined) payload.next_action = patch.nextAction?.trim() || null;
      if (patch.nextActionAt !== undefined) payload.next_action_at = patch.nextActionAt || null;
      if (patch.resumeTailored !== undefined) payload.resume_tailored = patch.resumeTailored;

      const row = await unwrap<ApplicationWithCounts>(
        supabase.from("applications").update(payload).eq("id", id).select(SELECT).single(),
      );
      return toApplication(row);
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
      queryClient.invalidateQueries({ queryKey: keys.stageEvents(userId) });
    },
  });
}

/** The next stage in the pipeline, or null at the end of it. */
export function nextStage(stage: Stage): Stage | null {
  const i = STAGES.indexOf(stage);
  if (i < 0 || i >= STAGES.length - 1) return null;
  return STAGES[i + 1];
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (id: string) => {
      await unwrap<null>(supabase.from("applications").delete().eq("id", id));
      return id;
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
      queryClient.invalidateQueries({ queryKey: keys.stageEvents(userId) });
    },
  });
}
