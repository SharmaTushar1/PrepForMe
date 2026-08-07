/**
 * Mirrors the shapes the web app's edge functions actually return —
 * `src/types.ts` and `src/lib/ai/types.ts` in the main app. Duplicated
 * rather than imported: the extension builds as its own package with its
 * own tsconfig, and these fields are a wire contract with functions that
 * don't version themselves, so keep them in sync by hand if either side
 * changes.
 */

export interface ResumeFields {
  fullName: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  summary: string | null;
  links: { label: string; url: string }[];
  experiences: {
    title: string;
    company: string;
    startDate: string | null;
    endDate: string | null;
    bullets: string[];
  }[];
  education: {
    title: string;
    organization: string;
    dateRange: string;
    lines: string[];
  }[];
  projects: {
    title: string;
    organization: string;
    dateRange: string;
    lines: string[];
  }[];
  certifications: {
    title: string;
    organization: string;
    dateRange: string;
    lines: string[];
  }[];
  skills: string[];
}

export type ResumeTemplateId = "classic" | "compact";

export interface TailoringChange {
  before: string;
  after: string;
  rationale: string;
}

export interface AtsKeyword {
  keyword: string;
  covered: boolean;
  hint?: string;
}

export interface MissingSkillPrompt {
  skill: string;
  prompt: string;
}

export interface TailoringResult {
  summary: string;
  changes: TailoringChange[];
  keywords: AtsKeyword[];
  variant: string | null;
  model: string;
  fields: ResumeFields;
  missingSkills: MissingSkillPrompt[];
}

export interface EnrichResult {
  fields: ResumeFields;
  model: string;
}

export interface EditResult {
  summary: string;
  changes: TailoringChange[];
  fields: ResumeFields;
  model: string;
}

/** The one `applications` row this extension needs — a subset of the full row. */
export interface ApplicationRecord {
  id: string;
  company: string;
  role: string;
  postingUrl: string | null;
  jobDescription: string | null;
  tailoredResume: ResumeFields | null;
  templateId: ResumeTemplateId | null;
}

export interface ProfileRecord {
  fullName: string | null;
  noticePeriod: string | null;
  workAuthorization: string | null;
  salaryExpectation: string | null;
  defaultTemplateId: ResumeTemplateId;
}

/** What the content-script bridge relays from the web app tab's localStorage. */
export interface BridgeSession {
  accessToken: string;
  refreshToken: string;
  /** Epoch seconds; used to decide when a refresh is due. */
  expiresAt: number;
  userEmail: string | null;
}
