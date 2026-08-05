/**
 * What each plan is allowed, in one place.
 *
 * This file is imported by **both** halves of the app: the Edge Functions, which
 * enforce it, and `src/`, which shows it. That is the whole point of it existing.
 * A limit written twice becomes a limit displayed as one number and applied as
 * another, and the version the user believes is always the generous one.
 *
 * It lives under `supabase/functions/_shared/` rather than `src/` because the
 * deploy bundle can only follow imports inside `supabase/functions/`, while Vite
 * is happy to reach anywhere in the project. So the constraint is one-directional
 * and this is the only end that satisfies both.
 *
 * Keep it free of imports and of anything platform-specific — no `Deno`, no
 * `import.meta`, no DOM. It has to typecheck and run unchanged in both runtimes.
 */

/** Mirrors the `check (plan in ('free', 'pro'))` on `user_settings.plan`. */
export type Plan = "free" | "pro";

/**
 * A metered capability. These strings are stored in `ai_usage.feature`, so they
 * are data: renaming one orphans the history it was counting and silently
 * refills every user's allowance.
 */
export type Feature = "resume_analysis" | "resume_rewrite" | "chat";

/** How an allowance is measured out. Both reset in UTC, matching the database. */
export type Period = "day" | "month";

export interface Allowance {
  /** Billed attempts permitted per period. */
  readonly limit: number;
  readonly period: Period;
}

/**
 * Deliberately not "requests per month" across the board.
 *
 * An analysis is the expensive call — roughly ten cents of Sonnet for a two-page
 * PDF — and one a month is the free tier. The rewrite pass is cheaper but only
 * exists to act on a report, so it gets its own allowance of the same size
 * rather than sharing one counter: a user who has spent their analysis should
 * still be able to ask for the rewrites that go with it.
 *
 * Chat is per day because it is conversational — a monthly number would be spent
 * in one sitting and the feature would appear broken for four weeks.
 */
export const PLAN_ALLOWANCES: Record<Plan, Record<Feature, Allowance>> = {
  free: {
    resume_analysis: { limit: 1, period: "month" },
    resume_rewrite: { limit: 1, period: "month" },
    chat: { limit: 5, period: "day" },
  },
  pro: {
    // Not "unlimited". Pro is a paying user, not a blank cheque, and these are
    // still real model calls against one API key. High enough that nobody using
    // the product as intended will meet them; low enough to bound a stuck client.
    resume_analysis: { limit: 30, period: "month" },
    resume_rewrite: { limit: 60, period: "month" },
    chat: { limit: 100, period: "day" },
  },
};

export function allowanceFor(plan: Plan, feature: Feature): Allowance {
  return PLAN_ALLOWANCES[plan][feature];
}

/**
 * The inclusive start of the current period, in UTC.
 *
 * Shared so the count and the "resets on" line the user reads are derived from
 * the same arithmetic. UTC, not local time, because it has to agree with
 * `now()` on the database.
 */
export function periodStart(period: Period, now: Date = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  if (period === "month") start.setUTCDate(1);
  return start;
}

/** The exclusive end of the current period: when the allowance refills. */
export function periodEnd(period: Period, now: Date = new Date()): Date {
  const start = periodStart(period, now);
  const end = new Date(start);
  if (period === "month") end.setUTCMonth(end.getUTCMonth() + 1);
  else end.setUTCDate(end.getUTCDate() + 1);
  return end;
}

/** "a day" / "a month", for sentences built around an allowance. */
export function periodNoun(period: Period): string {
  return period === "month" ? "month" : "day";
}
