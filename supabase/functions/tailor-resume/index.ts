/**
 * Tailor a resume for one application JD.
 *
 * Modes:
 *   { mode: "tailor", applicationId } — proposed fields + missingSkills
 *   { mode: "enrich", applicationId, fields, briefs } — skill-gap rephrase
 *   { mode: "edit", applicationId, fields, instruction } — follow-up tweak only
 *
 * Never invents employers, titles, dates, or skills. Skill briefs become a
 * chip + 1–2 bullets under the best-matching role or an "Additional" block.
 * Writes only application tailored copy — the profile spine is not mutated.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.109.0";
import {
  errorResponse,
  jsonResponse,
  preflightResponse,
} from "../_shared/cors.ts";
import {
  ANTHROPIC_VERSION,
  HttpError,
  logUpstreamFailure,
  outputConfig,
  readEnvironment,
  readModelResponse,
  upstreamMessage,
} from "../_shared/model.ts";
import { assertUnderAllowance, spendAllowance } from "../_shared/quota.ts";

const MAX_OUTPUT_TOKENS = 8_000;

const ENTRY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "organization", "dateRange", "lines"],
  properties: {
    title: { type: "string" },
    organization: { type: "string" },
    dateRange: { type: "string" },
    lines: { type: "array", items: { type: "string" } },
  },
} as const;

const FIELDS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "fullName",
    "headline",
    "email",
    "phone",
    "location",
    "summary",
    "links",
    "experiences",
    "education",
    "projects",
    "certifications",
    "skills",
  ],
  properties: {
    fullName: { type: ["string", "null"] },
    headline: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    location: { type: ["string", "null"] },
    summary: { type: ["string", "null"] },
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "url"],
        properties: {
          label: { type: "string" },
          url: { type: "string" },
        },
      },
    },
    experiences: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "company", "startDate", "endDate", "bullets"],
        properties: {
          title: { type: "string" },
          company: { type: "string" },
          startDate: { type: ["string", "null"] },
          endDate: { type: ["string", "null"] },
          bullets: { type: "array", items: { type: "string" } },
        },
      },
    },
    education: { type: "array", items: ENTRY_SCHEMA },
    projects: { type: "array", items: ENTRY_SCHEMA },
    certifications: { type: "array", items: ENTRY_SCHEMA },
    skills: { type: "array", items: { type: "string" } },
  },
} as const;

const TAILOR_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "changes", "fields", "missingSkills", "variant"],
  properties: {
    summary: { type: "string" },
    variant: { type: ["string", "null"] },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["before", "after", "rationale"],
        properties: {
          before: { type: "string" },
          after: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
    fields: FIELDS_SCHEMA,
    missingSkills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["skill", "prompt"],
        properties: {
          skill: { type: "string" },
          prompt: { type: "string" },
        },
      },
    },
  },
} as const;

const ENRICH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fields"],
  properties: { fields: FIELDS_SCHEMA },
} as const;

const EDIT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "changes", "fields"],
  properties: {
    summary: {
      type: "string",
      description: "One sentence on what you changed — and only that.",
    },
    changes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["before", "after", "rationale"],
        properties: {
          before: { type: "string" },
          after: { type: "string" },
          rationale: { type: "string" },
        },
      },
    },
    fields: FIELDS_SCHEMA,
  },
} as const;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") {
    return errorResponse("This endpoint only accepts POST requests.", 405);
  }

  try {
    return await handle(req);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status);
    }
    console.error("tailor-resume failed", error);
    return errorResponse("Could not tailor the resume. Please try again.", 500);
  }
});

async function handle(req: Request): Promise<Response> {
  const env = readEnvironment("Resume tailor");
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    throw new HttpError("Sign in to tailor a resume.", 401);
  }

  const client = createClient(env.supabaseUrl, env.supabaseKey, {
    global: { headers: { Authorization: auth } },
  });
  const token = auth.slice("Bearer ".length);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    throw new HttpError("Your session expired. Sign in again.", 401);
  }
  const userId = userData.user.id;

  const body = (await req.json()) as {
    mode?: string;
    applicationId?: string;
    fields?: unknown;
    briefs?: { skill: string; text: string }[];
    instruction?: string;
  };

  const applicationId = body.applicationId?.trim();
  if (!applicationId) {
    throw new HttpError("applicationId is required.", 400);
  }

  const mode =
    body.mode === "enrich" ? "enrich" : body.mode === "edit" ? "edit" : "tailor";

  await assertUnderAllowance(client, userId, "tailor");

  const application = await loadApplication(client, userId, applicationId);
  const spine = await loadSpine(client, userId);

  if (mode === "edit") {
    const instruction = (body.instruction ?? "").trim();
    if (instruction.length < 3) {
      throw new HttpError("Say what you want changed.", 400);
    }
    if (!body.fields || typeof body.fields !== "object") {
      throw new HttpError("Current tailored fields are required to edit.", 400);
    }

    await spendAllowance(client, userId, "tailor", applicationId);
    const result = await callModel({
      env,
      schema: EDIT_SCHEMA,
      system: EDIT_SYSTEM,
      user: JSON.stringify({
        instruction,
        jobDescription: application.job_description,
        currentFields: body.fields,
      }),
    });
    const constrained = constrainEdit(
      body.fields as Record<string, unknown>,
      result.fields as Record<string, unknown>,
      instruction,
    );
    return jsonResponse({
      summary: result.summary ?? "Applied your edit.",
      changes: result.changes ?? [],
      fields: constrained,
      model: env.model,
    });
  }

  if (mode === "enrich") {
    const briefs = (body.briefs ?? []).filter(
      (b) => typeof b.skill === "string" && typeof b.text === "string" && b.text.trim().length >= 8,
    );
    if (!briefs.length) {
      return jsonResponse({
        fields: pinSpineFacts(body.fields ?? spine.fields, spine.fields),
        model: "none",
      });
    }

    await spendAllowance(client, userId, "tailor", applicationId);
    const result = await callModel({
      env,
      schema: ENRICH_SCHEMA,
      system: ENRICH_SYSTEM,
      user: JSON.stringify({
        jobDescription: application.job_description,
        spine: spine.fields,
        currentFields: body.fields ?? spine.fields,
        briefs,
      }),
    });
    return jsonResponse({
      fields: pinSpineFacts(result.fields, spine.fields),
      model: env.model,
    });
  }

  if (!application.job_description?.trim()) {
    throw new HttpError("Paste a job description before tailoring.", 400);
  }

  await spendAllowance(client, userId, "tailor", applicationId);
  const result = await callModel({
    env,
    schema: TAILOR_SCHEMA,
    system: TAILOR_SYSTEM,
    user: JSON.stringify({
      company: application.company,
      role: application.role,
      jobDescription: application.job_description,
      spine: spine.fields,
    }),
  });

  const fields = pinSpineFacts(result.fields, spine.fields);

  return jsonResponse({
    summary: result.summary,
    changes: result.changes ?? [],
    keywords: spineKeywords(application.job_description, spine.fields),
    variant: result.variant ?? null,
    fields,
    missingSkills: result.missingSkills ?? [],
    model: env.model,
  });
}

const TAILOR_SYSTEM = `You tailor a candidate's resume fields for one job description.

Integrity rules (non-negotiable):
- Never invent employers, job titles, employment dates, degrees, phone numbers, emails, locations, links, or skills they did not list.
- Contact and identity facts are frozen: copy fullName, email, phone, location, and links from the spine EXACTLY — character for character. Never substitute another email (including an account/login email), never blank a phone the spine has, never invent contact details the spine lacks.
- Experience facts are frozen: every spine employer, title, and startDate/endDate must appear unchanged. You may only rephrase or trim bullets under those rows.
- Education title/organization/dateRange are frozen the same way when present on the spine.
- You may rephrase existing bullets to lead with the JD's language when the work is already there.
- Prefer ___ placeholders over fabricating metrics.
- missingSkills: JD skills/tools clearly absent from the spine. Each needs a short prompt asking the candidate to brief their real experience — or skip. Cap at 5.
- Do not add employers. Output valid JSON matching the schema.

Weighting, when the tailored resume would otherwise exceed one page:
- Never drop: name, contact info (email, phone, links, location), any employer/title/date row, or the education section entirely (keep at least a one-line education entry when the spine has education).
- Score every bullet, project, achievement, and skill against the JD's stated must-haves and nice-to-haves individually — never decide by section. A project that is strong evidence for a must-have outranks a weak bullet under a job, even though "projects" is usually optional and "experience" isn't. Split JD language into must-have vs nice-to-have when the posting signals it (e.g. "We'd love to hear from you if" vs "While not required, it's an added plus").
- Trim in this order before cutting anything else: (1) summary/headline — shrink to 1–2 lines or cut entirely, (2) JD-irrelevant bullets under experience that aren't the strongest 1–2 proof points of seniority/scope for that role, (3) JD-irrelevant skill chips that aren't foundational for the must-haves. Only then consider cutting the single least-relevant project or achievement — never all of them, and never one that's the strongest available evidence for a stated requirement.
- Every omission gets a rationale in \`changes\`, same as every rewrite: before = the omitted item, after = "(omitted)", rationale tied to a specific JD line or its absence.`;

const ENRICH_SYSTEM = `You attach skill-gap briefs to tailored resume fields.

For each brief with enough text:
- Add the skill name to skills if missing.
- Produce 1–2 bullets from THEIR text only — no invented employers, titles, dates, or metrics.
- Attach bullets under the best-matching existing role; if none fit, use title "Additional" and company "Additional" with null dates.
Gap-fills only add. Never remove or shrink an existing project, achievement, education entry, or unrelated bullet to make room for a confirmed brief.
Never change contact fields (email, phone, location, links, fullName) or employer/title/dates — copy them through unchanged.
Never edit the profile spine. Prefer ___ over inventing numbers. Output JSON matching the schema.`;

const EDIT_SYSTEM = `You apply a single follow-up edit to an already-tailored resume.

The user sends currentFields plus a short instruction (e.g. "change my email to x@y.com", "make the headline Platform Engineer", "shorten the first C3 bullet").

Rules (non-negotiable):
- Apply ONLY what the instruction asks. Every other field must be copied EXACTLY from currentFields — same strings, same arrays, same order.
- Do not re-tailor for the job description. Do not add keywords, rewrite unrelated bullets, or "improve" anything that was not asked.
- Do not invent employers, titles, dates, skills, metrics, or contact details the instruction did not supply.
- If the instruction is ambiguous or would require inventing facts, leave fields unchanged and explain that in summary.
- List each concrete edit in \`changes\` (before / after / rationale). Output valid JSON matching the schema.`;

/** Lock every section the instruction did not name so a chatty model can't re-tailor. */
function constrainEdit(
  current: Record<string, unknown>,
  model: Record<string, unknown>,
  instruction: string,
): Record<string, unknown> {
  const t = instruction.toLowerCase();
  const touches = (...needles: string[]) => needles.some((n) => t.includes(n));

  const out: Record<string, unknown> = { ...current };
  let any = false;

  if (touches("email", "e-mail", "mail address")) {
    out.email = model.email ?? current.email;
    any = true;
  }
  if (touches("phone", "mobile", "cell", "whatsapp")) {
    out.phone = model.phone ?? current.phone;
    any = true;
  }
  if (touches("location", "city", "based in", "live in")) {
    out.location = model.location ?? current.location;
    any = true;
  }
  if (touches("name", "full name")) {
    out.fullName = model.fullName ?? current.fullName;
    any = true;
  }
  if (touches("headline", "tagline") ||
    (touches("title") && !touches("job title", "role title", "title at", "position"))) {
    out.headline = model.headline ?? current.headline;
    any = true;
  }
  if (touches("summary", "about me", "profile paragraph", "objective")) {
    out.summary = model.summary ?? current.summary;
    any = true;
  }
  if (touches("link", "linkedin", "github", "portfolio", "url")) {
    out.links = model.links ?? current.links;
    any = true;
  }
  if (touches("skill")) {
    out.skills = model.skills ?? current.skills;
    any = true;
  }
  if (
    touches(
      "bullet",
      "experience",
      "job title",
      "role title",
      "title at",
      "position",
      "company",
      "employer",
      "work history",
      "role at",
    )
  ) {
    out.experiences = model.experiences ?? current.experiences;
    any = true;
  }
  if (touches("education", "degree", "university", "college", "school")) {
    out.education = model.education ?? current.education;
    any = true;
  }
  if (touches("project")) {
    out.projects = model.projects ?? current.projects;
    any = true;
  }
  if (touches("certif", "license", "licence")) {
    out.certifications = model.certifications ?? current.certifications;
    any = true;
  }

  // Vague instruction ("fix the typo", "make the first bullet shorter"): allow
  // the model fields but keep contact identity from current.
  if (!any) {
    return {
      ...model,
      fullName: current.fullName,
      email: current.email,
      phone: current.phone,
      location: current.location,
      links: current.links,
    };
  }
  return out;
}

/**
 * The model is asked to keep facts, but it still drifts (account email instead of
 * resume email, dropped phone, tweaked dates). Overwrite identity/contact and
 * employer/title/date rows from the spine after every model call so those are
 * never left to the prompt.
 */
function pinSpineFacts(raw: unknown, spine: Record<string, unknown>): Record<string, unknown> {
  const fields =
    raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};

  for (const key of ["fullName", "email", "phone", "location"] as const) {
    const spineVal = spine[key];
    if (spineVal !== undefined && spineVal !== null && String(spineVal).trim() !== "") {
      fields[key] = spineVal;
    } else if (fields[key] === undefined) {
      fields[key] = spineVal ?? null;
    }
  }
  if (Array.isArray(spine.links) && (spine.links as unknown[]).length > 0) {
    fields.links = spine.links;
  } else if (!Array.isArray(fields.links)) {
    fields.links = [];
  }

  type Exp = {
    title?: string;
    company?: string;
    startDate?: string | null;
    endDate?: string | null;
    bullets?: string[];
  };
  const spineExps = Array.isArray(spine.experiences)
    ? (spine.experiences as Exp[])
    : [];
  const modelExps = Array.isArray(fields.experiences)
    ? (fields.experiences as Exp[])
    : [];

  const modelByKey = new Map<string, Exp>();
  for (const exp of modelExps) {
    const key = `${normFact(exp.company)}::${normFact(exp.title)}`;
    modelByKey.set(key, exp);
  }

  // Every spine role must survive; bullets may come from the model when present.
  fields.experiences = spineExps.map((spineExp) => {
    const key = `${normFact(spineExp.company)}::${normFact(spineExp.title)}`;
    const modelExp = modelByKey.get(key);
    return {
      title: spineExp.title,
      company: spineExp.company,
      startDate: spineExp.startDate ?? null,
      endDate: spineExp.endDate ?? null,
      bullets: Array.isArray(modelExp?.bullets) && modelExp!.bullets!.length
        ? modelExp!.bullets
        : (spineExp.bullets ?? []),
    };
  });

  // Keep any "Additional" block the enrich path attached.
  for (const exp of modelExps) {
    if (normFact(exp.company) === "additional" || normFact(exp.title) === "additional") {
      (fields.experiences as Exp[]).push({
        title: exp.title ?? "Additional",
        company: exp.company ?? "Additional",
        startDate: null,
        endDate: null,
        bullets: exp.bullets ?? [],
      });
    }
  }

  type Entry = {
    title?: string;
    organization?: string;
    dateRange?: string;
    lines?: string[];
  };
  for (const section of ["education", "projects", "certifications"] as const) {
    const spineEntries = Array.isArray(spine[section])
      ? (spine[section] as Entry[])
      : [];
    const modelEntries = Array.isArray(fields[section])
      ? (fields[section] as Entry[])
      : [];
    const modelByTitle = new Map(
      modelEntries.map((e) => [
        `${normFact(e.title)}::${normFact(e.organization)}`,
        e,
      ]),
    );

    if (section === "education" && spineEntries.length > 0) {
      // Education is a floor: keep every spine row; model may trim lines only.
      fields[section] = spineEntries.map((spineEntry) => {
        const key = `${normFact(spineEntry.title)}::${normFact(spineEntry.organization)}`;
        const modelEntry = modelByTitle.get(key);
        return {
          title: spineEntry.title,
          organization: spineEntry.organization,
          dateRange: spineEntry.dateRange ?? "",
          lines:
            Array.isArray(modelEntry?.lines) && modelEntry!.lines!.length
              ? modelEntry!.lines
              : (spineEntry.lines ?? []),
        };
      });
    } else if (spineEntries.length > 0) {
      // Projects/certs: pin facts on rows the model kept; do not resurrect
      // ones it omitted for space (weighting allows cutting the least-relevant).
      fields[section] = modelEntries
        .map((modelEntry) => {
          const key = `${normFact(modelEntry.title)}::${normFact(modelEntry.organization)}`;
          const spineEntry = spineEntries.find(
            (s) =>
              `${normFact(s.title)}::${normFact(s.organization)}` === key,
          );
          if (!spineEntry) return null;
          return {
            title: spineEntry.title,
            organization: spineEntry.organization,
            dateRange: spineEntry.dateRange ?? "",
            lines: Array.isArray(modelEntry.lines)
              ? modelEntry.lines
              : (spineEntry.lines ?? []),
          };
        })
        .filter(Boolean);
    }
  }

  return fields;
}

function normFact(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function callModel(input: {
  env: ReturnType<typeof readEnvironment>;
  schema: unknown;
  system: string;
  user: string;
}): Promise<Record<string, unknown>> {
  const { model, effort, anthropicBase, anthropicKey } = input.env;
  const response = await fetch(`${anthropicBase}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: input.system,
      messages: [{ role: "user", content: input.user }],
      output_config: outputConfig(model, effort, {
        type: "json_schema",
        schema: input.schema,
      }),
    }),
  });

  if (!response.ok) {
    await logUpstreamFailure("tailor-resume", response);
    throw new HttpError(upstreamMessage(response.status), 502);
  }

  const result = await readModelResponse(response, "resume tailor");
  if (result.raw && typeof result.raw === "object") {
    return result.raw as Record<string, unknown>;
  }
  try {
    return JSON.parse(String(result.raw ?? "")) as Record<string, unknown>;
  } catch {
    throw new HttpError("The tailor model returned unreadable JSON.", 502);
  }
}

async function loadApplication(
  client: SupabaseClient,
  userId: string,
  applicationId: string,
) {
  const { data, error } = await client
    .from("applications")
    .select("id, company, role, job_description")
    .eq("id", applicationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new HttpError("Could not load the application.", 500);
  if (!data) throw new HttpError("Application not found.", 404);
  return data;
}

async function loadSpine(client: SupabaseClient, userId: string) {
  type Line = { text: string; enabled: boolean; sort_order: number };
  type EntryRow = {
    title: string;
    organization: string;
    date_range: string;
    sort_order: number;
  };

  const [
    { data: profile },
    { data: experiences },
    { data: skills },
    { data: education },
    { data: projects },
    { data: certifications },
  ] = await Promise.all([
    client
      .from("profiles")
      .select(
        "full_name, headline, email, phone, location, summary, links, base_resume_id",
      )
      .eq("id", userId)
      .maybeSingle(),
    client
      .from("experiences")
      .select(
        "title, company, start_date, end_date, sort_order, experience_bullets(text, enabled, sort_order)",
      )
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    client
      .from("skills")
      .select("name, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    client
      .from("education")
      .select(
        "title, organization, date_range, sort_order, education_lines(text, enabled, sort_order)",
      )
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    client
      .from("projects")
      .select(
        "title, organization, date_range, sort_order, project_lines(text, enabled, sort_order)",
      )
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
    client
      .from("certifications")
      .select(
        "title, organization, date_range, sort_order, certification_lines(text, enabled, sort_order)",
      )
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
  ]);

  const mapEntries = (
    rows:
      | (EntryRow & {
          education_lines?: Line[] | null;
          project_lines?: Line[] | null;
          certification_lines?: Line[] | null;
        })[]
      | null,
    lineKey: "education_lines" | "project_lines" | "certification_lines",
  ) =>
    (rows ?? []).map((e) => ({
      title: e.title,
      organization: e.organization,
      dateRange: e.date_range,
      lines: ((e[lineKey] as Line[] | null | undefined) ?? [])
        .filter((l) => l.enabled)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((l) => l.text),
    }));

  let educationFields = mapEntries(education, "education_lines");
  let projectFields = mapEntries(projects, "project_lines");
  let certFields = mapEntries(certifications, "certification_lines");
  // Profile is the editable spine; the base parse is the resume-as-printed.
  // Contact from the parse wins when present — otherwise tailor substitutes
  // the login email for the one on the PDF.
  let email = (profile?.email as string | null) ?? null;
  let fullName = (profile?.full_name as string | null) ?? null;
  let location = (profile?.location as string | null) ?? null;
  let summary = (profile?.summary as string | null) ?? null;
  let phone = (profile?.phone as string | null) ?? null;
  let filledLinks = Array.isArray(profile?.links)
    ? (profile.links as { label?: string; url?: string }[])
        .filter((l) => typeof l?.url === "string" && l.url.length > 0)
        .map((l) => ({ label: String(l.label ?? ""), url: String(l.url) }))
    : [];

  if (profile?.base_resume_id) {
    const { data: report } = await client
      .from("resume_reports")
      .select("parsed")
      .eq("resume_id", profile.base_resume_id)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const parsed = report?.parsed as Record<string, unknown> | null;
    if (parsed && typeof parsed === "object") {
      const asEntries = (key: string) => {
        const arr = parsed[key];
        if (!Array.isArray(arr)) return [];
        return arr
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .map((e) => ({
            title: String(e.title ?? ""),
            organization: String(e.organization ?? ""),
            dateRange: String(e.dateRange ?? ""),
            lines: Array.isArray(e.lines)
              ? e.lines.map((l) => String(l))
              : [],
          }))
          .filter((e) => e.title.length > 0);
      };
      if (!educationFields.length) educationFields = asEntries("education");
      if (!projectFields.length) projectFields = asEntries("projects");
      if (!certFields.length) certFields = asEntries("certifications");

      if (typeof parsed.email === "string" && parsed.email.trim()) {
        email = parsed.email.trim();
      }
      if (typeof parsed.phone === "string" && parsed.phone.trim()) {
        phone = parsed.phone.trim();
      }
      if (typeof parsed.location === "string" && parsed.location.trim()) {
        location = parsed.location.trim();
      }
      if (typeof parsed.fullName === "string" && parsed.fullName.trim()) {
        fullName = parsed.fullName.trim();
      }
      if (!summary && typeof parsed.summary === "string") summary = parsed.summary;
      if (Array.isArray(parsed.links) && parsed.links.length) {
        const fromParse = parsed.links
          .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
          .map((l) => ({
            label: String(l.label ?? ""),
            url: String(l.url ?? ""),
          }))
          .filter((l) => l.url.length > 0);
        if (fromParse.length) filledLinks = fromParse;
      }
    }
  }

  const fields = {
    fullName,
    headline: profile?.headline ?? null,
    email,
    phone,
    location,
    summary,
    links: filledLinks,
    experiences: (experiences ?? []).map(
      (e: {
        title: string;
        company: string;
        start_date: string | null;
        end_date: string | null;
        experience_bullets: Line[] | null;
      }) => ({
        title: e.title,
        company: e.company,
        startDate: e.start_date,
        endDate: e.end_date,
        bullets: (e.experience_bullets ?? [])
          .filter((b) => b.enabled)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((b) => b.text),
      }),
    ),
    education: educationFields,
    projects: projectFields,
    certifications: certFields,
    skills: (skills ?? []).map((s: { name: string }) => s.name),
  };

  return { fields };
}

/** Lightweight keyword list for the Materials UI — not billed separately. */
function spineKeywords(
  jd: string,
  fields: { skills: string[]; experiences: { bullets: string[] }[] },
) {
  const text = [
    ...fields.skills,
    ...fields.experiences.flatMap((e) => e.bullets),
  ]
    .join(" ")
    .toLowerCase();
  const words = jd
    .toLowerCase()
    .match(/\b[a-z][a-z0-9+#.]{2,}\b/g);
  if (!words) return [];
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "you",
    "our",
    "will",
    "are",
    "this",
    "that",
    "from",
    "have",
    "your",
    "job",
    "role",
    "team",
    "work",
    "experience",
    "ability",
    "using",
    "etc",
  ]);
  const counts = new Map<string, number>();
  for (const w of words) {
    if (stop.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([keyword]) => ({
      keyword,
      covered: text.includes(keyword),
      hint: text.includes(keyword)
        ? undefined
        : "only add this if you've actually done it.",
    }));
}
