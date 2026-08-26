/**
 * What site this is, and a best guess at the job it's advertising.
 *
 * Real ATS field-mapping (see `autofill.ts`) only exists for Greenhouse —
 * everything else gets the generic heuristics here, which are deliberately
 * conservative: wrong scraped text is corrected by the user in the panel
 * before anything is sent to the model, but a floating launcher that shows
 * up on pages with no application form on them would just be noise.
 */

export type AtsKind = "greenhouse" | "generic";

export interface DetectedJob {
  ats: AtsKind;
  company: string;
  role: string;
  jobDescription: string;
  postingUrl: string;
}

const MAX_JD_CHARS = 12_000;

function isGreenhouse(): boolean {
  const host = window.location.hostname;
  if (/(^|\.)greenhouse\.io$/.test(host)) return true;
  return document.getElementById("grnhse_app") !== null;
}

/** A form that plausibly takes a job application — enough signal to show the launcher on an unknown site. */
function looksLikeApplicationForm(): boolean {
  const fileInputs = document.querySelectorAll('input[type="file"]');
  if (fileInputs.length === 0) return false;

  const bodyText = document.body.innerText.toLowerCase();
  const hasResumeMention = /resum[ée]|cv\b|cover letter/.test(bodyText);
  const hasApplyMention = /apply|application/.test(bodyText);
  return hasResumeMention && hasApplyMention;
}

export function detectAts(): AtsKind | null {
  if (isGreenhouse()) return "greenhouse";
  return looksLikeApplicationForm() ? "generic" : null;
}

function meta(name: string): string | null {
  const el =
    document.querySelector(`meta[property="${name}"]`) ??
    document.querySelector(`meta[name="${name}"]`);
  return el?.getAttribute("content")?.trim() || null;
}

function companyFromHost(): string {
  const host = window.location.hostname.replace(/^www\./, "");
  const first = host.split(".")[0];
  if (!first || ["boards", "job-boards", "jobs", "careers", "apply"].includes(first)) {
    const parts = host.split(".");
    return parts.length > 2 ? capitalize(parts[parts.length - 2]) : capitalize(first || host);
  }
  return capitalize(first);
}

function capitalize(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Splits titles shaped like "Role at Company", "Role - Company", "Company: Role". */
function splitTitle(title: string): { role: string; company: string } | null {
  const patterns: RegExp[] = [
    /^(.*?)\s+(?:at|@)\s+(.*)$/i,
    /^(.*?)\s*[|·]\s*(.*)$/,
    /^(.*?)\s+-\s+(.*)$/,
  ];
  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match?.[1] && match?.[2]) {
      return { role: match[1].trim(), company: match[2].trim() };
    }
  }
  // "Company: Role" format (text before colon = company, after = role).
  const colonMatch = title.match(/^(.*?):\s*(.*)$/);
  if (colonMatch?.[1] && colonMatch?.[2]) {
    return { role: colonMatch[2].trim(), company: colonMatch[1].trim() };
  }
  return null;
}

function scrapeGreenhouse(): { company: string; role: string; jobDescription: string } {
  const role =
    document.querySelector("h1")?.textContent?.trim() ||
    meta("og:title") ||
    document.title.trim();

  const company =
    document.querySelector(".company-name")?.textContent?.trim() ||
    meta("og:site_name") ||
    companyFromHost();

  const contentEl =
    document.querySelector("#content") ||
    document.querySelector('[class*="job__description"]') ||
    document.querySelector("#app_body") ||
    document.querySelector("main");

  return {
    role,
    company,
    jobDescription: extractText(contentEl ?? document.body),
  };
}

function scrapeGeneric(): { company: string; role: string; jobDescription: string } {
  const title = meta("og:title") || document.title.trim();
  const split = splitTitle(title);
  const siteName = meta("og:site_name");

  const role = split?.role || title;
  const company = siteName || split?.company || companyFromHost();

  const candidates = [
    document.querySelector("main"),
    document.querySelector("article"),
    document.querySelector('[class*="description" i]'),
    document.querySelector('[class*="posting" i]'),
    document.querySelector('[id*="content" i]'),
  ].filter((el): el is HTMLElement => el instanceof HTMLElement);

  let best: HTMLElement | null = null;
  let bestLength = 0;
  for (const el of candidates) {
    const length = el.innerText?.length ?? 0;
    if (length > bestLength) {
      best = el;
      bestLength = length;
    }
  }

  return { role, company, jobDescription: extractText(best ?? document.body) };
}

/** Strips chrome (nav/header/footer/scripts) before reading text, so the JD sent to the model isn't padded with site navigation. */
function extractText(root: Element): string {
  const clone = root.cloneNode(true) as HTMLElement;
  clone
    .querySelectorAll(
      'script, style, noscript, nav, header, footer, [role="navigation"], [class*="cookie" i], [class*="sidebar" i]',
    )
    .forEach((el) => el.remove());
  const text = clone.innerText || clone.textContent || "";
  const collapsed = text.replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
  return collapsed.slice(0, MAX_JD_CHARS);
}

export function scrapeJob(ats: AtsKind): DetectedJob {
  const scraped = ats === "greenhouse" ? scrapeGreenhouse() : scrapeGeneric();
  return {
    ats,
    ...scraped,
    postingUrl: window.location.href.split("#")[0],
  };
}
