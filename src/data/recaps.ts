import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import type { RecapRow } from "../lib/db.types";
import type { Recap, RecapDraft } from "../types";
import { useSession } from "../auth/SessionProvider";
import { keys } from "./queryKeys";

function toRecap(row: RecapRow): Recap {
  return {
    id: row.id,
    applicationId: row.application_id,
    roundType: row.round_type,
    roundNumber: row.round_number,
    questions: row.questions,
    outcome: row.outcome,
    notes: row.notes,
    occurredOn: row.occurred_on,
    createdAt: row.created_at,
  };
}

export function useRecaps(applicationId: string | undefined) {
  const { userId } = useSession();
  return useQuery({
    queryKey: keys.recaps(userId ?? "anon", applicationId ?? "none"),
    enabled: !!userId && !!applicationId,
    queryFn: async (): Promise<Recap[]> => {
      const rows = await unwrap<RecapRow[]>(
        supabase
          .from("recaps")
          .select("*")
          .eq("application_id", applicationId!)
          .order("occurred_on", { ascending: false })
          .order("created_at", { ascending: false }),
      );
      return rows.map(toRecap);
    },
  });
}

export function useCreateRecap() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async (draft: RecapDraft): Promise<Recap> => {
      // Rounds are numbered by how many recaps this role already has.
      const existing = await unwrap<{ id: string }[]>(
        supabase.from("recaps").select("id").eq("application_id", draft.applicationId),
      );

      const row = await unwrap<RecapRow>(
        supabase
          .from("recaps")
          .insert({
            application_id: draft.applicationId,
            round_type: draft.roundType,
            round_number: draft.roundNumber ?? existing.length + 1,
            questions: draft.questions.trim() || null,
            outcome: draft.outcome,
            notes: draft.notes.trim() || null,
            occurred_on: draft.occurredOn || undefined,
          })
          .select("*")
          .single(),
      );
      return toRecap(row);
    },
    onSuccess: (recap) => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.recaps(userId, recap.applicationId) });
      // Recap counts feed prep depth and the needs-attention queue.
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
    },
  });
}

export function useDeleteRecap() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({ id }: { id: string; applicationId: string }) => {
      await unwrap<null>(supabase.from("recaps").delete().eq("id", id));
    },
    onSuccess: (_data, { applicationId }) => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: keys.recaps(userId, applicationId) });
      queryClient.invalidateQueries({ queryKey: keys.applications(userId) });
    },
  });
}

export const OUTCOME_LABELS: Record<string, string> = {
  rough: "was rough",
  ok: "went okay",
  went_well: "went well",
};
