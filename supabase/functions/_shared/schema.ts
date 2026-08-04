/**
 * The wire contract for the analysis: the JSON Schema handed to the model, and
 * the TypeScript shapes it has to land in.
 *
 * These interfaces mirror `src/lib/ai/types.ts`, which is the source of truth.
 * They are duplicated rather than imported because the Supabase CLI bundles
 * only `supabase/functions/`, so an import reaching up into `src/` would type
 * check locally and fail to deploy. If the app-side types move, move these.
 *
 * Schema limitations that shaped what follows (Anthropic structured outputs):
 *
 * - Numeric constraints (`minimum`, `maximum`) and string length constraints
 *   are not supported, so every score range is stated in a `description` for
 *   the model and enforced again in `validate.ts` before it reaches a database
 *   column with a `check (overall_score between 0 and 100)` on it.
 * - `additionalProperties: false` is required on every object.
 * - Array `minItems` accepts only 0 or 1.
 * - **The whole schema is compiled into a decoding grammar, and that grammar has
 *   a size ceiling.** Repetition is what breaches it: seven named category
 *   properties, each inlining the same finding object, was rejected with
 *   `invalid_request_error` — "the compiled grammar is too large" — before a
 *   single token was billed. Repeated shapes go behind one array with an `id`
 *   enum instead of becoming N sibling properties.
 * - Optional properties and union types are the two things that blow up grammar
 *   compilation, and only 24 and 16 of them respectively are allowed across a
 *   request. So nothing here is optional, and the six remaining unions are all
 *   `string | null` on `parsed`, where "the resume does not state this" is a
 *   fact worth representing precisely. `AtsFinding.evidence` is optional in
 *   TypeScript but required here; `validate.ts` turns the empty string back
 *   into the absent field.
 * - Enum casing is not guaranteed, so severities and category ids are matched
 *   case-insensitively downstream.
 */

// ------------------------------------------------------------------- types

export type AtsSeverity = "critical" | "warning" | "pass";

/** Render order, and the order the report is scored in. */
export const ATS_CATEGORY_IDS = [
  "parse",
  "format",
  "sections",
  "impact",
  "skills",
  "length",
  "contact",
] as const;

export type AtsCategoryId = (typeof ATS_CATEGORY_IDS)[number];

export interface AtsFinding {
  severity: AtsSeverity;
  title: string;
  detail: string;
  fix: string;
  evidence?: string;
}

export interface AtsCategory<Id extends AtsCategoryId = AtsCategoryId> {
  id: Id;
  label: string;
  score: number;
  summary: string;
  findings: AtsFinding[];
}

export type AtsCategories = { [Id in AtsCategoryId]: AtsCategory<Id> };

export interface AtsTopFix {
  category: AtsCategoryId;
  severity: AtsSeverity;
  title: string;
  fix: string;
}

/**
 * How the document is built, which is a different question from how good it is.
 *
 * A designed two-column resume can score well on everything this report judges
 * and still be the wrong shape for an older parser, so the offer to rebuild it
 * in a conventional layout is gated on this rather than on a score threshold.
 * It is the model's classification of what it can see on the page — which is why
 * the PDF goes up as a document block rather than as extracted text.
 */
export const ATS_LAYOUTS = [
  /** One column, real text, conventional headings. Nothing to rebuild. */
  "single_column_text",
  /** Two or more columns, or a sidebar. Reading order is a gamble. */
  "multi_column",
  /** Template-driven: text boxes, tables, icons, graphics carrying meaning. */
  "graphical",
  /** Images of text. Nothing to extract without OCR. */
  "scanned",
] as const;

export type AtsLayout = (typeof ATS_LAYOUTS)[number];

export interface AtsReport {
  overallScore: number;
  summary: string;
  layout: AtsLayout;
  categories: AtsCategories;
  topFixes: AtsTopFix[];
}

export interface ParsedResumeLink {
  label: string;
  url: string;
}

export interface ParsedResumeExperience {
  title: string;
  company: string;
  startDate: string | null;
  endDate: string | null;
  bullets: string[];
}

/**
 * Education, projects, and anything else that is a block of prose under a
 * heading rather than a role with bullets.
 *
 * Dates here are the string the resume prints — "2018 – 2022", "Expected 2027" —
 * not an ISO pair. Nothing computes with them: they exist to be re-rendered
 * verbatim if the resume is rebuilt, and a normalised pair would cost two more
 * nullable unions against a budget the schema is already rationing.
 */
export interface ParsedResumeEntry {
  /** The degree, the project name, the certification. */
  title: string;
  /** University, employer, issuing body. Empty when the resume names none. */
  organization: string;
  /** As printed, e.g. "Aug 2018 – May 2022". Empty when undated. */
  dateRange: string;
  /** Supporting lines, verbatim: honours, coursework, what a project did. */
  lines: string[];
}

export interface ParsedResume {
  fullName: string | null;
  headline: string | null;
  email: string | null;
  location: string | null;
  /** The opening summary or objective paragraph, verbatim. Null when absent. */
  summary: string | null;
  links: ParsedResumeLink[];
  experiences: ParsedResumeExperience[];
  education: ParsedResumeEntry[];
  projects: ParsedResumeEntry[];
  certifications: ParsedResumeEntry[];
  skills: string[];
}

export interface ResumeAnalysis {
  report: AtsReport;
  parsed: ParsedResume;
  /**
   * The `resume_reports` row this was saved as, which is what a later rewrite
   * pass hangs off. Null only when nothing was stored, i.e. a sample.
   */
  reportId: string | null;
  model: string;
  sample: boolean;
}

// ------------------------------------------------------------------- edits

/**
 * One proposed rewrite of one line the candidate wrote.
 *
 * `original` is the join key: it is stored verbatim as the parse recorded it,
 * and a rebuilt document substitutes an accepted rewrite by matching it. The
 * model's copy of it is therefore checked against the parse rather than trusted
 * — a quotation that matches nothing is a rewrite of a line that does not exist,
 * and there is nowhere to apply it.
 */
export interface ResumeEditDraft {
  /** The category of the finding this answers, so the UI can file it. */
  category: AtsCategoryId;
  /** The finding's own title, verbatim, which is how the row finds its card. */
  findingTitle: string;
  original: string;
  suggested: string;
  /** Why, in the candidate's language. Where a blank is explained. */
  note: string;
  /**
   * The rewrite contains `___` because the resume never stated the figure the
   * line needs. Detected from the text rather than taken from the model's own
   * flag: the text is what gets sent to an employer.
   */
  hasBlank: boolean;
  /**
   * Non-empty when the rewrite needs checking before it is trusted. Set when it
   * introduces a figure the original did not contain, which is the one failure
   * mode of a rewrite that the candidate cannot spot by reading it.
   */
  flag: string;
  /** The model's ranking, preserved so the list reads worst-first. */
  sortOrder: number;
}

/** A line of the candidate's own prose that a rewrite is allowed to replace. */
export interface RewritableLine {
  /** Where it sits, e.g. "Senior Backend Engineer · Northwind Labs". */
  where: string;
  text: string;
}

/**
 * Every line a rewrite may target, in reading order.
 *
 * Deliberately narrower than "the resume": only prose the candidate wrote and
 * that a rebuilt document renders back — the summary, role bullets, and the
 * supporting lines under education, projects and certifications. Titles,
 * employers, dates, skills and contact details are excluded because rewording
 * them is either meaningless or a claim about the candidate's history, and a
 * rewrite is not allowed to make one.
 *
 * This list is both what the model is shown and what its quotations are checked
 * against, so the two cannot drift.
 */
export function rewritableLines(parsed: ParsedResume): RewritableLine[] {
  const lines: RewritableLine[] = [];

  if (parsed.summary) lines.push({ where: "Summary", text: parsed.summary });

  for (const role of parsed.experiences ?? []) {
    const where = [role.title, role.company].filter((part) => part).join(" · ") ||
      "Experience";
    for (const bullet of role.bullets ?? []) {
      if (bullet.trim() !== "") lines.push({ where, text: bullet });
    }
  }

  const sections: [string, ParsedResumeEntry[]][] = [
    ["Education", parsed.education ?? []],
    ["Projects", parsed.projects ?? []],
    ["Certifications", parsed.certifications ?? []],
  ];
  for (const [section, entries] of sections) {
    for (const entry of entries) {
      const where = `${section} — ${entry.title || entry.organization}`;
      for (const line of entry.lines ?? []) {
        if (line.trim() !== "") lines.push({ where, text: line });
      }
    }
  }

  return lines;
}

// -------------------------------------------------------------- categories

/**
 * One entry per scored category, shared by the schema below and the prompt, so
 * a category can't be described one way to the model and scored another. The
 * `label` is what the UI prints on the card — it comes from here rather than
 * being hardcoded in a component.
 */
export interface CategorySpec {
  id: AtsCategoryId;
  label: string;
  /** What this category judges. Reused verbatim in the prompt. */
  brief: string;
}

export const CATEGORY_SPECS: readonly CategorySpec[] = [
  {
    id: "parse",
    label: "Parse fidelity",
    brief:
      "What a resume parser would actually extract: name, email, phone, location, links, and every title / company / date triple. This is the headline category — if the parse is wrong, nothing below it matters.",
  },
  {
    id: "format",
    label: "Layout and formatting",
    brief:
      "Anything about the file itself that breaks extraction: multiple columns, tables, text boxes, graphics, contact details stranded in a header or footer, an image-only scan with no text layer, unusual fonts, or a non-standard reading order.",
  },
  {
    id: "sections",
    label: "Section headings",
    brief:
      "Whether the standard headings a parser looks for are present and named conventionally — Experience, Education, Skills — and whether any creatively named section would be missed or misfiled.",
  },
  {
    id: "impact",
    label: "Bullet impact",
    brief:
      "The share of bullets that lead with an action verb and carry a quantified result, versus bullets that only describe duties. Judge the writing, not the keywords.",
  },
  {
    id: "skills",
    label: "Skills visibility",
    brief:
      "Whether skills appear in a dedicated, scannable section or are buried in prose, roughly how dense they are against the usual 1–3% band, and whether anything reads as keyword stuffing.",
  },
  {
    id: "length",
    label: "Length",
    brief:
      "Page count and word count against the seniority the resume itself claims. One page for early career, two for most, more only with a stated reason.",
  },
  {
    id: "contact",
    label: "Contact details",
    brief:
      "Whether a recruiter can reach this person: email, phone, location, and the profile links a role in this field expects — and whether each reads professionally.",
  },
] as const;

const SEVERITY_VALUES: readonly AtsSeverity[] = ["critical", "warning", "pass"];

// ------------------------------------------------------------------ schema

type JsonSchema = Record<string, unknown>;

/**
 * One shape, reached once, through the `categories` array.
 *
 * This used to be inlined under seven named `categories.*` properties, which
 * cost seven copies of this object and its enum. Anthropic rejected the
 * request outright — `invalid_request_error`, "the compiled grammar is too
 * large" — because structured outputs compile the schema into a decoding
 * grammar, and duplication there is multiplicative rather than free. Anything
 * that reintroduces a per-category subtree brings the ceiling back with it.
 */
function findingSchema(): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["severity", "title", "detail", "fix", "evidence"],
    properties: {
      severity: {
        type: "string",
        enum: SEVERITY_VALUES,
        description:
          "critical when it would cost the candidate the application, warning when it costs them ground, pass when this item is already right.",
      },
      title: {
        type: "string",
        description:
          'A few words naming the specific thing, e.g. "Dates sit inside a table cell".',
      },
      detail: {
        type: "string",
        description:
          "One or two sentences on what a parser or a recruiter does with this. Concrete about consequence, not general advice.",
      },
      fix: {
        type: "string",
        description:
          "The exact change to make in THIS resume, specific enough to act on without thinking. Required even when severity is pass, where it states what keeps this passing so the candidate does not undo it.",
      },
      evidence: {
        // A plain string rather than a nullable one, and empty means absent.
        // This object is inlined at all seven categories, so a union here costs
        // seven of the sixteen union-typed properties a schema is allowed —
        // paid for nothing, since the validator reads "" and null identically.
        type: "string",
        description:
          "The offending text copied verbatim from the resume, character for character, so the candidate can search their own file for it. Never paraphrased, never invented. Empty string only when the finding is about the document as a whole, such as a two-column layout or an image-only scan, rather than a line inside it.",
      },
    },
  };
}

/**
 * `label` is deliberately not on the wire. It is a UI string this app owns —
 * `validate.ts` fills it from `CATEGORY_SPECS` — so asking the model to echo it
 * bought a property the model could get wrong and nothing else.
 *
 * Each category's `brief` lives in the prompt rather than in a per-id
 * `description` here, which is what lets one schema cover all seven.
 */
function categorySchema(): JsonSchema {
  return {
    type: "object",
    additionalProperties: false,
    required: ["id", "score", "summary", "findings"],
    properties: {
      id: {
        type: "string",
        enum: [...ATS_CATEGORY_IDS],
        description:
          "Which category this entry scores. Exactly one entry per id, all seven present.",
      },
      score: {
        type: "integer",
        description:
          "Integer from 0 to 100 for this category only, judged against what the instructions say this category covers.",
      },
      summary: {
        type: "string",
        description:
          "One sentence a reader gets the verdict from without opening a single finding.",
      },
      findings: {
        type: "array",
        minItems: 1,
        description:
          "Worst first, one to three entries. A category with nothing wrong still gets a single pass finding naming what it is doing right. Three is a ceiling, not a target: every extra finding is output the candidate pays for and reads.",
        items: findingSchema(),
      },
    },
  };
}

const topFixSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["category", "severity", "title", "fix"],
  properties: {
    category: {
      type: "string",
      enum: [...ATS_CATEGORY_IDS],
      description: "The category this fix came from, so the UI can link back.",
    },
    severity: { type: "string", enum: SEVERITY_VALUES },
    title: {
      type: "string",
      description: "The same title as the finding it was promoted from.",
    },
    fix: {
      type: "string",
      description: "The same instruction as the finding it was promoted from.",
    },
  },
};

/** The `kind` discriminator on a parsed section entry. */
export const PARSED_SECTION_KINDS = ["education", "project", "certification"] as const;

export type ParsedSectionKind = (typeof PARSED_SECTION_KINDS)[number];

/**
 * Education, projects and certifications as **one** array discriminated by
 * `kind`, rather than three sibling arrays of the same object.
 *
 * Three arrays was the first design, and it is what an 8,500-token resume was
 * rejected for: `invalid_request_error`, "the compiled grammar is too large".
 * Repetition is what breaches that ceiling — the same lesson the report's
 * `categories` learned when seven named properties each inlining a finding
 * object had to become one array with an `id` enum. A shape used three times
 * costs three times, whether or not the source defines it once, so the wire
 * carries one copy and `validate.ts` splits it back into the three arrays the
 * rest of the app is written against.
 */
const parsedSectionsSchema: JsonSchema = {
  type: "array",
  description:
    "Everything under its own heading that is not work history and not skills: degrees, projects, certifications, licences, named courses, publications, awards and volunteering. One entry per block, in the order the resume presents them. Empty array only if the resume genuinely has none of these.",
  items: {
    type: "object",
    additionalProperties: false,
    required: ["kind", "title", "organization", "dateRange", "lines"],
    properties: {
      kind: {
        type: "string",
        enum: [...PARSED_SECTION_KINDS],
        description:
          'Which of the three this block is. A degree or school is "education". A certificate, licence or named course is "certification". Everything else — including publications, awards and volunteering — is "project".',
      },
      title: {
        type: "string",
        description:
          "The qualification, project name, or certificate, as printed.",
      },
      organization: {
        type: "string",
        description:
          "University, employer or issuing body. Empty string if the resume names none — not a guess.",
      },
      dateRange: {
        type: "string",
        description:
          'Exactly as printed, e.g. "Aug 2018 – May 2022" or "Expected 2027". Empty string if undated. Do not normalise it.',
      },
      lines: {
        type: "array",
        description:
          "The supporting lines under this entry, copied verbatim: honours, relevant coursework, what the project did. Empty array if there are none.",
        items: { type: "string" },
      },
    },
  },
};

const parsedResumeSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "fullName",
    "headline",
    "email",
    "location",
    "summary",
    "links",
    "experiences",
    "sections",
    "skills",
  ],
  description:
    "The whole resume, as a parser would index it, complete enough to rebuild the document from. Anything on the page that is not captured here is content the candidate would silently lose, so every section gets a home. Every scalar is nullable: a field the resume does not contain is null, never a guess. A missing field is itself a finding for the contact or parse category.",
  properties: {
    fullName: { type: ["string", "null"] },
    headline: {
      type: ["string", "null"],
      description:
        "The professional title the resume presents, e.g. a line under the name or the current role. Null if the resume states none.",
    },
    email: { type: ["string", "null"] },
    location: {
      type: ["string", "null"],
      description: "As written on the resume, e.g. \"Bengaluru, India\".",
    },
    summary: {
      type: ["string", "null"],
      description:
        "The opening summary, profile or objective paragraph, copied verbatim. Null if the resume opens straight into a section.",
    },
    links: {
      type: "array",
      description:
        "Profile and portfolio URLs the resume advertises, in the order they appear.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "url"],
        properties: {
          label: {
            type: "string",
            description:
              'Whatever the resume calls it: "LinkedIn", "GitHub", "Portfolio".',
          },
          url: { type: "string" },
        },
      },
    },
    experiences: {
      type: "array",
      description:
        "Every role on the resume, most recent first. Work history only — education, projects and certifications have their own arrays below.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "company", "startDate", "endDate", "bullets"],
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          startDate: {
            type: ["string", "null"],
            description:
              "ISO YYYY-MM-DD. A resume giving only a month becomes the first of it (\"Mar 2021\" is 2021-03-01); a resume giving only a year becomes January the first. Null if the resume states no start date.",
          },
          endDate: {
            type: ["string", "null"],
            description:
              "Same format. Null means the role is current — \"Present\" is not a date.",
          },
          bullets: {
            type: "array",
            description:
              "The bullets under this role, copied verbatim. Do not rewrite, shorten, or improve them: this is what the candidate is shown to confirm, and the tailoring step later rewrites from these originals.",
            items: { type: "string" },
          },
        },
      },
    },
    sections: parsedSectionsSchema,
    skills: {
      type: "array",
      description:
        "Individual skills named on the resume, one per entry, deduplicated. Split comma-separated lists. Do not add skills the resume does not name.",
      items: { type: "string" },
    },
  },
};

/** The single object one Claude call has to return. */
export const analysisSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["report", "parsed"],
  properties: {
    report: {
      type: "object",
      additionalProperties: false,
      required: [
        "overallScore",
        "summary",
        "layout",
        "categories",
        "topFixes",
      ],
      properties: {
        overallScore: {
          type: "integer",
          description:
            "Integer from 0 to 100 across the seven categories, weighted towards parse and format because everything else depends on them. This is NOT a match score against any job: there is no job description here.",
        },
        summary: {
          type: "string",
          description:
            "Two or three sentences naming what this specific resume does well and what is costing it the most. No preamble, no encouragement.",
        },
        layout: {
          type: "string",
          enum: [...ATS_LAYOUTS],
          description:
            'How the document is physically built, which is not the same question as how good it is. "single_column_text": one column of real text under conventional headings. "multi_column": two or more columns or a sidebar, so reading order depends on the parser. "graphical": template-driven, with text boxes, tables, icons or graphics carrying meaning. "scanned": images of text. Judge what is on the page, not the quality of the writing — a well-written two-column resume is still multi_column.',
        },
        categories: {
          type: "array",
          minItems: 1,
          description:
            "Exactly seven entries, one per category, in the order the instructions list them. The UI keys them by id, so a duplicate or a missing id is a broken report.",
          items: categorySchema(),
        },
        topFixes: {
          type: "array",
          minItems: 1,
          description:
            "The highest-leverage findings promoted from the categories, ranked so the candidate can stop reading after three. Three to five entries, worst first.",
          items: topFixSchema,
        },
      },
    },
    parsed: parsedResumeSchema,
  },
};

/**
 * The rewrite pass: every fixable finding answered with replacement text.
 *
 * Flat on purpose. One array of one object shape, no nested arrays, no optional
 * properties and no unions at all — which leaves the whole union and optional
 * budget documented at the top of this file unspent, and keeps the compiled
 * grammar small enough that this schema can never be the thing that gets
 * rejected. Where a line came from is not asked for either: it is recovered by
 * matching `original` against the parse, which is a fact the server already has
 * and the model could get wrong.
 */
export const improvementSchema: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["edits"],
  properties: {
    edits: {
      type: "array",
      description:
        "One entry per finding that can be fixed by rewriting text, and no entries for anything else. Findings about layout, page count, or a detail the resume is missing entirely have no rewrite: leave them out rather than inventing something to say.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "findingTitle",
          "original",
          "suggested",
          "note",
          "leftBlank",
        ],
        properties: {
          category: {
            type: "string",
            enum: [...ATS_CATEGORY_IDS],
            description: "The category of the finding this rewrite answers.",
          },
          findingTitle: {
            type: "string",
            description:
              "That finding's title, copied verbatim from the report you were given, so the rewrite can be shown under it.",
          },
          original: {
            type: "string",
            description:
              "One of the quoted lines you were given, copied character for character including its typos. Not a paraphrase, not a fragment, and never a line that is not in that list — a quotation that does not match one is discarded.",
          },
          suggested: {
            type: "string",
            description:
              "The replacement line, complete and ready to paste. Same facts as the original, restructured to lead with the action and land on the outcome. Never a new number, technology, employer, client, scope or result.",
          },
          note: {
            type: "string",
            description:
              "One short sentence on what changed and why it is stronger. When the line has a blank, this says exactly what number to put in it.",
          },
          leftBlank: {
            type: "boolean",
            description:
              "True when `suggested` contains ___ because the outcome needs a figure the resume never states. Leaving the blank is correct; filling it in with a plausible number is not.",
          },
        },
      },
    },
  },
};
