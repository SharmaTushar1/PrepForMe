import { css } from "../css";
import { useAiUsage, type Feature, type UsageStatus } from "../data/usage";

/**
 * What this feature costs against the plan, in one line.
 *
 * Shown *before* the button is pressed, which is the point of it. The Edge
 * Function refuses a spent allowance with a clear message either way, but a
 * refusal after a click is a worse way to learn the free tier includes one
 * analysis a month than a sentence next to the button saying so.
 *
 * The numbers come from `useAiUsage`, which counts the same ledger the function
 * counts using the same limits, so this cannot promise more than the server
 * allows.
 */
export function AllowanceNote({
  feature,
  noun,
}: {
  feature: Feature;
  /** What one unit is called here: "analysis", "rewrite pass", "message". */
  noun: string;
}) {
  const usage = useAiUsage(feature);

  // Nothing while the count is in flight: a line that reads "0 left" for a moment
  // and then corrects itself would stop anyone trusting it.
  if (!usage.isSuccess) return null;

  return (
    <div
      style={css(
        `font-size:12px; line-height:1.55; margin-top:12px; color:${
          usage.exhausted ? "oklch(0.5 0.14 25)" : "oklch(0.5 0.015 260)"
        };`,
      )}
    >
      {allowanceSentence(usage.status, noun)}
    </div>
  );
}

/**
 * The sentence itself, exported so a page can place it somewhere this component's
 * spacing doesn't suit.
 */
export function allowanceSentence(status: UsageStatus, noun: string): string {
  const { limit, remaining, periodNoun: period } = status;

  if (remaining <= 0) {
    return `That's this ${period}'s ${noun} used. Your allowance resets on ${resetDate(status)}.`;
  }
  if (limit === 1) {
    return `Your plan includes one ${noun} a ${period}, and you haven't used this ${period}'s.`;
  }
  // The noun is deliberately left out of the counted form. "analysis" pluralises
  // to "analyses", "pass" to "passes", and getting that right for every caller is
  // more machinery than the sentence is worth.
  return `${remaining} of ${limit} left this ${period}.`;
}

/** "12 September", in UTC, which is the boundary the allowance actually resets on. */
function resetDate(status: UsageStatus): string {
  return status.resetsAt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}
