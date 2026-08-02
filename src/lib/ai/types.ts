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

export interface ParsedResume {
  fullName: string | null;
  experiences: {
    title: string;
    company: string;
    startDate: string | null;
    endDate: string | null;
    bullets: string[];
  }[];
  skills: string[];
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
 * The single seam between the product and a model. Everything the UI shows is
 * produced here, so swapping the mock for a real provider is a one-line change
 * and no screen has to know the difference.
 */
export interface AiProvider {
  readonly name: string;
  /** False when resume parsing isn't available, so onboarding can say so. */
  readonly supportsResumeParsing: boolean;

  tailorResume(input: TailorInput): Promise<TailoringResult>;
  atsGap(input: AtsInput): Promise<AtsKeyword[]>;
  draftReferralNote(input: ReferralInput): Promise<string>;
  suggestReferrals(input: SuggestReferralsInput): Promise<ReferralDraft[]>;
  answerPrepQuestion(input: PrepQuestionInput): Promise<PrepAnswer>;
  parseResume(file: File): Promise<ParsedResume>;
}
