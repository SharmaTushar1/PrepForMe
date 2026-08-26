/**
 * Pure DOM fill helpers — no network. Shared by the top-frame panel path and
 * the Greenhouse iframe content script (cross-origin embeds like
 * jobs.solarwinds.com → job-boards.greenhouse.io).
 */
import type { AtsKind } from "./detect";
import type { ProfileRecord, ResumeFields } from "../lib/types";

export interface FillReport {
  filled: string[];
  flagged: string[];
  /** True when we couldn't find any fillable inputs on this document. */
  noFormFound: boolean;
  /** How many text/select inputs we saw (diagnostics). */
  inputsSeen?: number;
  /** True when #first_name / given-name was present. */
  sawGreenhouseForm?: boolean;
}

export function splitName(fullName: string | null | undefined): { first: string; last: string } {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return { first: "", last: "" };
  const parts = trimmed.split(/\s+/);
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Prefer geometry + computed style over offsetParent (unreliable on ATS pages). */
function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hasAttribute("disabled") || el.getAttribute("aria-hidden") === "true") return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  // File inputs are often visually replaced by a button and report 0×0.
  if (el instanceof HTMLInputElement && el.type === "file") return style.display !== "none";
  if (typeof el.checkVisibility === "function") {
    try {
      if (el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return true;
    } catch {
      // older chrome options shape
    }
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0 || el.offsetWidth > 0 || el.offsetHeight > 0;
}

/**
 * React installs an own-property `value` setter on controlled inputs. Call the
 * native prototype setter so the DOM updates, then fire input/change so React
 * state catches up (see SO / Greenhouse job-boards scripts).
 */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const valueProp = Object.getOwnPropertyDescriptor(el, "value");
  const proto = Object.getPrototypeOf(el) as HTMLInputElement | HTMLTextAreaElement;
  const protoProp = Object.getOwnPropertyDescriptor(proto, "value");
  const protoSetter = protoProp?.set;
  const ownSetter = valueProp?.set;

  if (protoSetter && ownSetter && protoSetter !== ownSetter) {
    protoSetter.call(el, value);
  } else if (ownSetter) {
    ownSetter.call(el, value);
  } else if (protoSetter) {
    protoSetter.call(el, value);
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: value, inputType: "insertText" }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

function setSelectValue(el: HTMLSelectElement, wantedText: string): boolean {
  const want = wantedText.trim().toLowerCase();
  if (!want) return false;
  const option = Array.from(el.options).find(
    (o) => o.text.trim().toLowerCase().includes(want) || want.includes(o.text.trim().toLowerCase()),
  );
  if (!option) return false;
  el.value = option.value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function cssEscape(id: string): string {
  return typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/([^\w-])/g, "\\$1");
}

function labelFor(doc: Document, field: HTMLElement): string {
  const id = field.id;
  if (id) {
    try {
      const label = doc.querySelector(`label[for="${cssEscape(id)}"]`);
      if (label?.textContent) return label.textContent;
    } catch {
      // bad id
    }
  }
  const wrapping = field.closest("label");
  if (wrapping?.textContent) return wrapping.textContent;

  const ariaLabel = field.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const describedBy = field.getAttribute("aria-describedby");
  if (describedBy) {
    const described = doc.getElementById(describedBy);
    if (described?.textContent) return described.textContent;
  }

  try {
    const fieldWrapper = field.closest(
      ".field-wrapper, .field, fieldset, .form-group, [data-field], .application--field, .text-input-wrapper",
    );
    const heading = fieldWrapper?.querySelector("label, legend, .field-label, .label, .upload-label");
    if (heading?.textContent && heading !== field) return heading.textContent;
  } catch {
    // closest selector unsupported
  }

  const prev = field.previousElementSibling;
  if (prev && /label/i.test(prev.tagName) && prev.textContent) {
    return prev.textContent;
  }

  return field.getAttribute("placeholder") || field.getAttribute("name") || "";
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function findLink(fields: ResumeFields, keywords: string[]): string | null {
  const links = fields.links ?? [];
  for (const link of links) {
    const hay = `${link.label} ${link.url}`.toLowerCase();
    if (keywords.some((k) => hay.includes(k))) return link.url;
  }
  return links[0]?.url ?? null;
}

type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface FillContext {
  fields: ResumeFields;
  profile: ProfileRecord | null;
}

const RULES: { test: RegExp; fill: (ctx: FillContext) => string | null; label: string }[] = [
  { test: /first ?name/, fill: (c) => splitName(c.fields.fullName).first || null, label: "First name" },
  { test: /last ?name/, fill: (c) => splitName(c.fields.fullName).last || null, label: "Last name" },
  { test: /full ?name|^name$|your name/, fill: (c) => c.fields.fullName, label: "Full name" },
  { test: /e[\s-]?mail/, fill: (c) => c.fields.email, label: "Email" },
  { test: /^phone$|phone number|mobile|cell/, fill: (c) => c.fields.phone, label: "Phone" },
  { test: /city|location|current address|where.*based/, fill: (c) => c.fields.location, label: "Location" },
  { test: /linkedin/, fill: (c) => findLink(c.fields, ["linkedin"]), label: "LinkedIn" },
  { test: /github/, fill: (c) => findLink(c.fields, ["github"]), label: "GitHub" },
  { test: /portfolio|website|personal site/, fill: (c) => findLink(c.fields, ["portfolio", "website"]), label: "Portfolio" },
  { test: /notice period/, fill: (c) => c.profile?.noticePeriod ?? null, label: "Notice period" },
  { test: /work authoriz|visa|sponsor/, fill: (c) => c.profile?.workAuthorization ?? null, label: "Work authorization" },
];

const FLAG_RULES: RegExp[] = [
  /why (do you want|are you interested)|cover letter|tell us more|motivation/,
  /salary|compensation|expected pay/,
  /years? of experience/,
  /referral|how did you hear/,
  /work authoriz|visa|sponsor/,
  /notice period/,
];

function collectFields(doc: Document): FormField[] {
  return Array.from(doc.querySelectorAll<FormField>("input, textarea, select")).filter((el) => {
    if (el instanceof HTMLInputElement) {
      const type = (el.type || "text").toLowerCase();
      if (["hidden", "submit", "button", "checkbox", "radio", "image", "reset", "file"].includes(type)) {
        return false;
      }
      // React-Select search boxes — don't treat as application answers.
      if (el.classList.contains("select__input") || el.getAttribute("role") === "combobox") {
        return false;
      }
    }
    return isVisible(el);
  });
}

function fillByLabel(doc: Document, ctx: FillContext, report: FillReport): void {
  for (const field of collectFields(doc)) {
    const label = normalize(labelFor(doc, field));
    if (!label) continue;

    const alreadyFilled = field.value.trim().length > 0;

    if (!alreadyFilled) {
      const rule = RULES.find((r) => r.test.test(label));
      if (rule) {
        const value = rule.fill(ctx);
        if (value?.trim()) {
          if (field instanceof HTMLSelectElement) {
            if (setSelectValue(field, value) && !report.filled.includes(rule.label)) {
              report.filled.push(rule.label);
            }
          } else {
            setNativeValue(field, value);
            if (!report.filled.includes(rule.label)) report.filled.push(rule.label);
          }
          continue;
        }
      }
    }

    if (!alreadyFilled && FLAG_RULES.some((r) => r.test.test(label))) {
      const humanLabel = labelFor(doc, field).trim().slice(0, 80) || "An unlabeled question";
      if (!report.flagged.includes(humanLabel)) report.flagged.push(humanLabel);
    }
  }
}

function fillGreenhouseFixedFields(doc: Document, ctx: FillContext, report: FillReport): void {
  const set = (selectors: string[], value: string | null | undefined, label: string) => {
    if (!value?.trim()) return;
    for (const selector of selectors) {
      let el: HTMLInputElement | null = null;
      try {
        el = doc.querySelector<HTMLInputElement>(selector);
      } catch {
        continue;
      }
      if (!el) {
        // getElementById fallback for ids that aren't valid CSS (rare).
        if (selector.startsWith("#")) {
          el = doc.getElementById(selector.slice(1)) as HTMLInputElement | null;
        }
      }
      if (!el || (el.value && el.value.trim())) continue;
      setNativeValue(el, value);
      if (!report.filled.includes(label)) report.filled.push(label);
      return;
    }
  };

  const { first, last } = splitName(ctx.fields.fullName);
  set(
    ["#first_name", "input[autocomplete='given-name']", "input[name='first_name']", "input[name*='first_name']"],
    first,
    "First name",
  );
  set(
    ["#last_name", "input[autocomplete='family-name']", "input[name='last_name']", "input[name*='last_name']"],
    last,
    "Last name",
  );
  set(
    ["#email", "input[autocomplete='email']", "input[type='email']", "input[name='email']", "input[name*='email']"],
    ctx.fields.email,
    "Email",
  );
  set(
    ["#phone", "input[type='tel']", "input[autocomplete='tel']", "input[autocomplete='tel-national']", "input[name='phone']"],
    ctx.fields.phone,
    "Phone",
  );

  // Greenhouse phone sits in a fieldset whose legend is also "Phone" — force the
  // dedicated #phone control even when label heuristics skip it.
  if (ctx.fields.phone?.trim()) {
    const phoneEl = doc.getElementById("phone");
    if (phoneEl instanceof HTMLInputElement && !phoneEl.value.trim()) {
      setNativeValue(phoneEl, ctx.fields.phone.trim());
      if (!report.filled.includes("Phone")) report.filled.push("Phone");
    }
  }
}

export function attachResumeBytes(
  doc: Document,
  bytes: ArrayBuffer | Blob,
  fileName: string,
  report: FillReport,
): void {
  const candidates: HTMLInputElement[] = [];
  const byId = doc.getElementById("resume");
  if (byId instanceof HTMLInputElement && byId.type === "file") candidates.push(byId);

  try {
    for (const el of Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
      const id = (el.id || "").toLowerCase();
      const name = (el.name || "").toLowerCase();
      if (id.includes("cover") || name.includes("cover")) continue;
      if (id.includes("resume") || id.includes("cv") || name.includes("resume") || name.includes("cv")) {
        if (!candidates.includes(el)) candidates.push(el);
      }
    }
  } catch {
    // ignore
  }

  if (candidates.length === 0) {
    const fallback = doc.querySelector<HTMLInputElement>('input[type="file"]:not([id*="cover"]):not([name*="cover"])');
    if (fallback) candidates.push(fallback);
  }

  const input = candidates.find((el) => !(el.files && el.files.length > 0)) ?? null;
  if (!input) {
    if (candidates.length === 0) {
      report.flagged.push("Attach your resume manually — no file input found on the form");
    }
    return;
  }

  try {
    const file = new File([bytes], fileName, { type: "application/pdf" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    try {
      input.files = transfer.files;
    } catch {
      Object.defineProperty(input, "files", { value: transfer.files, configurable: true });
    }
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    // Some React uploaders listen for focus/blur around the Attach control.
    input.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));

    if (input.files && input.files.length > 0) {
      if (!report.filled.includes("Resume")) report.filled.push("Resume");
    } else {
      report.flagged.push("Attach your resume manually — the page blocked setting the file input");
    }
  } catch {
    report.flagged.push("Attach your resume manually — the file input rejected the PDF");
  }
}

export function fillDocument(
  doc: Document,
  ats: AtsKind,
  ctx: FillContext,
  report: FillReport,
): void {
  const greenhouseMarker =
    !!doc.getElementById("first_name") ||
    !!doc.querySelector("input[autocomplete='given-name']") ||
    !!doc.getElementById("application-form");
  if (greenhouseMarker) report.sawGreenhouseForm = true;

  const inputs = collectFields(doc);
  report.inputsSeen = (report.inputsSeen ?? 0) + inputs.length;

  if (ats === "greenhouse" || greenhouseMarker) {
    fillGreenhouseFixedFields(doc, ctx, report);
  }
  fillByLabel(doc, ctx, report);
}

/** Ensure arrays exist so fill rules never throw on a sparse saved resume. */
export function normalizeResumeFields(fields: ResumeFields): ResumeFields {
  return {
    fullName: fields.fullName ?? null,
    headline: fields.headline ?? null,
    email: fields.email ?? null,
    phone: fields.phone ?? null,
    location: fields.location ?? null,
    summary: fields.summary ?? null,
    links: Array.isArray(fields.links) ? fields.links : [],
    experiences: Array.isArray(fields.experiences) ? fields.experiences : [],
    education: Array.isArray(fields.education) ? fields.education : [],
    projects: Array.isArray(fields.projects) ? fields.projects : [],
    certifications: Array.isArray(fields.certifications) ? fields.certifications : [],
    skills: Array.isArray(fields.skills) ? fields.skills : [],
  };
}

/** Fill contact gaps from profile / signed-in email before touching the form. */
export function enrichFieldsForFill(
  fields: ResumeFields,
  profile: ProfileRecord | null,
  sessionEmail: string | null,
): ResumeFields {
  const base = normalizeResumeFields(fields);
  return {
    ...base,
    fullName: base.fullName?.trim() || profile?.fullName?.trim() || null,
    email: base.email?.trim() || profile?.email?.trim() || sessionEmail?.trim() || null,
    phone: base.phone?.trim() || profile?.phone?.trim() || null,
  };
}

export function emptyReport(): FillReport {
  return { filled: [], flagged: [], noFormFound: false, inputsSeen: 0, sawGreenhouseForm: false };
}

export function mergeReports(into: FillReport, from: FillReport): void {
  for (const label of from.filled) {
    if (!into.filled.includes(label)) into.filled.push(label);
  }
  for (const label of from.flagged) {
    if (!into.flagged.includes(label)) into.flagged.push(label);
  }
  into.inputsSeen = (into.inputsSeen ?? 0) + (from.inputsSeen ?? 0);
  if (from.sawGreenhouseForm) into.sawGreenhouseForm = true;
}
