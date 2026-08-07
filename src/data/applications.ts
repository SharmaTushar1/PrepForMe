import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import type { ApplicationRow, StageEventRow } from "../lib/db.types";
import type {
  Application,
  ApplicationDraft,
  EmploymentType,
  ResumeFields,
  ResumeTemplateId,
  Stage,
  TailorSession,
} from "../types";
import { STAGES } from "../data";
import { useSession } from "../auth/SessionProvider";
import { normaliseCompany } from "../lib/company";
import {
  isResumeTemplateId,
  parseStoredTailored,
  serializeTailored,
} from "../lib/resume/templates";
import { keys } from "./queryKeys";

/**
 * Child ids are selected alongside each row so counts come back in one round
 * trip without depending on PostgREST aggregate support. `scope` rides along
 * because a company-scope source counts for every role at that company — see
 * `countSources`. Catalog embed supplies LinkedIn org id for referral search.
 */
type ApplicationWithCounts = ApplicationRow & {
  recaps: { id: string }[] | null;
  prep_sources: { id: string; scope: string | null }[] | null;
  catalog_companies: { linkedin_company_id: string | null } | null;
};

const SELECT =
  "*, recaps(id), prep_sources(id, scope), catalog_companies(linkedin_company_id)";

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
  const tailored = parseStoredTailored(row.tailored_resume);
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    level: row.level,
    stage: row.stage,
    postingUrl: row.posting_url,
    companyDomain: row.company_domain ?? null,
    companyId: row.company_id ?? null,
    roleId: row.role_id ?? null,
    levelId: row.level_id ?? null,
    specialty: row.specialty ?? null,
    employmentType: row.employment_type ?? null,
    linkedinCompanyId: row.catalog_companies?.linkedin_company_id ?? null,
    templateId: isResumeTemplateId(row.template_id) ? row.template_id : null,
    tailoredResume: tailored.fields,
    tailorSession: tailored.session,
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
 * Prefer catalog company_id for sibling matching; fall back to normalised
 * display name for customs.
 */
function companyKey(row: ApplicationWithCounts): string {
  return row.company_id ?? normaliseCompany(row.company);
}

function countSources(rows: ApplicationWithCounts[]): Map<string, number> {
  const companyWide = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = companyKey(row);
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
    const shared = companyWide.get(companyKey(row)) ?? new Set<string>();
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

function draftPayload(draft: ApplicationDraft) {
  return {
    company: draft.company.trim(),
    role: draft.role.trim(),
    level: draft.level?.trim() || null,
    company_id: draft.companyId || null,
    role_id: draft.roleId || null,
    level_id: draft.levelId || null,
    specialty: draft.specialty?.trim() || null,
    employment_type: draft.employmentType || null,
    stage: draft.stage ?? "Saved",
    posting_url: draft.postingUrl?.trim() || null,
    company_domain:
      draft.companyDomain?.trim() ||
      guessCompanyDomain(draft.postingUrl) ||
      null,
    job_description: draft.jobDescription?.trim() || null,
    next_action: draft.nextAction?.trim() || null,
    next_action_at: draft.nextActionAt || null,
  };
}

export function useCreateApplication() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (draft: ApplicationDraft): Promise<Application> => {
      const row = await unwrap<ApplicationWithCounts>(
        supabase.from("applications").insert(draftPayload(draft)).select(SELECT).single(),
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
  companyId?: string | null;
  roleId?: string | null;
  levelId?: string | null;
  specialty?: string | null;
  employmentType?: EmploymentType | null;
  stage?: Stage;
  postingUrl?: string | null;
  companyDomain?: string | null;
  jobDescription?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  resumeTailored?: boolean;
  templateId?: ResumeTemplateId | null;
  /** Fields for the PDF; write with `tailorSession` so the Materials tab can restore. */
  tailoredResume?: ResumeFields | null;
  /** Pass with `tailoredResume` (or alone to update briefs / clear skill gaps). */
  tailorSession?: TailorSession | null;
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
      if (patch.companyId !== undefined) payload.company_id = patch.companyId || null;
      if (patch.roleId !== undefined) payload.role_id = patch.roleId || null;
      if (patch.levelId !== undefined) payload.level_id = patch.levelId || null;
      if (patch.specialty !== undefined) payload.specialty = patch.specialty?.trim() || null;
      if (patch.employmentType !== undefined) {
        payload.employment_type = patch.employmentType || null;
      }
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
      if (patch.templateId !== undefined) payload.template_id = patch.templateId;
      if (patch.tailoredResume !== undefined || patch.tailorSession !== undefined) {
        if (patch.tailoredResume === null) {
          payload.tailored_resume = null;
        } else if (patch.tailoredResume !== undefined) {
          payload.tailored_resume = serializeTailored(
            patch.tailoredResume,
            patch.tailorSession ?? null,
          );
        } else {
          // Session-only update: re-wrap existing fields from the row we are about
          // to overwrite is impossible here, so callers must pass fields too.
          throw new Error("tailorSession updates require tailoredResume");
        }
      }

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
