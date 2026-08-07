import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import type { ResumeFields, ResumeTemplateId } from "../src/types";
import { isResumeTemplateId } from "../src/lib/resume/templates/fields";
import { renderTemplateToHtml } from "../src/lib/resume/templates/render";

/**
 * POST /api/render-resume-pdf
 * Body: { templateId, fields }
 * Auth: Authorization: Bearer <supabase access token>
 *
 * Renders HTML via shared templates, then Chromium → PDF.
 * No LLM. Fields must already belong to the caller (client sends owned data).
 */

export const config = {
  api: { bodyParser: { sizeLimit: "2mb" } },
  maxDuration: 60,
};

function jsonError(res: VercelResponse, status: number, error: string) {
  res.status(status).json({ error });
}

async function launchBrowser() {
  const isVercel = !!process.env.VERCEL;
  if (isVercel) {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    return puppeteer.default.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  // Local / vercel dev: prefer full puppeteer if present, else puppeteer-core + env path.
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
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type");
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

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnon =
    process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnon) {
    return jsonError(res, 500, "Resume PDF is not configured on this host.");
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return jsonError(res, 401, "Your session expired. Sign in again.");
  }

  const body = req.body as {
    templateId?: unknown;
    fields?: ResumeFields;
  };
  if (!isResumeTemplateId(body.templateId)) {
    return jsonError(res, 400, "templateId must be classic or compact.");
  }
  if (!body.fields || typeof body.fields !== "object") {
    return jsonError(res, 400, "fields are required.");
  }

  const templateId = body.templateId as ResumeTemplateId;
  const html = renderTemplateToHtml(body.fields, templateId);

  let browser: Awaited<ReturnType<typeof launchBrowser>> | null = null;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0.45in", right: "0.5in", bottom: "0.45in", left: "0.5in" },
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="resume.pdf"',
    );
    return res.status(200).send(Buffer.from(pdf));
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Chromium failed to render the PDF.";
    return jsonError(res, 500, message);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
