import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useSession } from "../auth/SessionProvider";
import { useSettings } from "./settings";
import { keys } from "./queryKeys";
import {
  allowanceFor,
  periodEnd,
  periodNoun,
  periodStart,
  type Feature,
  type Period,
} from "../../supabase/functions/_shared/plans.ts";

export type { Feature } from "../../supabase/functions/_shared/plans.ts";

/**
 * What the user has left of a metered feature.
 *
 * Read straight from `ai_usage`, the same ledger the Edge Function counts, using
 * the same limits from the same file. Nothing here enforces anything — the
 * function refuses, and it does so whatever this says — but a number shown that
 * disagrees with the number applied is worse than showing none, so the arithmetic
 * is imported rather than repeated.
 *
 * `plan` comes from `useSettings`, which reads `user_settings`. That column is no
 * longer client-writable (migration 0006 narrowed the grant), so the displayed
 * plan and the enforced one cannot diverge either.
 */
export interface UsageStatus {
  feature: Feature;
  limit: number;
  used: number;
  remaining: number;
  period: Period;
  /** "day" / "month", for a sentence. */
  periodNoun: string;
  /** When the allowance refills. */
  resetsAt: Date;
}

export function useAiUsage(feature: Feature) {
  const { userId } = useSession();
  const { settings } = useSettings();
  const allowance = allowanceFor(settings.plan, feature);

  const query = useQuery({
    queryKey: keys.aiUsage(userId ?? "anon", feature),
    enabled: !!userId,
    queryFn: async (): Promise<number> => {
      // head + exact: the rows themselves are of no interest, only how many.
      const { count, error } = await supabase
        .from("ai_usage")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId!)
        .eq("feature", feature)
        .gte("created_at", periodStart(allowance.period).toISOString());

      if (error) throw error;
      return count ?? 0;
    },
  });

  const used = query.data ?? 0;
  const status: UsageStatus = {
    feature,
    limit: allowance.limit,
    used,
    remaining: Math.max(0, allowance.limit - used),
    period: allowance.period,
    periodNoun: periodNoun(allowance.period),
    resetsAt: periodEnd(allowance.period),
  };

  return {
    ...query,
    status,
    /**
     * False while the count is still loading, so a button is never disabled on
     * the strength of a number that hasn't arrived. The function is the authority
     * on this, so an optimistic UI here costs one refused request at worst.
     */
    exhausted: query.isSuccess && status.remaining <= 0,
  };
}
