/**
 * Row shapes for the tables in `supabase/migrations/`. Hand-maintained so the
 * data layer has a single definition of what comes back over the wire; keep
 * these in step with the SQL.
 */
import type { Stage } from "../types";

export interface ProfileRow {
  id: string;
  full_name: string | null;
  headline: string | null;
  email: string | null;
  notice_period: string | null;
  work_authorization: string | null;
  salary_expectation: string | null;
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

export interface ApplicationRow {
  id: string;
  user_id: string;
  company: string;
  role: string;
  level: string | null;
  stage: Stage;
  posting_url: string | null;
  job_description: string | null;
  next_action: string | null;
  next_action_at: string | null;
  applied_at: string | null;
  resume_tailored: boolean;
  created_at: string;
  updated_at: string;
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
  url: string | null;
  title: string | null;
  status: "pending" | "indexed" | "failed";
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
