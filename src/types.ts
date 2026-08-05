export type Stage =
  | "Saved"
  | "Applied"
  | "Screen"
  | "Technical"
  | "Onsite"
  | "Offer"
  | "Rejected"
  | "Withdrawn";

export type Tab = "materials" | "referrals" | "prep" | "debriefs";

export type TrackerView = "board" | "table";

export type ReferralChannel = "invite" | "message";

export type RecapOutcome = "rough" | "ok" | "went_well";

// ------------------------------------------------------------------ domain

export type EmploymentType = "full_time" | "contract" | "intern" | "other";

export interface Application {
  id: string;
  company: string;
  role: string;
  level: string | null;
  stage: Stage;
  postingUrl: string | null;
  /** Confirmed domain for first-party URL detection, e.g. abnormal.ai */
  companyDomain: string | null;
  /** Catalog company slug when picked; null = custom. */
  companyId: string | null;
  /** Catalog role family slug when picked; null = custom. */
  roleId: string | null;
  /** Catalog level id (mid, senior, …); null if unset. */
  levelId: string | null;
  /** Optional focus within the role family (Frontend, Enterprise, …). */
  specialty: string | null;
  employmentType: EmploymentType | null;
  /** LinkedIn org id from catalog when companyId is set; for referral search. */
  linkedinCompanyId: string | null;
  jobDescription: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  appliedAt: string | null;
  resumeTailored: boolean;
  createdAt: string;
  updatedAt: string;
  /**
   * Sources behind this role: its own `prep_sources` rows plus company-scope
   * ones from sibling roles at the same company, which ground its answers too.
   */
  sourceCount: number;
  /** Rows in `recaps` for this role. */
  recapCount: number;
}

export interface ApplicationDraft {
  company: string;
  role: string;
  level?: string | null;
  companyId?: string | null;
  roleId?: string | null;
  levelId?: string | null;
  specialty?: string | null;
  employmentType?: EmploymentType | null;
  stage?: Stage;
  postingUrl?: string | null;
  companyDomain?: string | null;
  jobDescription?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
}

export interface CatalogLevel {
  id: string;
  label: string;
  sortOrder: number;
}

export interface CatalogCompany {
  id: string;
  name: string;
  domain: string | null;
  linkedinCompanyId: string | null;
}

export interface CatalogRole {
  id: string;
  name: string;
}

export interface Profile {
  id: string;
  fullName: string | null;
  headline: string | null;
  email: string | null;
  noticePeriod: string | null;
  workAuthorization: string | null;
  salaryExpectation: string | null;
  /** The upload that counts as this user's canonical resume. */
  baseResumeId: string | null;
}

export type ResumeStatus = "uploaded" | "analyzing" | "analyzed" | "failed";

/** One uploaded PDF. The file itself lives in the private `resumes` bucket. */
export interface Resume {
  id: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  /** Null until an analyzer has opened the file. */
  pageCount: number | null;
  status: ResumeStatus;
  /** What went wrong, written for the user — shown verbatim. */
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExperienceBullet {
  id: string;
  experienceId: string;
  text: string;
  enabled: boolean;
  sortOrder: number;
}

export interface Experience {
  id: string;
  title: string;
  company: string;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
  sortOrder: number;
  bullets: ExperienceBullet[];
}

export interface Skill {
  id: string;
  name: string;
  sortOrder: number;
}

export interface Recap {
  id: string;
  applicationId: string;
  roundType: string;
  roundNumber: number | null;
  questions: string | null;
  outcome: RecapOutcome | null;
  notes: string | null;
  occurredOn: string;
  createdAt: string;
}

export interface RecapDraft {
  applicationId: string;
  roundType: string;
  roundNumber?: number | null;
  questions: string;
  outcome: RecapOutcome | null;
  notes: string;
  occurredOn?: string;
}

export interface UserSettings {
  referralChannel: ReferralChannel;
  linkedinPremium: boolean;
  charLimit: number;
  nudgeRecaps: boolean;
  flagStaleApplications: boolean;
  flagStaleDays: number;
  plan: "free" | "pro";
}

export interface PrepSource {
  id: string;
  applicationId: string;
  kind: "company_blog" | "careers" | "docs" | "news" | "custom";
  inputKind: "url" | "pdf" | "paste";
  scope: "company" | "role";
  url: string | null;
  title: string | null;
  status: "pending" | "indexed" | "failed";
  error: string | null;
  createdAt: string;
}

export interface PrepCitation {
  label: string;
  layer: "company" | "role" | "personal" | "general";
  provenance?: string;
  claimKind?: string;
  sourceUrl?: string | null;
}

export interface PrepClaimDraft {
  content: string;
  claimKind: "company_fact" | "interview_process";
  provenance: "candidate_report" | "ai_inferred";
}

export interface PrepMessage {
  id: string;
  applicationId: string;
  role: "user" | "assistant";
  content: string;
  citations: PrepCitation[];
  createdAt: string;
}

/**
 * Funnel counts derived from `applications` + `application_stage_events`. Every
 * rate is null until there's something to divide by — the product's whole point
 * is that it won't show a number it can't back up.
 */
export interface FunnelMetrics {
  total: number;
  active: number;
  applied: number;
  responded: number;
  interviewed: number;
  offers: number;
  responseRate: number | null;
  interviewRate: number | null;
}

// ---------------------------------------------------------------- tour / UI

export interface TourStep {
  /** Route this step is shown on. ":id" resolves to the deepest application. */
  path?: string;
  tab?: Tab;
  /** Skipped entirely when the user has no applications yet. */
  requiresApplication?: boolean;
  sel: string | null;
  title: string;
  hint?: string;
  body: string;
}

export interface Spot {
  centered?: boolean;
  t?: number;
  l?: number;
  w?: number;
  h?: number;
  ttTop?: number;
  ttLeft?: number;
  below?: boolean;
  ttW?: number;
}

/** UI-only state. Everything the user owns lives in Postgres, not here. */
export interface UiState {
  demo: number;
  obStep: number;
  trackerView: TrackerView;
  extOpen: boolean;
  tourOpen: boolean;
  tourStep: number;
  spot: Spot | null;
  /** Application whose prep space just gained a recap, for the "leveled up" cue. */
  justLeveled: string | null;
  contactOpen: boolean;
  contactSent: boolean;
  addRoleOpen: boolean;
}
