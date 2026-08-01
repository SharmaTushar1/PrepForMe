import type { CSSProperties } from "react";

/**
 * Parse a CSS declaration string (the exact form used in the source design's
 * inline `style="..."` attributes) into a React style object.
 *
 * This lets every screen be transcribed from the design 1:1 — the color values
 * (oklch, gradients), timings, and layout are preserved verbatim as strings, so
 * there is zero opportunity for a hand-retyped number to drift from the design.
 *
 *   <div style="padding:12px; background:oklch(0.55 0.15 255);">
 *     ->
 *   <div style={css("padding:12px; background:oklch(0.55 0.15 255);")}>
 *
 * Results are memoized by input string, so a given declaration is parsed once.
 */
const cache = new Map<string, CSSProperties>();

function toCamel(prop: string): string {
  const p = prop.trim();
  if (p.startsWith("--")) return p; // CSS custom property — keep as-is
  return p
    .replace(/^-ms-/, "ms-")
    .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function css(decl: string): CSSProperties {
  const cached = cache.get(decl);
  if (cached) return cached;

  const style: Record<string, string> = {};
  for (const raw of decl.split(";")) {
    const chunk = raw.trim();
    if (!chunk) continue;
    const idx = chunk.indexOf(":");
    if (idx === -1) continue;
    const prop = chunk.slice(0, idx).trim();
    const value = chunk.slice(idx + 1).trim();
    if (!prop) continue;
    // Later declarations win (mirrors CSS cascade for duplicate props).
    style[toCamel(prop)] = value;
  }

  const frozen = style as CSSProperties;
  cache.set(decl, frozen);
  return frozen;
}

/** Merge a parsed declaration string with extra dynamic properties. */
export function cssm(decl: string, extra: CSSProperties): CSSProperties {
  return { ...css(decl), ...extra };
}
