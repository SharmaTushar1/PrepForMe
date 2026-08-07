import type { ParsedResume, ParsedResumeEntry, ResumeEdit } from "../ai/types";

/**
 * Substituting accepted rewrites into a parse.
 *
 * Pure, and separate from both the UI and the renderers, because it is the step
 * where someone's resume changes: a bug here silently sends different words to an
 * employer than the ones on screen. Matching is on the text of the line rather
 * than on any index into the parse, so a rewrite can never land on the wrong
 * bullet — the worst outcome available, and the one an index-based scheme reaches
 * the moment a report is regenerated against an edited resume.
 *
 * A rewrite that matches nothing is reported rather than dropped quietly. That
 * happens when the resume has been re-uploaded and re-analyzed since the
 * suggestions were written, and the honest answer is to say the line is gone.
 */

/**
 * The comparison key, which must stay identical to `matchKey` in
 * `supabase/functions/_shared/validate.ts`. That function normalises the model's
 * quotation and stores the parse's own copy of the line, so the two keys are
 * computed on both sides of the network and have to agree — differ here and every
 * accepted rewrite becomes one that "no longer appears in your resume".
 */
function matchKey(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:\u2026]+$/, "")
    .toLowerCase();
}

export interface AppliedEdits {
  /** The parse with accepted rewrites substituted in. */
  parsed: ParsedResume;
  /** How many landed. */
  applied: number;
  /** Accepted rewrites whose line is no longer in the parse. */
  missing: ResumeEdit[];
  /**
   * Accepted rewrites that still contain a blank. A rebuilt document is fine to
   * generate with these in it, but nobody should send one, so every surface that
   * offers the download has to say so.
   */
  blanks: ResumeEdit[];
}

/**
 * Apply every accepted rewrite. Anything still `suggested` or `dismissed` is
 * ignored, so what a rebuilt document contains is exactly what the user ticked.
 */
export function applyAcceptedEdits(
  parsed: ParsedResume,
  edits: readonly ResumeEdit[],
): AppliedEdits {
  const accepted = edits.filter((edit) => edit.status === "accepted");
  if (accepted.length === 0) {
    return { parsed, applied: 0, missing: [], blanks: [] };
  }

  const byKey = new Map<string, ResumeEdit>();
  for (const edit of accepted) {
    const key = matchKey(edit.original);
    // First wins, matching the server, which stores one rewrite per line.
    if (!byKey.has(key)) byKey.set(key, edit);
  }

  const landed = new Set<string>();
  const swap = (line: string): string => {
    const key = matchKey(line);
    const edit = byKey.get(key);
    if (!edit) return line;
    landed.add(key);
    return edit.suggested;
  };

  // Reports stored before the parse captured summary, education, projects and
  // certifications have no such keys at all, so every section is read
  // defensively and an absent one is handed back exactly as absent. Filling it
  // with an empty array instead would be worse than crashing: the rebuild reads
  // those same fields to decide whether it holds a whole resume, and a parse
  // that claims "no education" is one it would happily render without any.
  const swapEntries = (entries: ParsedResumeEntry[]): ParsedResumeEntry[] =>
    Array.isArray(entries)
      ? entries.map((entry) => ({
          ...entry,
          lines: Array.isArray(entry.lines) ? entry.lines.map(swap) : entry.lines,
        }))
      : entries;

  const next: ParsedResume = {
    ...parsed,
    summary: typeof parsed.summary === "string" ? swap(parsed.summary) : parsed.summary,
    experiences: Array.isArray(parsed.experiences)
      ? parsed.experiences.map((role) => ({
          ...role,
          bullets: Array.isArray(role.bullets) ? role.bullets.map(swap) : role.bullets,
        }))
      : parsed.experiences,
    education: swapEntries(parsed.education),
    projects: swapEntries(parsed.projects),
    certifications: swapEntries(parsed.certifications),
  };

  const missing = accepted.filter(
    (edit) => !landed.has(matchKey(edit.original)),
  );
  const blanks = accepted.filter(
    (edit) => edit.hasBlank && landed.has(matchKey(edit.original)),
  );

  return { parsed: next, applied: landed.size, missing, blanks };
}
