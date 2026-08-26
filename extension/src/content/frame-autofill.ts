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
