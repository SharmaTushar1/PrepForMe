/**
 * Prep depth: how much a company's briefing room actually knows. A recap is
 * worth more than a source because it's first-hand and specific to the loop.
 */

export const DEPTH_LABELS = [
  "Cold start",
  "Getting started",
  "Building",
  "Solid",
  "Deep",
] as const;

/** Number of filled segments in the depth indicator. */
export const DEPTH_SEGMENTS = 5;

export function depthScore(sourceCount: number, recapCount: number): number {
  return sourceCount + recapCount * 2;
}

/** 0–5, where 5 fills the indicator. */
export function depthIndex(score: number): number {
  if (score <= 0) return 0;
  if (score <= 2) return 1;
  if (score <= 5) return 2;
  if (score <= 8) return 3;
  if (score <= 12) return 4;
  return 5;
}

export function depthLabel(score: number): string {
  return DEPTH_LABELS[Math.min(depthIndex(score), DEPTH_LABELS.length - 1)];
}

export const READINESS_LABELS = [
  "No prep yet",
  "Light",
  "Building",
  "Solid",
  "Strong",
] as const;

/**
 * Overall prep readiness across the roles still in play: 0–4, so it renders as
 * four segments like the design's meter.
 */
export function readinessIndex(scores: number[]): number {
  if (!scores.length) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg <= 0) return 0;
  if (avg < 3) return 1;
  if (avg < 6) return 2;
  if (avg < 10) return 3;
  return 4;
}

export function readinessLabel(scores: number[]): string {
  return READINESS_LABELS[readinessIndex(scores)];
}
