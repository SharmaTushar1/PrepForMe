import {
  ATS_CATEGORY_IDS,
  ATS_LAYOUTS,
  CATEGORY_SPECS,
  type AtsCategories,
  type AtsCategory,
  type AtsCategoryId,
  type AtsFinding,
  type AtsLayout,
  type AtsReport,
  type AtsSeverity,
  type AtsTopFix,
  type ParsedResume,
  type ParsedResumeEntry,
  type ParsedResumeExperience,
  type ParsedResumeLink,
  type ResumeEditDraft,
  type RewritableLine,
} from "./schema.ts";

/**
 * What the schema cannot promise, checked here.
 *
 * Structured outputs constrain the shape but not the values: numeric ranges are
 * dropped from the schema entirely, and enum casing is explicitly not
 * guaranteed. So scores arrive unbounded and could violate the
 * `check (overall_score between 0 and 100)` on the reports table, and a
 * severity could arrive as "Critical".
 *
 * The bias throughout is repair over rejection. By the time this runs the
 * tokens are already paid for, so anything recoverable is recovered and only a
 * genuinely unusable response — a missing category, a non-numeric score —
 * throws.
 */
export class AnalysisFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisFormatError";
  }
}

const SEVERITIES: readonly AtsSeverity[] = ["critical", "warning", "pass"];
const CATEGORY_LABELS = new Map(CATEGORY_SPECS.map((s) => [s.id, s.label]));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null {
  const trimmed = text(value);
  return trimmed === "" ? null : trimmed;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** 0–100 integer. Out of range is clamped; not a number at all is fatal. */
function score(value: unknown, field: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new AnalysisFormatError(
      `The analysis came back without a usable ${field}. Please try again.`,
    );
  }
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

/** Case-insensitive, per the documented enum-casing caveat. */
function severity(value: unknown): AtsSeverity {
  const lowered = text(value).toLowerCase();
  const match = SEVERITIES.find((s) => s === lowered);
  // An unreadable severity is not worth discarding a finding over, and
  // "warning" is the reading that neither overstates nor hides it.
  return match ?? "warning";
}

function categoryId(value: unknown): AtsCategoryId | null {
  const lowered = text(value).toLowerCase();
  return ATS_CATEGORY_IDS.find((id) => id === lowered) ?? null;
}

function finding(raw: unknown): AtsFinding | null {
  if (!isRecord(raw)) return null;

  const title = text(raw.title);
  const detail = text(raw.detail);
  if (title === "" && detail === "") return null;

  const level = severity(raw.severity);
  // `fix` is required by the schema, so a blank one means the model went off
  // contract. Falling back to the detail keeps the card honest — it is still
  // the model's own words about this resume — rather than inserting generic
  // advice the finding never made.
  const fix = text(raw.fix) ||
    detail ||
    (level === "pass" ? "Leave this as it is." : "");

  const evidence = text(raw.evidence);

  return {
    severity: level,
    title: title || detail.slice(0, 80),
    detail,
    fix,
    // Absent rather than empty: `AtsFinding.evidence` is optional, and the
    // schema only asks for a required empty string because an optional property
    // is one of the two things that inflate grammar compilation.
    ...(evidence === "" ? {} : { evidence }),
  };
}

function category<Id extends AtsCategoryId>(
  id: Id,
  raw: unknown,
): AtsCategory<Id> {
  const source = isRecord(raw) ? raw : {};
  return {
    // Taken from the id this entry was filed under rather than re-read from the
    // payload, so a category cannot reach the UI claiming to be a different one.
    id,
    // Not on the wire at all: it is this app's heading for the card.
    label: CATEGORY_LABELS.get(id) ?? id,
    score: score(source.score, `score for ${CATEGORY_LABELS.get(id) ?? id}`),
    summary: text(source.summary),
    findings: array(source.findings)
      .map(finding)
      .filter((f): f is AtsFinding => f !== null),
  };
}

/**
 * The report arrives as an array of seven entries and is stored as an object
 * keyed by id, which is what every screen indexes.
 *
 * The array is the shape the model is given: seven sibling properties, each
 * inlining the same finding object, compiled into a grammar too large for
 * structured outputs to accept. A keyed object is still tolerated on the way in
 * — it costs nine lines and it is the shape a future schema revision is most
 * likely to drift back to.
 */
function categories(raw: unknown): AtsCategories {
  const byId = new Map<AtsCategoryId, unknown>();

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isRecord(entry)) continue;
      const id = categoryId(entry.id);
      // First writing wins: a duplicated category is the model repeating
      // itself, and the later copy is not more trustworthy than the earlier.
      if (id && !byId.has(id)) byId.set(id, entry);
    }
  } else if (isRecord(raw)) {
    for (const id of ATS_CATEGORY_IDS) {
      if (isRecord(raw[id])) byId.set(id, raw[id]);
    }
  }

  const missing = ATS_CATEGORY_IDS.filter((id) => !byId.has(id));
  if (missing.length > 0) {
    const names = missing.map((id) => CATEGORY_LABELS.get(id) ?? id);
    throw new AnalysisFormatError(
      `The analysis came back incomplete — it was missing the ${
        formatList(names)
      } section${missing.length > 1 ? "s" : ""}. Please try again.`,
    );
  }

  // Built key by key so the result is exactly the seven the UI iterates, in the
  // order the contract fixes, whatever order the model wrote them in.
  return {
    parse: category("parse", byId.get("parse")),
    format: category("format", byId.get("format")),
    sections: category("sections", byId.get("sections")),
    impact: category("impact", byId.get("impact")),
    skills: category("skills", byId.get("skills")),
    length: category("length", byId.get("length")),
    contact: category("contact", byId.get("contact")),
  };
}

function topFixes(raw: unknown): AtsTopFix[] {
  return array(raw)
    .map((entry): AtsTopFix | null => {
      if (!isRecord(entry)) return null;
      const id = categoryId(entry.category);
      const title = text(entry.title);
      const fix = text(entry.fix);
      // Without a category the UI has nothing to link back to, and without a
      // fix the row says nothing; either way the finding still exists on its
      // own card, so dropping the promotion loses nothing.
      if (!id || title === "" || fix === "") return null;
      return { category: id, severity: severity(entry.severity), title, fix };
    })
    .filter((entry): entry is AtsTopFix => entry !== null);
}

/**
 * An unreadable layout is read as the conventional one.
 *
 * Every other value triggers an offer to rebuild the document, so guessing wrong
 * in that direction tells someone their perfectly ordinary resume has a
 * structural problem — worse than staying quiet. A genuinely graphical resume
 * that lands here still gets low `parse` and `format` scores saying so.
 */
function layout(value: unknown): AtsLayout {
  const lowered = text(value).toLowerCase().replace(/[\s-]+/g, "_");
  return ATS_LAYOUTS.find((candidate) => candidate === lowered) ??
    "single_column_text";
}

function report(raw: unknown): AtsReport {
  const source = isRecord(raw) ? raw : {};
  return {
    overallScore: score(source.overallScore, "overall score"),
    summary: text(source.summary),
    layout: layout(source.layout),
    categories: categories(source.categories),
    topFixes: topFixes(source.topFixes),
  };
}

/** ISO `YYYY-MM-DD` and a real day, since the profile stores these as dates. */
function isoDate(value: unknown): string | null {
  const candidate = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip catches the days that parse but do not exist, like 2023-02-30.
  return parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
}

function links(raw: unknown): ParsedResumeLink[] {
  return array(raw)
    .map((entry): ParsedResumeLink | null => {
      if (!isRecord(entry)) return null;
      const url = text(entry.url);
      if (url === "") return null;
      return { label: text(entry.label) || url, url };
    })
    .filter((entry): entry is ParsedResumeLink => entry !== null);
}

function strings(raw: unknown): string[] {
  return array(raw)
    .map(text)
    .filter((entry) => entry !== "");
}

function experiences(raw: unknown): ParsedResumeExperience[] {
  return array(raw)
    .map((entry): ParsedResumeExperience | null => {
      if (!isRecord(entry)) return null;
      const title = text(entry.title);
      const company = text(entry.company);
      if (title === "" && company === "") return null;
      return {
        title,
        company,
        startDate: isoDate(entry.startDate),
        endDate: isoDate(entry.endDate),
        bullets: strings(entry.bullets),
      };
    })
    .filter((entry): entry is ParsedResumeExperience => entry !== null);
}

/**
 * Education, projects and certifications, which share a shape.
 *
 * An entry with no title and no organisation is a stray object rather than a
 * section of somebody's life, and is dropped. Anything with either is kept: a
 * rebuild renders from this, so a half-empty entry the candidate can finish
 * beats a section that vanished.
 */
function entries(raw: unknown): ParsedResumeEntry[] {
  return array(raw)
    .map((entry): ParsedResumeEntry | null => {
      if (!isRecord(entry)) return null;
      const title = text(entry.title);
      const organization = text(entry.organization);
      if (title === "" && organization === "") return null;
      return {
        title,
        organization,
        dateRange: text(entry.dateRange),
        lines: strings(entry.lines),
      };
    })
    .filter((entry): entry is ParsedResumeEntry => entry !== null);
}

/**
 * Split the single `sections` array back into the three the app is written
 * against, keyed off each entry's `kind`.
 *
 * An unrecognised or missing `kind` becomes a project, matching what the prompt
 * tells the model to do with anything that isn't a degree or a certificate. The
 * bias is never to drop: a publication filed under the wrong heading is a
 * cosmetic error, and one silently deleted from somebody's resume is not.
 *
 * The three separate arrays are still read if they arrive, because that is the
 * shape every report stored before this change has, and a stored report is
 * re-read by the client rather than re-requested.
 */
function sections(source: Record<string, unknown>): {
  education: ParsedResumeEntry[];
  projects: ParsedResumeEntry[];
  certifications: ParsedResumeEntry[];
} {
  const out = {
    education: entries(source.education),
    projects: entries(source.projects),
    certifications: entries(source.certifications),
  };

  for (const raw of array(source.sections)) {
    if (!isRecord(raw)) continue;
    const [entry] = entries([raw]);
    if (!entry) continue;
    const kind = text(raw.kind).toLowerCase();
    if (kind === "education") out.education.push(entry);
    else if (kind === "certification") out.certifications.push(entry);
    else out.projects.push(entry);
  }

  return out;
}

function parsedResume(raw: unknown): ParsedResume {
  const source = isRecord(raw) ? raw : {};

  const seen = new Set<string>();
  const skills = strings(source.skills).filter((skill) => {
    const key = skill.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    fullName: nullableText(source.fullName),
    headline: nullableText(source.headline),
    email: nullableText(source.email),
    phone: nullableText(source.phone),
    location: nullableText(source.location),
    summary: nullableText(source.summary),
    links: links(source.links),
    experiences: experiences(source.experiences),
    ...sections(source),
    skills,
  };
}

export function normalizeAnalysis(
  raw: unknown,
): { report: AtsReport; parsed: ParsedResume } {
  if (!isRecord(raw)) {
    throw new AnalysisFormatError(
      "The analysis came back in a format this app could not read. Please try again.",
    );
  }
  return { report: report(raw.report), parsed: parsedResume(raw.parsed) };
}

function formatList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// -------------------------------------------------------------------- edits

export class ImprovementFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImprovementFormatError";
  }
}

/**
 * A ceiling on how many rewrites one pass may store.
 *
 * Seven categories at three findings each is twenty-one, and a list that long is
 * not a list anyone works through. Well past what an honest pass produces, so
 * hitting it means the model padded.
 */
const MAX_EDITS = 15;

/** Whitespace-flattened, case-folded, trailing punctuation dropped. */
function matchKey(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:\u2026]+$/, "")
    .toLowerCase();
}

/** Every figure in a line, as written: "1.8", "420", "2,400", "99.9". */
function figures(value: string): Set<string> {
  const found = value.match(/\d+(?:[.,]\d+)*/g) ?? [];
  return new Set(found.map((figure) => figure.replace(/,/g, "")));
}

/**
 * Numbers in the rewrite that the original never contained.
 *
 * The one failure mode of a rewrite that the candidate cannot catch by reading
 * it: "cut latency by 40%" reads perfectly and is indefensible in an interview
 * if the resume never said 40%. Flagged rather than dropped — the rest of the
 * sentence may well be the improvement they wanted, and they are the only person
 * who knows whether the figure is true — and excluded from "accept all", so
 * agreeing to everything at once can never accept an unverified number.
 */
function figureFlag(original: string, suggested: string): string {
  const before = figures(original);
  const added = [...figures(suggested)].filter((figure) => !before.has(figure));
  if (added.length === 0) return "";
  return `This rewrite adds ${
    added.length === 1 ? "a figure" : "figures"
  } your line didn't state (${
    added.join(", ")
  }). Check it against what actually happened before you use it.`;
}

interface EditContext {
  report: AtsReport;
  /** Exactly what the model was shown, so quotations are checked against it. */
  lines: readonly RewritableLine[];
}

/**
 * The rewrites, checked against the text they claim to replace.
 *
 * Stricter than the analysis validator, and for a specific reason: an analysis
 * that comes back slightly off is still a report someone reads and judges, while
 * a rewrite is text that ends up in a document sent to an employer. So a
 * quotation that matches no line is dropped rather than repaired — there is
 * nowhere to apply it and no way to know what it was aiming at.
 *
 * `original` is replaced with the parse's own copy of the line even when the
 * model quoted it correctly, because that string is the key the rebuild
 * substitutes on. Every difference in whitespace between the two would otherwise
 * become a rewrite that silently fails to apply.
 */
export function normalizeEdits(
  raw: unknown,
  { report, lines }: EditContext,
): ResumeEditDraft[] {
  if (!isRecord(raw) || !Array.isArray(raw.edits)) {
    throw new ImprovementFormatError(
      "The rewrites came back in a format this app could not read. Please try again.",
    );
  }

  const canonicalLine = new Map<string, string>();
  for (const line of lines) {
    const key = matchKey(line.text);
    if (key !== "" && !canonicalLine.has(key)) canonicalLine.set(key, line.text);
  }

  // Keyed on the title alone, and carrying the category it was filed under, so a
  // rewrite that names the right finding under the wrong heading is corrected
  // rather than orphaned. The category the model states is only a fallback.
  const canonicalTitle = new Map<string, { title: string; category: AtsCategoryId }>();
  for (const id of ATS_CATEGORY_IDS) {
    for (const finding of report.categories[id].findings) {
      const key = matchKey(finding.title);
      if (key !== "" && !canonicalTitle.has(key)) {
        canonicalTitle.set(key, { title: finding.title, category: id });
      }
    }
  }

  const edits: ResumeEditDraft[] = [];
  const taken = new Set<string>();

  for (const entry of raw.edits) {
    if (edits.length >= MAX_EDITS) break;
    if (!isRecord(entry)) continue;

    const id = categoryId(entry.category);
    if (!id) continue;

    const key = matchKey(text(entry.original));
    const original = canonicalLine.get(key);
    if (original === undefined) {
      // Not a line this resume contains. Either the model quoted from memory or
      // it rewrote a fragment; both are unapplicable, and guessing which line
      // was meant is how the wrong bullet gets replaced.
      console.error(
        "discarded a rewrite quoting text that is not in the parse",
        text(entry.original).slice(0, 120),
      );
      continue;
    }
    // One rewrite per line. A second is the model changing its mind, and the
    // UI has one row per line to show it in.
    if (taken.has(key)) continue;

    const suggested = text(entry.suggested);
    if (suggested === "" || matchKey(suggested) === key) continue;

    taken.add(key);

    const title = text(entry.findingTitle);
    const finding = canonicalTitle.get(matchKey(title));
    edits.push({
      category: finding?.category ?? id,
      // Matched back to the report's own wording where possible, so the row
      // lands under the card it belongs to. An unmatched title is kept as
      // written rather than dropped: the rewrite is still valid, and it shows
      // in the summary list instead of under a finding.
      findingTitle: finding?.title ?? title,
      original,
      suggested,
      note: text(entry.note),
      // Read off the text, not off `leftBlank`: the text is what gets sent.
      hasBlank: /_{2,}/.test(suggested),
      flag: figureFlag(original, suggested),
      sortOrder: edits.length,
    });
  }

  return edits;
}
