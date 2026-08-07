import type { ResumeFields, ResumeTemplateId } from "../../../types";
import { experienceDateLabel } from "./fields";

/**
 * ATS-safe HTML for Chromium PDF and on-screen preview.
 * Single column, system sans, left-aligned dates, no tables/columns.
 * Placeholders (`___`) get a visible highlight — never silent blanks.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Highlight fill-in blanks while escaping the rest. */
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

function documentHtml(
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

export function renderTemplateToHtml(
  fields: ResumeFields,
  templateId: ResumeTemplateId,
): string {
  return documentHtml(fields, templateId);
}
