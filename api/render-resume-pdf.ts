/**
 * POST /api/render-resume-pdf
 *
 * Single-file on purpose: with root `"type": "module"`, Vercel runs this as ESM.
 * Relative imports into `../src/` (and even some multi-file api graphs) crash the
 * isolate at boot with FUNCTION_INVOCATION_FAILED — before any 401 can return.
 * Chromium via `@sparticuz/chromium-min` + remote x64 pack (size budget).
 */

import type { VercelRequest, VercelResponse } from "@vercel/node";

type ResumeTemplateId = "classic" | "compact";

interface ResumeFields {
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

function isResumeTemplateId(value: unknown): value is ResumeTemplateId {
  return value === "classic" || value === "compact";
}

function monthRange(start: string | null, end: string | null): string {
  const from = monthLabel(start);
  const to = end === null ? "Present" : monthLabel(end);
  if (!from && !to) return "";
  if (!from) return to;
  return to ? `${from} – ${to}` : from;
}

function monthLabel(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function experienceDateLabel(
  startDate: string | null,
  endDate: string | null,
): string {
  return monthRange(startDate, endDate);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function withPlaceholders(text: string): string {
  const parts = text.split(/(___+)/g);
  return parts
    .map((part) =>
      /^___+$/.test(part)
        ? `<span class="placeholder">${escapeHtml(part)}</span>`
        : escapeHtml(part),
    )
    .join("");
}

function contactLine(fields: ResumeFields): string {
  const bits: string[] = [];
  if (fields.email?.trim()) bits.push(escapeHtml(fields.email.trim()));
  if (fields.phone?.trim()) bits.push(escapeHtml(fields.phone.trim()));
  if (fields.location?.trim()) bits.push(escapeHtml(fields.location.trim()));
  for (const link of fields.links) {
    const label = link.label?.trim() || link.url;
    bits.push(
      `<a href="${escapeHtml(link.url)}">${escapeHtml(label)}</a>`,
    );
  }
  return bits.join(" · ");
}

function section(title: string, body: string): string {
  if (!body.trim()) return "";
  return `<section><h2 class="sec">${escapeHtml(title)}</h2>${body}</section>`;
}

function entryBlock(
  title: string,
  org: string,
  meta: string,
  lines: string[],
  compact: boolean,
): string {
  const head = compact
    ? `<div class="entry-head"><span class="entry-title">${withPlaceholders(title)}${
        org ? ` — ${withPlaceholders(org)}` : ""
      }</span>${meta ? `<span class="entry-meta">${escapeHtml(meta)}</span>` : ""}</div>`
    : `<div class="entry-head"><div><div class="entry-title">${withPlaceholders(title)}</div>${
        org ? `<div class="entry-org">${withPlaceholders(org)}</div>` : ""
      }</div>${meta ? `<div class="entry-meta">${escapeHtml(meta)}</div>` : ""}</div>`;
  const list =
    lines.length === 0
      ? ""
      : `<ul>${lines.map((l) => `<li>${withPlaceholders(l)}</li>`).join("")}</ul>`;
  return `<div class="entry">${head}${list}</div>`;
}

function experienceBody(fields: ResumeFields, compact: boolean): string {
  return fields.experiences
    .map((exp) =>
      entryBlock(
        exp.title,
        exp.company,
        experienceDateLabel(exp.startDate, exp.endDate),
        exp.bullets,
        compact,
      ),
    )
    .join("");
}

function entriesBody(
  entries: ResumeFields["education"],
  compact: boolean,
): string {
  return entries
    .map((e) =>
      entryBlock(e.title, e.organization, e.dateRange, e.lines, compact),
    )
    .join("");
}

const SHARED_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    background: #fff;
    color: #111;
    font-family: Helvetica, Arial, "Liberation Sans", sans-serif;
    font-size: 10.5pt;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    max-width: 8.5in;
    margin: 0 auto;
    padding: 0.55in 0.65in;
  }
  h1 {
    font-size: 18pt;
    font-weight: 700;
    letter-spacing: 0.01em;
    margin-bottom: 2pt;
  }
  .headline {
    font-size: 10.5pt;
    color: #333;
    margin-bottom: 4pt;
  }
  .contact {
    font-size: 9.5pt;
    color: #333;
    margin-bottom: 12pt;
  }
  .contact a { color: #111; text-decoration: none; }
  h2.sec {
    font-size: 10.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #222;
    padding-bottom: 2pt;
    margin: 12pt 0 6pt;
  }
  .summary { margin-bottom: 4pt; }
  .skills { margin-bottom: 2pt; }
  .entry { margin-bottom: 8pt; }
  .entry-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12pt;
    margin-bottom: 2pt;
  }
  .entry-title { font-weight: 700; }
  .entry-org { font-size: 10pt; color: #333; }
  .entry-meta {
    font-size: 9.5pt;
    color: #333;
    white-space: nowrap;
    flex-shrink: 0;
  }
  ul {
    margin: 2pt 0 0 14pt;
    padding: 0;
  }
  li { margin-bottom: 2pt; }
  .placeholder {
    background: #fff3a0;
    border-bottom: 1px solid #c9a800;
    padding: 0 1px;
  }
  @page { size: A4; margin: 0.45in 0.5in; }
  @media print {
    .page { padding: 0; max-width: none; }
  }
`;

const COMPACT_CSS = `
  .page { padding: 0.4in 0.5in; }
  h1 { font-size: 15pt; margin-bottom: 1pt; }
  .headline { font-size: 9.5pt; margin-bottom: 2pt; }
  .contact { font-size: 8.5pt; margin-bottom: 8pt; }
  h2.sec {
    font-size: 9pt;
    margin: 8pt 0 4pt;
    padding-bottom: 1pt;
  }
  .entry { margin-bottom: 5pt; }
  .entry-title { font-size: 9.5pt; }
  .entry-meta { font-size: 8.5pt; }
  li { margin-bottom: 1pt; font-size: 9.5pt; }
  .skills { font-size: 9.5pt; }
`;

function renderTemplateToHtml(
  fields: ResumeFields,
  templateId: ResumeTemplateId,
): string {
  const compact = templateId === "compact";
  const name = fields.fullName?.trim() || "Resume";
  const contact = contactLine(fields);
  const summary = fields.summary?.trim()
    ? `<p class="summary">${withPlaceholders(fields.summary.trim())}</p>`
    : "";
  const skills = fields.skills.length
    ? `<p class="skills">${fields.skills.map((s) => withPlaceholders(s)).join(" · ")}</p>`
    : "";

  const body = [
    section("Summary", summary),
    section("Skills", skills),
    section("Experience", experienceBody(fields, compact)),
    section("Education", entriesBody(fields.education, compact)),
    section("Projects", entriesBody(fields.projects, compact)),
    section("Certifications", entriesBody(fields.certifications, compact)),
  ].join("");

  const css = SHARED_CSS + (compact ? COMPACT_CSS : "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(name)}</title>
<style>${css}</style>
</head>
<body>
<main class="page">
  <h1>${withPlaceholders(name)}</h1>
  ${
    fields.headline?.trim()
      ? `<div class="headline">${withPlaceholders(fields.headline.trim())}</div>`
      : ""
  }
  ${contact ? `<div class="contact">${contact}</div>` : ""}
  ${body}
</main>
</body>
</html>`;
}


const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  "https://github.com/Sparticuz/chromium/releases/download/v147.0.0/chromium-v147.0.0-pack.x64.tar";

function jsonError(res: VercelResponse, status: number, error: string) {
  res.status(status).json({ error });
}

function supabaseKey(): string | undefined {
  return (
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY
  );
}

function readBody(req: VercelRequest): {
  templateId?: unknown;
  fields?: unknown;
} {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as { templateId?: unknown; fields?: unknown };
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString("utf8")) as {
        templateId?: unknown;
        fields?: unknown;
      };
    } catch {
      return {};
    }
  }
  return raw as { templateId?: unknown; fields?: unknown };
}

async function launchBrowser() {
  const isVercel = !!(process.env.VERCEL || process.env.VERCEL_ENV);
  if (isVercel) {
    if (!process.env.AWS_LAMBDA_JS_RUNTIME) {
      process.env.AWS_LAMBDA_JS_RUNTIME = "nodejs20.x";
    }
    const [{ default: chromium }, puppeteer, path] = await Promise.all([
      import("@sparticuz/chromium-min"),
      import("puppeteer-core"),
      import("node:path"),
    ]);
    if (typeof chromium.setGraphicsMode === "function") {
      chromium.setGraphicsMode(false);
    }
    const executablePath = await chromium.executablePath(CHROMIUM_PACK_URL);
    process.env.LD_LIBRARY_PATH = [
      path.dirname(executablePath),
      process.env.LD_LIBRARY_PATH,
    ]
      .filter(Boolean)
      .join(":");
    return puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath,
      headless: true,
    });
  }
  try {
    const puppeteer = await import("puppeteer");
    return puppeteer.default.launch({ headless: true });
  } catch {
    const puppeteer = await import("puppeteer-core");
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
    return puppeteer.default.launch({
      headless: true,
      executablePath,
    });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "authorization, content-type",
      );
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      return res.status(204).end();
    }

    if (req.method !== "POST") {
      return jsonError(res, 405, "Use POST.");
    }

    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
      return jsonError(res, 401, "Sign in to render a resume PDF.");
    }
    const token = auth.slice("Bearer ".length).trim();
    if (!token) return jsonError(res, 401, "Sign in to render a resume PDF.");

    const supabaseUrl =
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnon = supabaseKey();
    if (!supabaseUrl || !supabaseAnon) {
      return jsonError(res, 500, "Resume PDF is not configured on this host.");
    }

    const { createClient } = await import("@supabase/supabase-js");
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } =
      await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonError(res, 401, "Your session expired. Sign in again.");
    }

    const body = readBody(req);
    if (!isResumeTemplateId(body.templateId)) {
      return jsonError(res, 400, "templateId must be classic or compact.");
    }
    if (!body.fields || typeof body.fields !== "object") {
      return jsonError(res, 400, "fields are required.");
    }

    const html = renderTemplateToHtml(
      body.fields as ResumeFields,
      body.templateId,
    );

    let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
    try {
      browser = await launchBrowser();
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "0.45in",
          right: "0.5in",
          bottom: "0.45in",
          left: "0.5in",
        },
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="resume.pdf"',
      );
      return res.status(200).send(Buffer.from(pdf));
    } finally {
      await browser?.close().catch(() => undefined);
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Chromium failed to render the PDF.";
    if (!res.headersSent) {
      return jsonError(res, 500, message);
    }
  }
}
