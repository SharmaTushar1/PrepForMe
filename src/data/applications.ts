import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import type { ApplicationRow, StageEventRow } from "../lib/db.types";
import type { Application, ApplicationDraft, Stage } from "../types";
import { STAGES } from "../data";
import { useSession } from "../auth/SessionProvider";
import { keys } from "./queryKeys";

/**
 * Child ids are selected alongside each row so counts come back in one round
 * trip without depending on PostgREST aggregate support.
 */
type ApplicationWithCounts = ApplicationRow & {
  recaps: { id: string }[] | null;
  prep_sources: { id: string }[] | null;
};

const SELECT = "*, recaps(id), prep_sources(id)";

function toApplication(row: ApplicationWithCounts): Application {
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    level: row.level,
    stage: row.stage,
    postingUrl: row.posting_url,
    jobDescription: row.job_description,
    nextAction: row.next_action,
    nextActionAt: row.next_action_at,
    appliedAt: row.applied_at,
    resumeTailored: row.resume_tailored,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sourceCount: row.prep_sources?.length ?? 0,
    recapCount: row.recaps?.length ?? 0,
  };
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
      return rows.map(toApplication);
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
