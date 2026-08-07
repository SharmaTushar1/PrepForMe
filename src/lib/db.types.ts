/**
 * Row shapes for the tables in `supabase/migrations/`. Hand-maintained so the
 * data layer has a single definition of what comes back over the wire; keep
 * these in step with the SQL.
 */
import type { ResumeStatus, Stage } from "../types";
import type {
  AtsCategoryId,
  AtsReport,
  ParsedResume,
  ResumeEditStatus,
} from "./ai/types";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  headline: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  links: { label: string; url: string }[] | null;
  summary: string | null;
  notice_period: string | null;
  work_authorization: string | null;
  salary_expectation: string | null;
  base_resume_id: string | null;
  default_template_id: string;
  created_at: string;
  updated_at: string;
}

export type ReferralChannelRow = "invite" | "message";

export interface UserSettingsRow {
  user_id: string;
  referral_channel: ReferralChannelRow;
  linkedin_premium: boolean;
  char_limit: number;
  nudge_recaps: boolean;
  flag_stale_applications: boolean;
  flag_stale_days: number;
  plan: "free" | "pro";
  created_at: string;
  updated_at: string;
}

export interface ExperienceRow {
  id: string;
  user_id: string;
  title: string;
  company: string;
  start_date: string | null;
  end_date: string | null;
  summary: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ExperienceBulletRow {
  id: string;
  user_id: string;
  experience_id: string;
  text: string;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

export interface SkillRow {
  id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface EducationRow {
  id: string;
  user_id: string;
  title: string;
  organization: string;
  date_range: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface EducationLineRow {
  id: string;
  user_id: string;
  education_id: string;
  text: string;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProjectRow {
  id: string;
  user_id: string;
  title: string;
  organization: string;
  date_range: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectLineRow {
  id: string;
  user_id: string;
  project_id: string;
  text: string;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

export interface CertificationRow {
  id: string;
  user_id: string;
  title: string;
  organization: string;
  date_range: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CertificationLineRow {
  id: string;
  user_id: string;
  certification_id: string;
  text: string;
  enabled: boolean;
  sort_order: number;
  created_at: string;
}

export type EmploymentTypeRow = "full_time" | "contract" | "intern" | "other";

export interface ApplicationRow {
  id: string;
  user_id: string;
  company: string;
  role: string;
  level: string | null;
  stage: Stage;
  posting_url: string | null;
  company_domain: string | null;
  company_id: string | null;
  role_id: string | null;
  level_id: string | null;
  specialty: string | null;
  employment_type: EmploymentTypeRow | null;
  tailored_resume: unknown | null;
  template_id: string | null;
  job_description: string | null;
  next_action: string | null;
  next_action_at: string | null;
  applied_at: string | null;
  resume_tailored: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatalogLevelRow {
  id: string;
  label: string;
  sort_order: number;
}

export interface CatalogCompanyRow {
  id: string;
  name: string;
  domain: string | null;
  linkedin_company_id: string | null;
}

export interface CatalogRoleRow {
  id: string;
  name: string;
}

export interface CatalogRoleAliasRow {
  alias: string;
  role_id: string;
}

export interface StageEventRow {
  id: string;
  application_id: string;
  from_stage: Stage | null;
  to_stage: Stage;
  occurred_at: string;
}

export type RecapOutcome = "rough" | "ok" | "went_well";

export interface RecapRow {
  id: string;
  application_id: string;
  round_type: string;
  round_number: number | null;
  questions: string | null;
  outcome: RecapOutcome | null;
  notes: string | null;
  occurred_on: string;
  created_at: string;
}

export type PrepSourceKind =
  | "company_blog"
  | "careers"
  | "docs"
  | "news"
  | "custom";

export interface PrepSourceRow {
  id: string;
  application_id: string;
  kind: PrepSourceKind;
  input_kind: "url" | "pdf" | "paste";
  scope: "company" | "role";
  url: string | null;
  title: string | null;
  storage_path: string | null;
  paste_body: string | null;
  status: "pending" | "indexed" | "failed";
  error: string | null;
  created_at: string;
}

export interface PrepMessageRow {
  id: string;
  application_id: string;
  role: "user" | "assistant";
  content: string;
  citations: PrepCitation[];
  created_at: string;
}

/** Which knowledge layer an answer drew on — rendered as the provenance chips. */
export interface PrepCitation {
  label: string;
  layer: "company" | "role" | "personal" | "general";
}

export interface ResumeRow {
  id: string;
  user_id: string;
  /** `{user_id}/{resume_id}.pdf` inside the private `resumes` bucket. */
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  /** Null until the analyzer has opened the file. */
  page_count: number | null;
  status: ResumeStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The two jsonb columns are the same shapes the provider returns, not loose
 * records — `src/lib/ai/types.ts` is the single definition of both, and the
 * Edge Function writes what it just returned.
 */
export interface ResumeReportRow {
  id: string;
  user_id: string;
  resume_id: string;
  model: string;
  overall_score: number;
  summary: string | null;
  report: AtsReport;
  parsed: ParsedResume;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

/**
 * One rewrite pass. Inserted as `running` before the model call, so the row is
 * also the lock a second press is refused against.
 */
export interface ResumeImprovementRow {
  id: string;
  user_id: string;
  resume_id: string;
  report_id: string;
  model: string;
  status: "running" | "done" | "failed";
  error: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * One proposed rewrite of one line. `original` is verbatim from the parse and is
 * the key an accepted rewrite is substituted on, so nothing may normalise it.
 */
export interface ResumeEditRow {
  id: string;
  user_id: string;
  improvement_id: string;
  resume_id: string;
  report_id: string;
  category: AtsCategoryId;
  finding_title: string;
  original: string;
  suggested: string;
  note: string;
  has_blank: boolean;
  flag: string;
  status: ResumeEditStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
