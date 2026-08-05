import type { SupabaseClient } from "npm:@supabase/supabase-js@2.109.0";
import { HttpError } from "./model.ts";
import {
  allowanceFor,
  periodEnd,
  periodNoun,
  periodStart,
  type Feature,
  type Plan,
} from "./plans.ts";

/**
 * The allowance check, and the ledger entry that spends one.
 *
 * Two calls, in this order, around every request that reaches the model:
 *
 *   await assertUnderAllowance(client, userId, "resume_analysis");
 *   …every other free refusal…
 *   await spendAllowance(client, userId, "resume_analysis", resumeId);
 *   …the model call…
 *
 * The gap between them is deliberate and is the whole design. **The check reads
 * the ledger; the model call is what writes to it.** So the sequence has to be
 * arranged so that everything capable of refusing for free happens in between —
 * a resume already analyzed, one already running, too many pages, an oversized
 * file. A user who trips any of those has spent nothing and is charged nothing,
 * which at an allowance of one a month is the difference between a limit and a
 * grievance.
 *
 * What this replaced counted rows in `resume_reports`, i.e. analyses that
 * *succeeded*. That is fine at ten a day and unusable at one a month: a call that
 * fails after Anthropic has answered writes no report, so it left no trace and
 * could be repeated indefinitely at full price. Counting attempts costs the user
 * their allowance on a failed run, which is the less bad of the two — and is why
 * `spendAllowance` sits as late as it possibly can.
 */

/** What is left, and when it comes back. Shown to the user, so no jargon. */
export interface AllowanceStatus {
  feature: Feature;
  plan: Plan;
  limit: number;
  used: number;
  remaining: number;
  /** When the allowance refills, ISO 8601. */
  resetsAt: string;
}

/**
 * Refuse with a 429 if this user has no allowance left for `feature`.
 *
 * Returns the status when there is room, so a caller can report it without a
 * second round trip.
 */
export async function assertUnderAllowance(
  client: SupabaseClient,
  userId: string,
  feature: Feature,
): Promise<AllowanceStatus> {
  const status = await allowanceStatus(client, userId, feature);

  if (status.remaining <= 0) {
    const noun = periodNoun(allowanceFor(status.plan, feature).period);
    throw new HttpError(
      status.limit === 1
        ? `Your ${status.plan} plan includes one ${label(feature)} a ${noun}, and this ${noun}'s is used. It resets on ${describe(status.resetsAt)}.`
        : `You have used all ${status.limit} of this ${noun}'s ${label(feature)}s. They reset on ${describe(status.resetsAt)}.`,
      429,
    );
  }
  return status;
}

/** Read the allowance without refusing, for callers that only want to report it. */
export async function allowanceStatus(
  client: SupabaseClient,
  userId: string,
  feature: Feature,
): Promise<AllowanceStatus> {
  const plan = await readPlan(client, userId);
  const { limit, period } = allowanceFor(plan, feature);

  const { count, error } = await client
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", periodStart(period).toISOString());

  if (error) {
    console.error(`could not count ${feature} usage`, error);
    throw new HttpError("Could not check your plan. Please try again.", 500);
  }

  const used = count ?? 0;
  return {
    feature,
    plan,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetsAt: periodEnd(period).toISOString(),
  };
}

/**
 * Spend one, by recording the attempt.
 *
 * Call this immediately before the model call and nowhere else. A failure to
 * write it is *not* survivable: if the ledger silently dropped entries the
 * allowance would not exist, so this refuses the run rather than proceeding
 * uncounted.
 */
export async function spendAllowance(
  client: SupabaseClient,
  userId: string,
  feature: Feature,
  subjectId: string | null = null,
): Promise<void> {
  const { error } = await client
    .from("ai_usage")
    .insert({ user_id: userId, feature, subject_id: subjectId });

  if (error) {
    console.error(`could not record ${feature} usage`, error);
    throw new HttpError("Could not start this. Please try again.", 500);
  }
}

/**
 * The user's plan, defaulting to `free`.
 *
 * A missing settings row means `free` rather than an error: `useSettings` heals
 * the row on next load, and the safe reading of "no plan on record" is the
 * smallest allowance. `plan` is not client-writable — see
 * `0006_ai_quota.sql`, which narrows the column grant — so this can be trusted.
 */
async function readPlan(
  client: SupabaseClient,
  userId: string,
): Promise<Plan> {
  const { data, error } = await client
    .from("user_settings")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("could not read the plan", error);
    throw new HttpError("Could not check your plan. Please try again.", 500);
  }
  return data?.plan === "pro" ? "pro" : "free";
}

function label(feature: Feature): string {
  switch (feature) {
    case "resume_analysis":
      return "resume analysis";
    case "resume_rewrite":
      return "resume rewrite";
    case "chat":
      return "chat";
  }
}

/** "12 September" — a date the user can act on, without a timezone lecture. */
function describe(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
