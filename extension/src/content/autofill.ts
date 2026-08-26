/**
 * Fills the fields it can, in the user's own session, and stops there — no
 * submit button is ever touched.
 *
 * Greenhouse company embeds (e.g. jobs.solarwinds.com) put the Apply form in a
 * cross-origin iframe (`#grnhse_iframe` → job-boards.greenhouse.io). The top
 * frame cannot read that DOM — we postMessage the iframe content script and
 * also ask the background to message / inject every frame.
 */
import { renderResumePdf } from "../lib/api";
import { sendMessageSafe } from "../lib/messages";
import type { AtsKind } from "./detect";
import type { ProfileRecord, ResumeFields, ResumeTemplateId } from "../lib/types";
import {
  attachResumeBytes,
  emptyReport,
  enrichFieldsForFill,
  fillDocument,
  mergeReports,
  type FillReport,
} from "./fill-core";
import {
  PFM_AUTOFILL_REQUEST,
  PFM_AUTOFILL_RESULT,
  type PfmAutofillRequest,
  type PfmAutofillResult,
} from "./autofill-protocol";

export type { FillReport };

/** Top document plus any same-origin iframes. */
function applicationDocuments(): Document[] {
  const docs: Document[] = [document];
  for (const iframe of Array.from(document.querySelectorAll("iframe"))) {
    try {
      const child = iframe.contentDocument;
      if (child && child !== document) docs.push(child);
    } catch {
      // Cross-origin — handled via postMessage / all-frames messaging.
    }
  }
  return docs;
}

function greenhouseIframes(): HTMLIFrameElement[] {
  const out: HTMLIFrameElement[] = [];
  for (const iframe of Array.from(document.querySelectorAll("iframe"))) {
    const id = iframe.id || "";
    const src = iframe.src || "";
    if (
      id === "grnhse_iframe" ||
      /greenhouse\.io/i.test(src) ||
      iframe.closest("#grnhse_app")
    ) {
      out.push(iframe);
    }
  }
  return out;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function needsFrameBackup(report: FillReport, hadPdf: boolean): boolean {
  if (report.filled.length === 0) return true;
  if (!report.filled.includes("Phone")) return true;
  if (hadPdf && !report.filled.includes("Resume")) return true;
  return false;
}

function fillViaPostMessage(
  ats: AtsKind,
  fields: ResumeFields,
  profile: ProfileRecord | null,
  resumePdfBase64: string | null,
  resumeFileName: string | null,
): Promise<FillReport> {
  const iframes = greenhouseIframes();
  if (iframes.length === 0) {
    return Promise.resolve(emptyReport());
  }

  const requestId = `pfm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const request: PfmAutofillRequest = {
    type: PFM_AUTOFILL_REQUEST,
    requestId,
    ats,
    fields,
    profile,
    resumePdfBase64,
    resumeFileName,
  };

  return new Promise((resolve) => {
    const report = emptyReport();
    let settled = 0;
    const expected = iframes.length;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(report);
    }, 6000);

    const onMessage = (event: MessageEvent) => {
      const data = event.data as PfmAutofillResult | undefined;
      if (!data || data.type !== PFM_AUTOFILL_RESULT || data.requestId !== requestId) return;
      mergeReports(report, data.report);
      settled += 1;
      if (settled >= expected) {
        window.clearTimeout(timeout);
        window.removeEventListener("message", onMessage);
        resolve(report);
      }
    };

    window.addEventListener("message", onMessage);

    for (const iframe of iframes) {
      try {
        iframe.contentWindow?.postMessage(request, "*");
      } catch {
        // ignore
      }
    }
  });
}

async function fillViaBackground(
  ats: AtsKind,
  fields: ResumeFields,
  profile: ProfileRecord | null,
  resumePdfBase64: string | null,
  resumeFileName: string | null,
): Promise<FillReport & { error?: string }> {
  const response = await sendMessageSafe<{
    ok: true;
    filled: string[];
    flagged: string[];
    inputsSeen?: number;
    sawGreenhouseForm?: boolean;
  } | { ok: false; error: string }>({
    type: "AUTOFILL_ALL_FRAMES",
    ats,
    fields,
    profile,
    resumePdfBase64,
    resumeFileName,
  });

  if (!response) {
    return { ...emptyReport(), error: "Couldn't reach the extension background to fill the embed." };
  }
  if (!response.ok) {
    return { ...emptyReport(), error: response.error };
  }
  return {
    filled: response.filled,
    flagged: response.flagged,
    noFormFound: false,
    inputsSeen: response.inputsSeen,
    sawGreenhouseForm: response.sawGreenhouseForm,
  };
}

export async function runAutofill(
  ats: AtsKind,
  fields: ResumeFields,
  profile: ProfileRecord | null,
  templateId: ResumeTemplateId,
  sessionEmail: string | null = null,
): Promise<FillReport> {
  const report = emptyReport();
  const enriched = enrichFieldsForFill(fields, profile, sessionEmail);
  const ctx = { fields: enriched, profile };

  const contactMissing = !enriched.fullName?.trim() && !enriched.email?.trim();

  // Same-origin docs (rare for Greenhouse embeds; still try).
  for (const doc of applicationDocuments()) {
    fillDocument(doc, ats, ctx, report);
  }

  let resumePdfBase64: string | null = null;
  let resumeFileName: string | null = null;
  let resumeBytes: ArrayBuffer | null = null;
  try {
    const pdf = await renderResumePdf(enriched, templateId);
    resumeBytes = await pdf.arrayBuffer();
    resumePdfBase64 = arrayBufferToBase64(resumeBytes);
    resumeFileName = `${(enriched.fullName || "Resume").replace(/[^\w -]/g, "").trim() || "Resume"} - Tailored.pdf`;
    for (const doc of applicationDocuments()) {
      attachResumeBytes(doc, resumeBytes, resumeFileName, report);
    }
  } catch (e) {
    report.flagged.push(
      e instanceof Error && /render|PDF|sign in|session/i.test(e.message)
        ? `Attach your resume manually — ${e.message}`
        : "Attach your resume manually — the PDF couldn't be generated",
    );
  }

  // Cross-origin Greenhouse iframe — postMessage to the frame content script.
  // Text fields go here; PDF may be large so we always reinforce via background.
  const postReport = await fillViaPostMessage(
    ats,
    enriched,
    profile,
    // Prefer background for the PDF attach; still send a copy when small enough.
    resumePdfBase64 && resumePdfBase64.length < 2_500_000 ? resumePdfBase64 : null,
    resumeFileName,
  );
  mergeReports(report, postReport);

  // Background reaches the iframe even when postMessage only partially worked
  // (e.g. name filled, phone/resume still empty).
  if (needsFrameBackup(report, Boolean(resumePdfBase64))) {
    const bgReport = await fillViaBackground(
      ats,
      enriched,
      profile,
      resumePdfBase64,
      resumeFileName,
    );
    mergeReports(report, bgReport);
    if (bgReport.error && report.filled.length === 0) {
      report.flagged.push(bgReport.error);
    }
  }

  if (!enriched.phone?.trim() && !report.filled.includes("Phone")) {
    report.flagged.push(
      "Phone wasn't on your tailored resume or profile — add it in PrepFor.Me, then try again.",
    );
  }
  if (resumePdfBase64 && !report.filled.includes("Resume")) {
    report.flagged.push(
      "Couldn't attach the resume PDF to the form — use Attach on the page, or Download from the panel.",
    );
  }

  if (report.filled.length === 0) {
    report.noFormFound = true;
    if (contactMissing) {
      report.flagged.unshift(
        "Your tailored resume is missing name and email — add them on your PrepFor.Me profile, then try again.",
      );
    } else if (greenhouseIframes().length > 0 && !report.sawGreenhouseForm) {
      report.flagged.unshift(
        "Found a Greenhouse embed but couldn't reach the Apply form inside it. Reload the extension (chrome://extensions → Reload), refresh this tab, then try again.",
      );
    } else if (report.flagged.length === 0) {
      report.flagged.push(
        "Couldn't find fillable fields. Make sure the Apply form is open (First Name / Email visible), then try again.",
      );
    }
  }

  return report;
}
