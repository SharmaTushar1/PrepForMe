import { apiBaseUrl, functionsUrl, isConfigured, restUrl, supabaseKey } from "./config";
import { sendMessageSafe, type ProxyFetchResponse } from "./messages";
import type { GetSessionResponse } from "./messages";
import type {
  ApplicationRecord,
  AtsKeyword,
  EditResult,
  EnrichResult,
  MissingSkillPrompt,
  ProfileRecord,
  ResumeFields,
  ResumeTemplateId,
  TailoringChange,
  TailoringResult,
} from "./types";

export class NotSignedInError extends Error {
  constructor() {
    super("Open PrepFor.Me and sign in, then reload this page.");
  }
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Your session has expired. Sign in again to continue.");
  }
}

export class NotConfiguredError extends Error {
  constructor() {
    super(
      "Extension isn't configured. Add extension/.env.local (same Supabase values as the main app), run npm run build, and reload the unpacked extension.",
    );
  }
}

export function isAuthFailure(e: unknown): e is NotSignedInError | SessionExpiredError {
  return e instanceof NotSignedInError || e instanceof SessionExpiredError;
}

function assertConfigured(): void {
  if (!isConfigured) throw new NotConfiguredError();
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

/**
 * Fetch via the background service worker so Greenhouse (and any other host)
 * never has to satisfy Supabase/Vercel CORS from the content-script world.
 */
async function proxyFetch(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    responseType?: "text" | "base64";
  } = {},
): Promise<{ status: number; body: string; contentType: string | null }> {
  assertConfigured();
  const response = await sendMessageSafe<ProxyFetchResponse>({
    type: "PROXY_FETCH",
    url,
    method: init.method,
    headers: init.headers,
    body: init.body,
    responseType: init.responseType,
  });
  if (!response) {
    throw new Error("Extension background is unavailable. Reload the extension on chrome://extensions.");
  }
  if (!response.ok) {
    throw new Error(response.error);
  }
  return { status: response.status, body: response.body, contentType: response.contentType };
}

async function restRequest<T>(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<T> {
  const auth = await authHeaders();
  const response = await proxyFetch(`${restUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...auth,
      ...init.headers,
    },
    body: init.body,
  });
  if (response.status < 200 || response.status >= 300) {
    if (response.status === 401 || response.status === 403) {
      throw new SessionExpiredError();
    }
    throw new Error(postgrestErrorMessage(response.status, response.body));
  }
  if (response.status === 204 || !response.body) return null as T;
  return JSON.parse(response.body) as T;
}

function postgrestErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; hint?: string };
    if (parsed?.message) return parsed.hint ? `${parsed.message} (${parsed.hint})` : parsed.message;
  } catch {
    // not JSON
  }
  return `PrepFor.Me couldn't reach your account data (${status}).`;
}

interface ApplicationRow {
  id: string;
  company: string;
  role: string;
  posting_url: string | null;
  job_description: string | null;
  tailored_resume: unknown;
  template_id: string | null;
  resume_tailored?: boolean;
}

function toApplicationRecord(row: ApplicationRow): ApplicationRecord {
  const raw = row.tailored_resume;
  let tailoredResume: ResumeFields | null = null;
  let tailorSession: ApplicationRecord["tailorSession"] = null;

  if (raw && typeof raw === "object") {
    const obj = raw as {
      fields?: ResumeFields;
      summary?: string;
      changes?: TailoringChange[];
      keywords?: AtsKeyword[];
      missingSkills?: MissingSkillPrompt[];
      variant?: string | null;
      fullName?: string | null;
      experiences?: ResumeFields["experiences"];
      skills?: string[];
    };
    if (obj.fields && typeof obj.fields === "object") {
      tailoredResume = obj.fields;
      tailorSession = {
        summary: obj.summary ?? "",
        changes: Array.isArray(obj.changes) ? obj.changes : [],
        keywords: Array.isArray(obj.keywords) ? obj.keywords : [],
        missingSkills: Array.isArray(obj.missingSkills) ? obj.missingSkills : [],
        variant: obj.variant ?? null,
      };
    } else if (Array.isArray(obj.experiences) || Array.isArray(obj.skills)) {
      tailoredResume = obj as ResumeFields;
    }
  }

  return {
    id: row.id,
    company: row.company,
    role: row.role,
    postingUrl: row.posting_url,
    jobDescription: row.job_description,
    tailoredResume,
    tailorSession,
    templateId: row.template_id === "classic" || row.template_id === "compact" ? row.template_id : null,
  };
}

/** Strip hash/query noise and trailing slashes so boards.greenhouse.io/x/jobs/1
 * matches a row saved from a slightly different copy of the same link. */
function normalizePostingUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    // Keep query — some boards key the posting with it — but drop trailing slash.
    let href = parsed.toString();
    if (href.endsWith("/")) href = href.slice(0, -1);
    return href;
  } catch {
    return url.replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

function greenhouseJobId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/\/jobs\/(\d+)/i);
  return match?.[1] ?? null;
}

function companyCore(name: string): string {
  return name
    .replace(/\b(jobs|careers|hiring|inc\.?|llc\.?|ltd\.?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find an application that already has a tailored resume for this posting.
 * Exact URL first, then Greenhouse job-id, then fuzzy company+role — the
 * extension's scraped "SolarWinds Jobs" often won't equal the app's "SolarWinds".
 */
export async function findExistingApplication(input: {
  company: string;
  role: string;
  postingUrl: string | null;
}): Promise<ApplicationRecord | null> {
  const select = "id,company,role,posting_url,job_description,tailored_resume,template_id,resume_tailored";
  const urls = new Set<string>();
  if (input.postingUrl) {
    urls.add(input.postingUrl);
    urls.add(normalizePostingUrl(input.postingUrl));
  }

  for (const url of urls) {
    const existing = await restRequest<ApplicationRow[]>(
      `/applications?select=${select}&posting_url=eq.${encodeURIComponent(url)}&limit=1`,
    );
    if (existing[0]?.tailored_resume) return toApplicationRecord(existing[0]);
  }

  const jobId = greenhouseJobId(input.postingUrl);
  if (jobId) {
    const byJobId = await restRequest<ApplicationRow[]>(
      `/applications?select=${select}&posting_url=ilike.${encodeURIComponent(`%/jobs/${jobId}%`)}&limit=5`,
    );
    const hit = byJobId.find((row) => row.tailored_resume);
    if (hit) return toApplicationRecord(hit);
  }

  const company = companyCore(input.company) || input.company.trim();
  const role = input.role.trim();
  if (!company || !role) return null;

  // Pull a small set of tailored apps and score client-side — PostgREST can't
  // do "company contains SolarWinds AND role ~ Software Engineer" reliably
  // across naming variants without over-fetching.
  const candidates = await restRequest<ApplicationRow[]>(
    `/applications?select=${select}&tailored_resume=not.is.null&order=updated_at.desc&limit=40`,
  );

  const companyNeedle = company.toLowerCase();
  const roleNeedle = role.toLowerCase();
  let best: ApplicationRow | null = null;
  let bestScore = 0;

  for (const row of candidates) {
    if (!row.tailored_resume) continue;
    const rowCompany = row.company.toLowerCase();
    const rowRole = row.role.toLowerCase();
    let score = 0;
    if (rowCompany === companyNeedle || companyCore(row.company).toLowerCase() === companyNeedle) score += 3;
    else if (rowCompany.includes(companyNeedle) || companyNeedle.includes(companyCore(row.company).toLowerCase())) score += 2;
    if (rowRole === roleNeedle) score += 3;
    else if (rowRole.includes(roleNeedle) || roleNeedle.includes(rowRole)) score += 2;
    if (jobId && row.posting_url?.includes(`/jobs/${jobId}`)) score += 5;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }

  // Require at least a weak company+role agreement.
  if (best && bestScore >= 4) return toApplicationRecord(best);
  return null;
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

  const urls = new Set<string>();
  if (input.postingUrl) {
    urls.add(input.postingUrl);
    urls.add(normalizePostingUrl(input.postingUrl));
  }
  for (const url of urls) {
    const existing = await restRequest<ApplicationRow[]>(
      `/applications?select=${select}&posting_url=eq.${encodeURIComponent(url)}&limit=1`,
    );
    if (existing[0]) return toApplicationRecord(existing[0]);
  }

  const jobId = greenhouseJobId(input.postingUrl);
  if (jobId) {
    const byJobId = await restRequest<ApplicationRow[]>(
      `/applications?select=${select}&posting_url=ilike.${encodeURIComponent(`%/jobs/${jobId}%`)}&limit=1`,
    );
    if (byJobId[0]) return toApplicationRecord(byJobId[0]);
  }

  const company = companyCore(input.company) || input.company.trim();
  const existingByName = await restRequest<ApplicationRow[]>(
    `/applications?select=${select}&company=ilike.${encodeURIComponent(`%${company}%`)}&role=ilike.${encodeURIComponent(`%${input.role.trim()}%`)}&limit=5`,
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
      email: string | null;
      phone: string | null;
      notice_period: string | null;
      work_authorization: string | null;
      salary_expectation: string | null;
      default_template_id: string | null;
    }[]
  >("/profiles?select=full_name,email,phone,notice_period,work_authorization,salary_expectation,default_template_id&limit=1");
  const row = rows[0];
  if (!row) return null;
  return {
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    noticePeriod: row.notice_period,
    workAuthorization: row.work_authorization,
    salaryExpectation: row.salary_expectation,
    defaultTemplateId: row.default_template_id === "compact" ? "compact" : "classic",
  };
}

async function callTailorFunction<T>(body: Record<string, unknown>): Promise<T> {
  const auth = await authHeaders();
  const response = await proxyFetch(`${functionsUrl}/tailor-resume`, {
    method: "POST",
    headers: { "content-type": "application/json", ...auth },
    body: JSON.stringify(body),
  });
  if (response.status < 200 || response.status >= 300) {
    if (response.status === 401 || response.status === 403) {
      throw new SessionExpiredError();
    }
    throw new Error(refusalMessage(response.status, response.body));
  }
  return JSON.parse(response.body) as T;
}

function refusalMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    // not JSON
  }
  return `PrepFor.Me's tailoring service didn't respond (${status}).`;
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
  const response = await proxyFetch(`${apiBaseUrl}/api/render-resume-pdf`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ templateId, fields }),
    responseType: "base64",
  });
  if (response.status < 200 || response.status >= 300) {
    if (response.status === 401 || response.status === 403) {
      throw new SessionExpiredError();
    }
    let message = `Could not render the resume PDF (${response.status}).`;
    try {
      const parsed = JSON.parse(atob(response.body)) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      // leave the status message
    }
    throw new Error(message);
  }
  const binary = atob(response.body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: response.contentType || "application/pdf" });
}
