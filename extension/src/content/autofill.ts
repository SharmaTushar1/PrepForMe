/**
 * Fills the fields it can, in the user's own session, and stops there — no
 * submit button is ever touched. Greenhouse's classic embed form has stable
 * element ids, so that gets filled by id first; a label-matching sweep
 * handles Greenhouse's per-posting custom questions (which have no stable
 * ids) and is also the entire strategy for a page we don't otherwise
 * recognise.
 */
import { renderResumePdf } from "../lib/api";
import type { AtsKind } from "./detect";
import type { ProfileRecord, ResumeFields, ResumeTemplateId } from "../lib/types";

export interface FillReport {
  filled: string[];
  flagged: string[];
}

function splitName(fullName: string | null): { first: string; last: string } {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return { first: "", last: "" };
  const parts = trimmed.split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function isVisible(el: Element): boolean {
  return el instanceof HTMLElement && el.offsetParent !== null && !el.hasAttribute("disabled");
}

/** React (and most modern form libs) install their own `value` setter on the
 * element, so a plain `input.value = x` is invisible to their state — the
 * DOM shows the new text but the framework still thinks the field is empty
 * and will submit the old value. Calling the native setter first, then
 * dispatching the event, is what makes both agree. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setSelectValue(el: HTMLSelectElement, wantedText: string): boolean {
  const want = wantedText.trim().toLowerCase();
  if (!want) return false;
  const option = Array.from(el.options).find((o) => o.text.trim().toLowerCase().includes(want) || want.includes(o.text.trim().toLowerCase()));
  if (!option) return false;
  el.value = option.value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function labelFor(field: HTMLElement): string {
  const id = field.id;
  if (id) {
    const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
    if (label?.textContent) return label.textContent;
  }
  const wrapping = field.closest("label");
  if (wrapping?.textContent) return wrapping.textContent;

  const ariaLabel = field.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const describedBy = field.getAttribute("aria-describedby");
  if (describedBy) {
    const described = document.getElementById(describedBy);
    if (described?.textContent) return described.textContent;
  }

  // Greenhouse's per-question wrapper (`.field`) puts the question text in a
  // sibling label-like node above the input rather than a real <label for>.
  const fieldWrapper = field.closest('[class*="field" i], fieldset, [class*="question" i]');
  const heading = fieldWrapper?.querySelector('label, [class*="label" i], legend');
  if (heading?.textContent && heading !== field) return heading.textContent;

  return field.getAttribute("placeholder") || field.getAttribute("name") || "";
}

function cssEscape(id: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/([^\w-])/g, "\\$1");
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findLink(fields: ResumeFields, keywords: string[]): string | null {
  for (const link of fields.links) {
    const hay = `${link.label} ${link.url}`.toLowerCase();
    if (keywords.some((k) => hay.includes(k))) return link.url;
  }
  return fields.links[0]?.url ?? null;
}

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface FillContext {
  fields: ResumeFields;
  profile: ProfileRecord | null;
}

/** Ordered rules: first match wins. Cover-letter/motivation/salary-ish free text
 * is deliberately absent — those need the applicant's own words, so they're
 * reported as flagged instead of guessed at. */
const RULES: { test: RegExp; fill: (ctx: FillContext) => string | null; label: string }[] = [
  { test: /first ?name/, fill: (c) => splitName(c.fields.fullName).first || null, label: "First name" },
  { test: /last ?name/, fill: (c) => splitName(c.fields.fullName).last || null, label: "Last name" },
  { test: /full ?name|^name$|your name/, fill: (c) => c.fields.fullName, label: "Full name" },
  { test: /e[\s-]?mail/, fill: (c) => c.fields.email, label: "Email" },
  { test: /phone|mobile|cell/, fill: (c) => c.fields.phone, label: "Phone" },
  { test: /city|location|current address|where.*based/, fill: (c) => c.fields.location, label: "Location" },
  { test: /linkedin/, fill: (c) => findLink(c.fields, ["linkedin"]), label: "LinkedIn" },
  { test: /github/, fill: (c) => findLink(c.fields, ["github"]), label: "GitHub" },
  { test: /portfolio|website|personal site/, fill: (c) => findLink(c.fields, ["portfolio", "website"]), label: "Portfolio" },
  { test: /notice period/, fill: (c) => c.profile?.noticePeriod ?? null, label: "Notice period" },
  { test: /work authoriz|visa|sponsor/, fill: (c) => c.profile?.workAuthorization ?? null, label: "Work authorization" },
];

/** Fields worth telling the user about even though nothing was typed into them. */
const FLAG_RULES: RegExp[] = [
  /why (do you want|are you interested)|cover letter|tell us more|motivation/,
  /salary|compensation|expected pay/,
  /years? of experience/,
  /referral|how did you hear/,
  /work authoriz|visa|sponsor/,
  /notice period/,
];

function collectFields(): FormField[] {
  return Array.from(document.querySelectorAll<FormField>("input, textarea, select")).filter((el) => {
    if (el instanceof HTMLInputElement) {
      const type = (el.type || "text").toLowerCase();
      if (!["text", "email", "tel", "url", "search", ""].includes(type)) return false;
    }
    return isVisible(el);
  });
}

function fillByLabel(ctx: FillContext, report: FillReport): void {
  for (const field of collectFields()) {
    const label = normalize(labelFor(field));
    if (!label) continue;

    const alreadyFilled = field.value.trim().length > 0;

    if (!alreadyFilled) {
      const rule = RULES.find((r) => r.test.test(label));
      if (rule) {
        const value = rule.fill(ctx);
        if (value?.trim()) {
          if (field instanceof HTMLSelectElement) {
            if (setSelectValue(field, value)) report.filled.push(rule.label);
          } else {
            setNativeValue(field, value);
            report.filled.push(rule.label);
          }
          continue;
        }
      }
    }

    if (!alreadyFilled && FLAG_RULES.some((r) => r.test(label))) {
      const humanLabel = labelFor(field).trim().slice(0, 80) || "An unlabeled question";
      if (!report.flagged.includes(humanLabel)) report.flagged.push(humanLabel);
    }
  }
}

const GREENHOUSE_FILE_SELECTORS = {
  resume: '#resume, input[type="file"][name*="resume" i]',
  coverLetter: '#cover_letter, input[type="file"][name*="cover" i]',
};

function fillGreenhouseFixedFields(ctx: FillContext, report: FillReport): void {
  const set = (selector: string, value: string | null, label: string) => {
    if (!value?.trim()) return;
    const el = document.querySelector<HTMLInputElement>(selector);
    if (!el || !isVisible(el) || el.value.trim()) return;
    setNativeValue(el, value);
    report.filled.push(label);
  };

  const { first, last } = splitName(ctx.fields.fullName);
  set("#first_name", first, "First name");
  set("#last_name", last, "Last name");
  set("#email", ctx.fields.email, "Email");
  set("#phone", ctx.fields.phone, "Phone");
}

async function attachResumeFile(
  fields: ResumeFields,
  templateId: ResumeTemplateId,
  selector: string,
  label: string,
  report: FillReport,
): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input || !isVisible(input) || input.files?.length) return;

  try {
    const pdf = await renderResumePdf(fields, templateId);
    const fileName = `${(fields.fullName || "Resume").replace(/[^\w -]/g, "").trim() || "Resume"} - Tailored.pdf`;
    const file = new File([pdf], fileName, { type: "application/pdf" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    report.filled.push(label);
  } catch {
    report.flagged.push(`Attach your resume manually — ${label.toLowerCase()} couldn't be generated`);
  }
}

export async function runAutofill(
  ats: AtsKind,
  fields: ResumeFields,
  profile: ProfileRecord | null,
  templateId: ResumeTemplateId,
): Promise<FillReport> {
  const report: FillReport = { filled: [], flagged: [] };
  const ctx: FillContext = { fields, profile };

  if (ats === "greenhouse") {
    fillGreenhouseFixedFields(ctx, report);
    await attachResumeFile(fields, templateId, GREENHOUSE_FILE_SELECTORS.resume, "Resume", report);
  }

  fillByLabel(ctx, report);
  return report;
}
