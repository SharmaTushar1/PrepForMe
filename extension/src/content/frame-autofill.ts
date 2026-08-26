/**
 * Runs inside Greenhouse frames (including embeds on company career sites).
 * The top-frame panel cannot read cross-origin iframe DOM, so it asks us to
 * fill via window.postMessage / runtime message.
 */
import {
  attachResumeBytes,
  emptyReport,
  enrichFieldsForFill,
  fillDocument,
} from "./fill-core";
import type { AtsKind } from "./detect";
import type { ProfileRecord, ResumeFields } from "../lib/types";
import type { ExtensionMessage } from "../lib/messages";
import {
  PFM_AUTOFILL_REQUEST,
  PFM_AUTOFILL_RESULT,
  type PfmAutofillRequest,
  type PfmAutofillResult,
} from "./autofill-protocol";
import type { FillReport } from "./fill-core";

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function runFill(
  ats: AtsKind,
  fields: ResumeFields,
  profile: ProfileRecord | null,
  resumePdfBase64?: string | null,
  resumeFileName?: string | null,
): FillReport {
  const report = emptyReport();
  // Parent usually enriches already; do it again so profile.phone is never dropped.
  const ctx = { fields: enrichFieldsForFill(fields, profile, null), profile };
  fillDocument(document, ats, ctx, report);

  if (resumePdfBase64) {
    try {
      const bytes = base64ToArrayBuffer(resumePdfBase64);
      const name =
        resumeFileName ||
        `${(ctx.fields.fullName || "Resume").replace(/[^\w -]/g, "").trim() || "Resume"} - Tailored.pdf`;
      attachResumeBytes(document, bytes, name, report);
    } catch {
      report.flagged.push("Attach your resume manually — the PDF couldn't be applied");
    }
  }

  if (report.filled.length === 0 && (report.inputsSeen ?? 0) === 0 && !report.sawGreenhouseForm) {
    report.noFormFound = true;
  }
  return report;
}

window.addEventListener("message", (event: MessageEvent) => {
  const data = event.data as PfmAutofillRequest | undefined;
  if (!data || data.type !== PFM_AUTOFILL_REQUEST || !data.requestId) return;

  const report = runFill(
    data.ats ?? "greenhouse",
    data.fields,
    data.profile ?? null,
    data.resumePdfBase64,
    data.resumeFileName,
  );

  const result: PfmAutofillResult = {
    type: PFM_AUTOFILL_RESULT,
    requestId: data.requestId,
    report,
  };

  try {
    if (event.source && "postMessage" in event.source) {
      (event.source as Window).postMessage(result, "*");
    } else {
      window.parent.postMessage(result, "*");
    }
  } catch {
    window.parent.postMessage(result, "*");
  }
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type !== "AUTOFILL_THIS_FRAME") return false;
  const report = runFill(
    message.ats,
    message.fields,
    message.profile,
    message.resumePdfBase64,
    message.resumeFileName,
  );
  sendResponse({ ok: true, report });
  return false;
});
