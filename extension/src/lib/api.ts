import { apiBaseUrl, functionsUrl, restUrl, supabaseKey } from "./config";
import { sendMessageSafe } from "./messages";
import type { GetSessionResponse } from "./messages";
import type {
  ApplicationRecord,
  EditResult,
  EnrichResult,
  ProfileRecord,
  ResumeFields,
  ResumeTemplateId,
  TailoringResult,
} from "./types";

export class NotSignedInError extends Error {
  constructor() {
    super("Open PrepFor.Me and sign in, then reload this page.");
  }
}

async function getAccessToken(): Promise<string> {
  const response = await sendMessageSafe<GetSessionResponse>({ type: "GET_SESSION" });
  if (!response?.ok) throw new NotSignedInError();
  return response.accessToken;
}

export async function checkSignedIn(): Promise<{ signedIn: boolean; email: string | null }> {
  const response = await sendMessageSafe<GetSessionResponse>({ type: "GET_SESSION" });
  if (!response?.ok) return { signedIn: false, email: null };
  return { signedIn: true, email: response.userEmail };
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    apikey: supabaseKey,
    Authorization: `Bearer ${token}`,
  };
}

async function restRequest<T>(
  path: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<T> {
  const auth = await authHeaders();
  const response = await fetch(`${restUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...auth,
      ...init.headers,
    },
  });
  if (!response.ok) {
    throw new Error(await postgrestErrorMessage(response));
  }
  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

async function postgrestErrorMessage(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return "Your session has expired. Reopen PrepFor.Me and sign in again.";
  }
  try {
    const body = (await response.json()) as { message?: string; hint?: string };
    if (body?.message) return body.hint ? `${body.message} (${body.hint})` : body.message;
  } catch {
    // not JSON
  }
  return `PrepFor.Me couldn't reach your account data (${response.status}).`;
}

interface ApplicationRow {
  id: string;
  company: string;
  role: string;
  posting_url: string | null;
  job_description: string | null;
  tailored_resume: unknown;
  template_id: string | null;
}

function toApplicationRecord(row: ApplicationRow): ApplicationRecord {
  const tailored =
    row.tailored_resume && typeof row.tailored_resume === "object"
      ? ((row.tailored_resume as { fields?: ResumeFields }).fields ??
        (row.tailored_resume as ResumeFields))
      : null;
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    postingUrl: row.posting_url,
    jobDescription: row.job_description,
    tailoredResume: tailored,
    templateId: row.template_id === "classic" || row.template_id === "compact" ? row.template_id : null,
  };
}

/**
 * Reuse an application already saved for this exact posting URL, so
 * revisiting a tab (or re-running tailor) doesn't fork a duplicate row.
 * Falls back to a case-insensitive company+role match when there's no URL
 * to key on, then creates a new row.
 */
export async function findOrCreateApplication(input: {
  company: string;
  role: string;
  postingUrl: string | null;
  jobDescription: string;
}): Promise<ApplicationRecord> {
  const select = "id,company,role,posting_url,job_description,tailored_resume,template_id";

  if (input.postingUrl) {
    const existing = await restRequest<ApplicationRow[]>(
      `/applications?select=${select}&posting_url=eq.${encodeURIComponent(input.postingUrl)}&limit=1`,
    );
    if (existing[0]) return toApplicationRecord(existing[0]);
  }

  const existingByName = await restRequest<ApplicationRow[]>(
    `/applications?select=${select}&company=ilike.${encodeURIComponent(input.company)}&role=ilike.${encodeURIComponent(input.role)}&limit=1`,
  );
  if (existingByName[0]) return toApplicationRecord(existingByName[0]);

  const created = await restRequest<ApplicationRow[]>("/applications", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      company: input.company,
      role: input.role,
      stage: "Saved",
      posting_url: input.postingUrl,
      job_description: input.jobDescription,
    }),
  });
  const row = created[0];
  if (!row) throw new Error("Could not save this application.");
  return toApplicationRecord(row);
}

export async function updateJobDescription(applicationId: string, jobDescription: string): Promise<void> {
  await restRequest(`/applications?id=eq.${applicationId}`, {
    method: "PATCH",
    body: JSON.stringify({ job_description: jobDescription }),
  });
}

/** Mirrors `serializeTailored` in the main app so the Materials tab reads this back cleanly. */
export async function saveTailoredResume(
  applicationId: string,
  fields: ResumeFields,
  session: {
    summary: string;
    changes: { before: string; after: string; rationale: string }[];
    keywords: { keyword: string; covered: boolean; hint?: string }[];
    missingSkills: { skill: string; prompt: string }[];
    variant: string | null;
  },
): Promise<void> {
  await restRequest(`/applications?id=eq.${applicationId}`, {
    method: "PATCH",
    body: JSON.stringify({
      resume_tailored: true,
      tailored_resume: {
        fields,
        summary: session.summary,
        changes: session.changes,
        keywords: session.keywords,
        missingSkills: session.missingSkills,
        variant: session.variant,
        briefs: {},
      },
    }),
  });
}

export async function loadProfile(): Promise<ProfileRecord | null> {
  const rows = await restRequest<
    {
      full_name: string | null;
      notice_period: string | null;
      work_authorization: string | null;
      salary_expectation: string | null;
      default_template_id: string | null;
    }[]
  >("/profiles?select=full_name,notice_period,work_authorization,salary_expectation,default_template_id&limit=1");
  const row = rows[0];
  if (!row) return null;
  return {
    fullName: row.full_name,
    noticePeriod: row.notice_period,
    workAuthorization: row.work_authorization,
    salaryExpectation: row.salary_expectation,
    defaultTemplateId: row.default_template_id === "compact" ? "compact" : "classic",
  };
}

async function callTailorFunction<T>(body: Record<string, unknown>): Promise<T> {
  const auth = await authHeaders();
  const response = await fetch(`${functionsUrl}/tailor-resume`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await refusalMessage(response));
  }
  return (await response.json()) as T;
}

async function refusalMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // not JSON
  }
  if (response.status === 401 || response.status === 403) {
    return "Your session has expired. Reopen PrepFor.Me and sign in again.";
  }
  return `PrepFor.Me's tailoring service didn't respond (${response.status}).`;
}

export function tailorResume(applicationId: string): Promise<TailoringResult> {
  return callTailorFunction<TailoringResult>({ mode: "tailor", applicationId });
}

export function enrichSkillGaps(
  applicationId: string,
  fields: ResumeFields,
  briefs: { skill: string; text: string }[],
): Promise<EnrichResult> {
  return callTailorFunction<EnrichResult>({ mode: "enrich", applicationId, fields, briefs });
}

export function editTailoredResume(
  applicationId: string,
  fields: ResumeFields,
  instruction: string,
): Promise<EditResult> {
  return callTailorFunction<EditResult>({ mode: "edit", applicationId, fields, instruction });
}

/** Renders the tailored fields to a one-page PDF server-side (same endpoint the web app's download button uses). */
export async function renderResumePdf(
  fields: ResumeFields,
  templateId: ResumeTemplateId,
): Promise<Blob> {
  const token = await getAccessToken();
  const response = await fetch(`${apiBaseUrl}/api/render-resume-pdf`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ templateId, fields }),
  });
  if (!response.ok) {
    let message = `Could not render the resume PDF (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  return await response.blob();
}
