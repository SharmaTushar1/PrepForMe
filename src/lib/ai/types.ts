import type {
  Application,
  Experience,
  PrepCitation,
  Profile,
  Recap,
  Skill,
} from "../../types";

/** One truthful rewrite: the user's real bullet, reframed, plus why. */
export interface TailoringChange {
  before: string;
  after: string;
  rationale: string;
  sourceBulletId?: string;
}

export interface AtsKeyword {
  keyword: string;
  covered: boolean;
  /** Shown beside a missing keyword. Never an instruction to invent one. */
  hint?: string;
}

export interface TailoringResult {
  summary: string;
  changes: TailoringChange[];
  keywords: AtsKeyword[];
  /** The angle this pass took, e.g. "reliability-led". */
  variant: string | null;
  model: string;
}

export interface ReferralDraft {
  name: string;
  role: string;
  tag: string;
  note: string;
}

export interface PrepAnswer {
  content: string;
  citations: PrepCitation[];
}

// ------------------------------------------------------ base resume review
//
// The base-resume ATS review. Distinct from `AtsKeyword` above, which answers
// "does this resume cover this posting" — a question that needs a job
// description. This one judges the file on its own: what a parser can get out
// of it, and whether what it gets reads well.

/** Worst first, which is also the order findings render in. */
export type AtsSeverity = "critical" | "warning" | "pass";

/**
 * The seven scored categories, in render order. A tuple rather than a bare
 * union so the order is part of the contract and can't drift from the type.
 */
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

/** One thing worth changing, tied to the line that caused it. */
export interface AtsFinding {
  severity: AtsSeverity;
  /** A few words naming the problem: "Dates sit inside a table cell". */
  title: string;
  /** Why a parser or a recruiter cares. A sentence or two. */
  detail: string;
  /**
   * The change to make, concrete enough to act on without thinking. Required
   * even at `pass`, where it says what keeps this passing — a JSON schema
   * can't make a field conditional on a sibling's value, so the alternative is
   * a field the model omits unpredictably.
   */
  fix: string;
  /**
   * Quoted verbatim from the resume so the user can search their own file for
   * it — never paraphrased. Absent when the finding is about the document as a
   * whole (two columns, image-only scan) rather than a line inside it.
   */
  evidence?: string;
}

/**
 * One scored category. Generic in its own id so the keyed report below cannot
 * file a `format` category under `parse`.
 */
export interface AtsCategory<Id extends AtsCategoryId = AtsCategoryId> {
  id: Id;
  /** Card heading, supplied by the provider rather than hardcoded in the UI. */
  label: string;
  /** 0–100. Validated in code: a JSON schema can't express a numeric range. */
  score: number;
  /** One sentence, readable without opening a single finding. */
  summary: string;
  /** Empty when the category is clean — the card still renders, with its score. */
  findings: AtsFinding[];
}

/**
 * Every category is always present, so the UI never has to handle a missing
 * one. Iterate `ATS_CATEGORY_IDS` rather than `Object.keys` — key order is a
 * JavaScript accident, the tuple is a promise.
 */
export type AtsCategories = { [Id in AtsCategoryId]: AtsCategory<Id> };

/** A finding promoted to the headline list, keeping its way back to its card. */
export interface AtsTopFix {
  category: AtsCategoryId;
  severity: AtsSeverity;
  title: string;
  fix: string;
}

/**
 * How the document is built, which is a separate question from how good it is.
 *
 * A designed two-column resume can score well on everything the report judges
 * and still be the wrong shape for an older parser, so the offer to rebuild it
 * in a conventional layout is gated on this rather than on a score threshold —
 * a score says "this could be better", a layout says "this is a different kind
 * of document", and only the second justifies proposing a new file.
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
  /**
   * 0–100 across the seven categories. Deliberately not a match score: with no
   * job description there is nothing to match against, and per-role keyword
   * work already lives on each application.
   */
  overallScore: number;
  summary: string;
  /**
   * The model's reading of the page, not a derivation from the scores. An
   * unrecognised value is read as `single_column_text`, because a wrong guess
   * there stays quiet instead of telling someone their ordinary resume is
   * structurally broken.
   */
  layout: AtsLayout;
  categories: AtsCategories;
  /** Ranked, highest leverage first, so the user can stop reading after three. */
  topFixes: AtsTopFix[];
}

/** A profile or portfolio URL the resume advertises. */
export interface ParsedResumeLink {
  /** Whatever the resume calls it: "LinkedIn", "GitHub", "Portfolio". */
  label: string;
  url: string;
}

/** One role as it was read off the page, before the user confirms it. */
export interface ParsedResumeExperience {
  title: string;
  company: string;
  /**
   * ISO `YYYY-MM-DD`, matching the `date` columns this eventually applies
   * into. A resume that gives only a month becomes the first of it.
   */
  startDate: string | null;
  /** Same format. Null means current — "Present" is not a date. */
  endDate: string | null;
  bullets: string[];
}

/**
 * Education, projects and certifications: a titled block with supporting lines,
 * rather than a role with dated bullets.
 *
 * `dateRange` is the string the resume prints — "2018 – 2022", "Expected 2027" —
 * not an ISO pair, because nothing computes with these. They exist to be
 * re-rendered verbatim, and normalising them would both lose information the
 * page carried and cost two more nullable fields against a schema budget that
 * is already tight. Experience dates are normalised precisely because the
 * profile does compute with them.
 */
export interface ParsedResumeEntry {
  /** The degree, the project name, the certification. */
  title: string;
  /** University, employer, issuing body. Empty when the resume names none. */
  organization: string;
  /** As printed. Empty when the entry carries no dates. */
  dateRange: string;
  /** Supporting lines, verbatim: honours, coursework, what a project did. */
  lines: string[];
}

/**
 * The resume as a parser would index it. Every scalar is nullable because a
 * missing field is itself the finding — an absent email is what the `contact`
 * category is for, not something to invent a value for.
 *
 * This is also the *only* surviving record of the document's content: a rebuilt
 * resume is rendered from here, never from the original file. So it has to cover
 * every section of the page, including the ones the profile has nowhere to store
 * — anything missing here is content the user would silently lose.
 */
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

// ------------------------------------------------------------------- edits
//
// The rewrite pass: the report says what is weak, this says what to write
// instead. Separate from `TailoringChange` above, which reframes a bullet
// towards one job description — these are about the base resume being well
// written at all, and they exist whether or not any role is being applied to.

export type ResumeEditStatus = "suggested" | "accepted" | "dismissed";

/** One proposed replacement for one line the candidate wrote. */
export interface ResumeEdit {
  /** The `resume_edits` row, or a local id when this is a sample. */
  id: string;
  /** The finding this answers, so the row renders under the right card. */
  category: AtsCategoryId;
  findingTitle: string;
  /**
   * The line as the parse recorded it, verbatim. This is the key an accepted
   * rewrite is substituted on when a document is rebuilt, so it is never
   * trimmed, re-cased or otherwise tidied anywhere in this codebase.
   */
  original: string;
  suggested: string;
  /** What changed and why. Where a blank is, says what to fill in. */
  note: string;
  /**
   * The rewrite contains `___` because the resume never stated the figure the
   * line needs. Accepting one is fine; sending it out unfilled is not, so every
   * surface that shows an accepted rewrite has to keep saying so.
   */
  hasBlank: boolean;
  /**
   * Non-empty when the rewrite needs checking — currently, that it introduced a
   * figure the original did not contain. Rendered verbatim as a warning, and
   * excluded from "accept all", because a number nobody verified is the one
   * error on a resume that costs more than leaving the line as it was.
   */
  flag: string;
  status: ResumeEditStatus;
}

/** One rewrite pass over one report. */
export interface ResumeImprovement {
  /** Worst first, in the order the model ranked them. */
  edits: ResumeEdit[];
  model: string;
  /** True when these are fixtures and no model was called. */
  sample: boolean;
}

export interface ImproveResumeOptions {
  /** Replaces suggestions that already exist. Costs a model call. */
  force?: boolean;
  onProgress?: (progress: AnalysisProgress) => void;
}

/** One upload analyzed: the report the user reads, the parse they review. */
export interface ResumeAnalysis {
  report: AtsReport;
  parsed: ParsedResume;
  /**
   * The stored `resume_reports` row this came from, which is what a rewrite pass
   * is hung off — suggestions belong to one reading of the resume and must not
   * outlive it. Null when nothing was stored, which is to say when this is a
   * sample, and that is exactly when rewrites cannot be saved either.
   */
  reportId: string | null;
  /**
   * True when this was stored before the parse covered the whole document, so
   * its education, projects and certifications are absent because they were
   * never asked for — not because the resume lacked them.
   *
   * Only ever set when reading an old row back; a provider always returns a
   * complete parse. It exists so a rebuild can refuse rather than render a
   * resume with someone's degree quietly missing, which is a failure they would
   * discover after sending it.
   */
  partialParse?: boolean;
  /** Whatever produced this — "claude-sonnet-5", "local-heuristic". */
  model: string;
  /**
   * True when this is a canned sample rather than an analysis of the user's
   * actual file. The report screen must say so on screen when it's set.
   */
  sample: boolean;
}

/** Everything the provider is allowed to reason over, passed explicitly. */
export interface ProfileContext {
  profile: Profile | null;
  experiences: Experience[];
  skills: Skill[];
}

export interface TailorInput {
  application: Application;
  context: ProfileContext;
}

export interface AtsInput {
  application: Application;
  context: ProfileContext;
}

export interface ReferralInput {
  application: Application;
  context: ProfileContext;
  person: { name: string; role: string; tag: string };
  /** Hard cap from the send channel, so drafts come back usable. */
  charLimit?: number;
}

export interface SuggestReferralsInput {
  application: Application;
  context: ProfileContext;
  charLimit?: number;
}

export interface PrepQuestionInput {
  question: string;
  application: Application;
  context: ProfileContext;
  recaps: Recap[];
  sourceCount: number;
}

/**
 * How far a running analysis has actually got.
 *
 * Reported from work genuinely finished, never from a timer. `step` never
 * decreases and it stops moving when the work stops, which is the point of
 * measuring rather than animating: a bar that keeps climbing through a dead
 * request is a lie the user pays for in waiting.
 *
 * `waiting` is how the long middle is described honestly. The model call is one
 * step that takes the best part of a minute, and nothing inside it is observable
 * — the rewrite pass can watch its own answer arrive, but an analysis cannot,
 * because reading that many stream frames costs more CPU than an edge isolate is
 * given. So instead of inventing a percentage, the provider reports how long the
 * wait has run and how long it usually takes, and the UI shows that.
 */
export interface AnalysisProgress {
  step: number;
  total: number;
  /** What just happened, in the user's language. Safe to render verbatim. */
  label: string;
  /**
   * Set while a step is in flight with no internal progress to report. Elapsed
   * may exceed expected — the estimate is a typical run, not a promise, and
   * showing it overrun is more honest than pinning the bar at 99%.
   */
  waiting?: { elapsedMs: number; expectedMs: number };
}

export interface AnalyzeResumeOptions {
  /**
   * Re-runs an analysis the server would otherwise answer from the existing
   * report. Costs a model call, so the UI must ask first.
   */
  force?: boolean;
  onProgress?: (progress: AnalysisProgress) => void;
}

/**
 * The single seam between the product and a model. Everything the UI shows is
 * produced here, so swapping the mock for a real provider is a one-line change
 * and no screen has to know the difference.
 */
export interface AiProvider {
  readonly name: string;
  /**
   * False when the provider can't read the user's actual file, so onboarding
   * says so rather than implying a parse happened. A false provider still
   * answers `analyzeResume` — with `sample: true` — so every screen stays
   * buildable offline.
   */
  readonly supportsResumeParsing: boolean;

  tailorResume(input: TailorInput): Promise<TailoringResult>;
  atsGap(input: AtsInput): Promise<AtsKeyword[]>;
  draftReferralNote(input: ReferralInput): Promise<string>;
  suggestReferrals(input: SuggestReferralsInput): Promise<ReferralDraft[]>;
  answerPrepQuestion(input: PrepQuestionInput): Promise<PrepAnswer>;
  parseResume(file: File): Promise<ParsedResume>;
  /**
   * Analyze a resume already uploaded to storage, by its `resumes.id` row. The
   * file is read server-side under the caller's own JWT, so no `File` crosses
   * this seam and the PDF is never re-uploaded to run the analysis again.
   *
   * This is the only method here that spends money, and it takes long enough
   * that the screen has to say something while it runs — hence `onProgress`.
   */
  analyzeResume(
    resumeId: string,
    options?: AnalyzeResumeOptions,
  ): Promise<ResumeAnalysis>;
  /**
   * Rewrite the lines the report found fault with, for a resume that has already
   * been analyzed. The stored report is the input, so this reads nothing from the
   * browser and re-reads no PDF.
   *
   * The second method here that spends money, and the cheaper of the two by a
   * wide margin, because the file never goes up again.
   */
  improveResume(
    resumeId: string,
    options?: ImproveResumeOptions,
  ): Promise<ResumeImprovement>;
}
