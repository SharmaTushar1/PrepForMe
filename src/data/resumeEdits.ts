import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase, unwrap } from "../lib/supabase";
import type { ResumeEditRow, ResumeImprovementRow } from "../lib/db.types";
import { ai } from "../lib/ai";
import type {
  AnalysisProgress,
  ResumeEdit,
  ResumeEditStatus,
} from "../lib/ai";
import { useSession } from "../auth/SessionProvider";
import { keys } from "./queryKeys";

/**
 * The rewrite pass, from the browser's side.
 *
 * Two things here are deliberate and easy to undo by accident:
 *
 * 1. **Only the Edge Function writes suggestions.** This file reads them and
 *    changes their status. A client that could insert rows would be a client that
 *    could bypass the spend guards.
 * 2. **A sample never touches the database.** In local mode the pass returns
 *    fixtures with local ids; accepting one updates the cache and nothing else,
 *    so every state of this screen is reachable offline without writing rows that
 *    claim a model produced them.
 */

/**
 * How long a `running` pass is believed before it's treated as abandoned.
 *
 * Must match `PASS_LOCK_MS` in `supabase/functions/improve-resume`: that is the
 * window the function refuses a second run inside, so believing it for longer
 * strands the user in front of a spinner for a run that has already stopped, and
 * believing it for less offers a button the server would refuse.
 */
const IMPROVING_STALE_MS = 3 * 60 * 1000;

/** Local ids are prefixed, so nothing can try to update a fixture in Postgres. */
const SAMPLE_ID_PREFIX = "sample-edit";

function isSampleEdit(edit: ResumeEdit): boolean {
  return edit.id.startsWith(SAMPLE_ID_PREFIX);
}

function toEdit(row: ResumeEditRow): ResumeEdit {
  return {
    id: row.id,
    category: row.category,
    findingTitle: row.finding_title,
    original: row.original,
    suggested: row.suggested,
    note: row.note,
    hasBlank: row.has_blank,
    flag: row.flag,
    status: row.status,
  };
}

// ------------------------------------------------------------------ reading

export interface ResumeEditsState {
  /** Every suggestion for this report, in the order the model ranked them. */
  edits: ResumeEdit[];
  /** True while a pass started elsewhere — another tab, before a reload — runs. */
  running: boolean;
  /**
   * A pass has finished for this report. Distinct from `edits.length > 0`: a pass
   * that honestly found nothing worth rewriting is a result, and the screen has
   * to say so rather than offering the button again as though nothing happened.
   */
  completed: boolean;
  /** The message from the last pass that failed, or null. */
  failure: string | null;
  isPending: boolean;
  error: unknown;
}

/**
 * The suggestions for one report, plus whether a pass is in flight.
 *
 * Both halves come from one query because they answer one question the screen
 * asks — "is there anything to show, and is anything coming?" — and splitting
 * them would let the button and the list disagree for a render.
 */
export function useResumeEdits(reportId: string | null | undefined): ResumeEditsState {
  const { userId } = useSession();

  const query = useQuery({
    queryKey: keys.resumeEdits(userId ?? "anon", reportId ?? "none"),
    enabled: !!userId && !!reportId,
    // A pass outlives the request that started it, so a reload mid-run has to
    // find out when it lands. Polling stops once the lock window is past:
    // nothing is coming, and the screen goes back to offering the button.
    refetchInterval: (query) => {
      const state = query.state.data;
      return state?.running ? 4000 : false;
    },
    queryFn: async (): Promise<ResumeEditsState> => {
      const [edits, passes] = await Promise.all([
        unwrap<ResumeEditRow[]>(
          supabase
            .from("resume_edits")
            .select("*")
            .eq("report_id", reportId!)
            .order("sort_order", { ascending: true }),
        ),
        unwrap<ResumeImprovementRow[]>(
          supabase
            .from("resume_improvements")
            .select("*")
            .eq("report_id", reportId!)
            .order("created_at", { ascending: false })
            .limit(1),
        ),
      ]);

      const pass = passes.length > 0 ? passes[0] : null;
      const startedAt = pass ? Date.parse(pass.created_at) : NaN;
      const running = pass?.status === "running" &&
        !Number.isNaN(startedAt) &&
        Date.now() - startedAt < IMPROVING_STALE_MS;

      return {
        edits: edits.map(toEdit),
        running,
        completed: pass?.status === "done",
        // Only worth showing while there is nothing else to show. Once
        // suggestions exist, an older failure is noise.
        failure: pass?.status === "failed" && edits.length === 0
          ? pass.error
          : null,
        isPending: false,
        error: null,
      };
    },
  });

  return {
    edits: query.data?.edits ?? [],
    running: query.data?.running ?? false,
    completed: query.data?.completed ?? false,
    failure: query.data?.failure ?? null,
    isPending: !!reportId && query.isPending,
    error: query.error,
  };
}

// ------------------------------------------------------------------ the pass

export interface ImproveResumeInput {
  resumeId: string;
  /** The report the suggestions belong to. Null in local mode. */
  reportId: string | null;
  /** Replaces suggestions that already exist. Costs a model call. */
  force?: boolean;
}

export type ImproveProgressState = AnalysisProgress | null;

/**
 * Ask for rewrites of the lines the report found fault with.
 *
 * The result is written straight into the cache rather than invalidated, for the
 * same reason the analysis does it: the rows come back from the function with
 * their ids, so a refetch would be a second round trip to learn what is already
 * in hand — and in local mode there is nothing in the database to refetch.
 */
export function useImproveResume() {
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const [progress, setProgress] = useState<ImproveProgressState>(null);

  const mutation = useMutation({
    mutationFn: ({ resumeId, force = false }: ImproveResumeInput) =>
      ai.improveResume(resumeId, { force, onProgress: setProgress }),
    onSuccess: (improvement, { reportId }) => {
      if (!userId) return;
      const key = keys.resumeEdits(userId, reportId ?? "none");
      queryClient.setQueryData<ResumeEditsState>(key, {
        edits: improvement.edits,
        running: false,
        completed: true,
        failure: null,
        isPending: false,
        error: null,
      });
    },
    onError: (_error, { reportId }) => {
      if (!userId || !reportId) return;
      // The function records its own failure on the pass row, which carries a
      // better message than this side can produce — and releases the lock. This
      // only asks for the row again.
      queryClient.invalidateQueries({ queryKey: keys.resumeEdits(userId, reportId) });
    },
    onSettled: () => setProgress(null),
  });

  return { ...mutation, progress };
}

// ------------------------------------------------------------ accept, dismiss

export interface SetEditStatusInput {
  edit: ResumeEdit;
  status: ResumeEditStatus;
  /** Which list to update. Null in local mode, where the cache is the store. */
  reportId: string | null;
}

/**
 * Accept or dismiss one suggestion.
 *
 * Optimistic, and without a rollback on failure by design: the mutation writes
 * the new status into the cache immediately, and a failure invalidates the list
 * so the server's answer replaces it wholesale. Rolling back to a remembered
 * previous value would be the same thing with more code and one more way to be
 * wrong about what the row now says.
 */
export function useSetEditStatus() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({ edit, status }: SetEditStatusInput): Promise<void> => {
      if (isSampleEdit(edit)) return;
      await unwrap<null>(
        supabase.from("resume_edits").update({ status }).eq("id", edit.id),
      );
    },
    onMutate: ({ edit, status, reportId }) => {
      if (!userId) return;
      patchEdits(queryClient, userId, reportId, (current) =>
        current.map((row) => (row.id === edit.id ? { ...row, status } : row)),
      );
    },
    onError: (_error, { reportId }) => {
      if (!userId || !reportId) return;
      queryClient.invalidateQueries({ queryKey: keys.resumeEdits(userId, reportId) });
    },
  });
}

export interface AcceptAllEditsInput {
  edits: ResumeEdit[];
  reportId: string | null;
}

/**
 * Accept every suggestion that is safe to accept without reading it.
 *
 * Flagged rewrites are excluded here rather than filtered by the caller, because
 * this is the one place where a mistake would be invisible: "accept all" is
 * pressed by someone who has decided to trust the batch, and a rewrite carrying
 * a figure the resume never stated is precisely the one they have to check
 * themselves. Those stay `suggested` and keep their warning.
 */
export function useAcceptAllEdits() {
  const queryClient = useQueryClient();
  const { userId } = useSession();

  return useMutation({
    mutationFn: async ({ edits }: AcceptAllEditsInput): Promise<number> => {
      const safe = edits.filter(
        (edit) => edit.status === "suggested" && edit.flag === "",
      );
      if (safe.length === 0) return 0;

      const stored = safe.filter((edit) => !isSampleEdit(edit));
      if (stored.length > 0) {
        await unwrap<null>(
          supabase
            .from("resume_edits")
            .update({ status: "accepted" })
            .in("id", stored.map((edit) => edit.id)),
        );
      }
      return safe.length;
    },
    onMutate: ({ edits, reportId }) => {
      if (!userId) return;
      const accepting = new Set(
        edits
          .filter((edit) => edit.status === "suggested" && edit.flag === "")
          .map((edit) => edit.id),
      );
      patchEdits(queryClient, userId, reportId, (current) =>
        current.map((row) =>
          accepting.has(row.id) ? { ...row, status: "accepted" as const } : row,
        ),
      );
    },
    onError: (_error, { reportId }) => {
      if (!userId || !reportId) return;
      queryClient.invalidateQueries({ queryKey: keys.resumeEdits(userId, reportId) });
    },
  });
}

/** In-place edit of the cached list, leaving the rest of the state alone. */
function patchEdits(
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  reportId: string | null,
  update: (edits: ResumeEdit[]) => ResumeEdit[],
): void {
  const key = keys.resumeEdits(userId, reportId ?? "none");
  queryClient.setQueryData<ResumeEditsState>(key, (current) =>
    current ? { ...current, edits: update(current.edits) } : current,
  );
}
