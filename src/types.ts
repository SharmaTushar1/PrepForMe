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

export interface Application {
  id: string;
  company: string;
  role: string;
  level: string | null;
  stage: Stage;
  postingUrl: string | null;
  jobDescription: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  appliedAt: string | null;
  resumeTailored: boolean;
  createdAt: string;
  updatedAt: string;
  /** Rows in `prep_sources` for this role. */
  sourceCount: number;
  /** Rows in `recaps` for this role. */
  recapCount: number;
}

export interface ApplicationDraft {
  company: string;
  role: string;
  level?: string | null;
  stage?: Stage;
  postingUrl?: string | null;
  jobDescription?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
}

export interface Profile {
  id: string;
  fullName: string | null;
  headline: string | null;
  email: string | null;
  noticePeriod: string | null;
  workAuthorization: string | null;
  salaryExpectation: string | null;
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
  url: string | null;
  title: string | null;
  status: "pending" | "indexed" | "failed";
  createdAt: string;
}

export interface PrepCitation {
  label: string;
  layer: "company" | "role" | "personal" | "general";
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
