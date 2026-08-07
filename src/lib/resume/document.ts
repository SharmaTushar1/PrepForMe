import type { ParsedResume, ParsedResumeEntry } from "../ai/types";

/**
 * The one description of what a rebuilt resume contains, in what order.
 *
 * Both renderers — DOCX and PDF — consume this and nothing else, so they cannot
 * quietly disagree about whether certifications made it in or where the skills
 * line goes. It is a flat list rather than a tree because that is what an ATS
 * reduces any resume to anyway: a single stream of lines, read top to bottom.
 * Building the flat version deliberately is the whole point of the exercise.
 *
 * Nothing here writes prose. Every string is either the candidate's own text,
 * copied from the parse, or a section heading from a fixed set. A rebuild that
 * invented a summary or padded a bullet would be a rebuild the candidate cannot
 * defend in an interview.
 */
export type ResumeBlock =
  /** The candidate's name, once, at the top of the first page. */
  | { kind: "name"; text: string }
  /** Contact details and links on one line, in the body — never a page header. */
  | { kind: "contact"; text: string }
  /** A section heading from `SECTION_ORDER`. */
  | { kind: "heading"; text: string }
  /** A role or entry: what it was, and when, on adjacent lines. */
  | { kind: "subheading"; text: string; meta: string }
  | { kind: "paragraph"; text: string }
  | { kind: "bullet"; text: string };

export interface ResumeDocument {
  /** For the download filename, without an extension. */
  fileStem: string;
  blocks: ResumeBlock[];
}

/**
 * Section order, and the reasoning, since this is the one place a rebuild
 * changes something other than presentation.
 *
 * Skills sits high: it is a compact keyword line that costs three lines and
 * serves both the recruiter's six-second skim and the recruiter's later keyword
 * search of their own database. Everything after Experience is in the order
 * candidates conventionally use, and reverse-chronological Experience is the
 * order every parser is built around.
 *
 * The UI states this order before anyone downloads anything, so a rebuild is
 * never a surprise rearrangement of someone's document.
 */
export const SECTION_ORDER = [
  "Summary",
  "Skills",
  "Experience",
  "Education",
  "Projects",
  "Certifications",
] as const;

/**
 * "Mar 2021 – Present" from the ISO pair the parse normalised.
 *
 * Month and year, because that is what resumes print and what a reader expects;
 * `dateRange` in `lib/format` gives years only, which is right for a tracker row
 * and wrong on a resume. Parsed in UTC on purpose: a local-time reading of
 * `2021-03-01` lands in February west of Greenwich, and silently ageing every
 * role on someone's resume by a month is exactly the kind of quiet corruption
 * this rebuild exists to avoid.
 */
export function monthRange(start: string | null, end: string | null): string {
  const from = monthLabel(start);
  const to = end === null ? "Present" : monthLabel(end);
  if (!from && !to) return "";
  if (!from) return to;
  // An end date that failed to parse is left out rather than shown as "Present",
  // which would claim the candidate still works somewhere they may not.
  return to ? `${from} – ${to}` : from;
}

function monthLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "Tushar Sharma Resume" → the stem of the downloaded file. */
function fileStem(parsed: ParsedResume): string {
  const name = (parsed.fullName ?? "").trim();
  const stem = name === "" ? "Resume" : `${name} Resume`;
  // Anything a filesystem or a Content-Disposition header would argue about.
  return stem.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ");
}

/**
 * Flatten a parse into the document to render.
 *
 * Empty sections are omitted entirely rather than printed with a heading and
 * nothing under them: a heading over blank space reads as a mistake in the
 * rebuild, when in fact the resume simply had no projects.
 */
export function buildResumeDocument(parsed: ParsedResume): ResumeDocument {
  const blocks: ResumeBlock[] = [];

  if (parsed.fullName) blocks.push({ kind: "name", text: parsed.fullName });

  const contact = [
    parsed.email,
    parsed.location,
    ...parsed.links.map((link) => link.url),
  ].filter((part): part is string => !!part && part.trim() !== "");
  if (contact.length > 0) {
    // Bare URLs rather than "LinkedIn: <url>": the label is redundant to a human
    // reading linkedin.com/in/… and is one more token for a parser to mis-split.
    blocks.push({ kind: "contact", text: contact.join(" · ") });
  }

  if (parsed.summary) {
    blocks.push({ kind: "heading", text: "Summary" });
    blocks.push({ kind: "paragraph", text: parsed.summary });
  }

  if (parsed.skills.length > 0) {
    blocks.push({ kind: "heading", text: "Skills" });
    // One comma-separated line, not a grid: a table cell is the single most
    // common reason a parser loses a skills section.
    blocks.push({ kind: "paragraph", text: parsed.skills.join(", ") });
  }

  if (parsed.experiences.length > 0) {
    blocks.push({ kind: "heading", text: "Experience" });
    for (const role of parsed.experiences) {
      blocks.push({
        kind: "subheading",
        text: [role.title, role.company].filter((part) => part.trim() !== "").join(" · "),
        meta: monthRange(role.startDate, role.endDate),
      });
      for (const bullet of role.bullets) {
        blocks.push({ kind: "bullet", text: bullet });
      }
    }
  }

  pushEntries(blocks, "Education", parsed.education);
  pushEntries(blocks, "Projects", parsed.projects);
  pushEntries(blocks, "Certifications", parsed.certifications);

  return { fileStem: fileStem(parsed), blocks };
}

function pushEntries(
  blocks: ResumeBlock[],
  heading: string,
  entries: ParsedResumeEntry[],
): void {
  if (entries.length === 0) return;
  blocks.push({ kind: "heading", text: heading });
  for (const entry of entries) {
    blocks.push({
      kind: "subheading",
      text: [entry.title, entry.organization]
        .filter((part) => part.trim() !== "")
        .join(" · "),
      // Verbatim, exactly as the resume printed it — see `ParsedResumeEntry`.
      meta: entry.dateRange,
    });
    for (const line of entry.lines) {
      blocks.push({ kind: "bullet", text: line });
    }
  }
}

/**
 * What the candidate is told a rebuild will and will not do, kept next to the
 * code that decides it so the promise and the behaviour move together.
 */
export const REBUILD_EFFECTS = {
  fixes: [
    "One column, top to bottom, so there is no reading order for a parser to get wrong.",
    "Contact details in the body of the first page instead of a header or footer.",
    "Plain text headings — no tables, text boxes, columns, icons or images anywhere in the file.",
    "A real text layer, so the file can be searched and extracted rather than looked at.",
  ],
  leaves: [
    "Your wording. Every bullet, date and skill is copied across as it is written now, apart from rewrites you accepted above.",
    "What the resume says about you — nothing is added, removed, shortened or invented.",
    "Facts the resume never stated. An accepted rewrite that needed a number you haven't given leaves a blank rather than filling one in.",
  ],
} as const;
