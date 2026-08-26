/** Shared postMessage protocol between the top-frame panel and Greenhouse iframes. */
import type { AtsKind } from "./detect";
import type { ProfileRecord, ResumeFields } from "../lib/types";
import type { FillReport } from "./fill-core";

export const PFM_AUTOFILL_REQUEST = "PFM_AUTOFILL_REQUEST";
export const PFM_AUTOFILL_RESULT = "PFM_AUTOFILL_RESULT";

export interface PfmAutofillRequest {
  type: typeof PFM_AUTOFILL_REQUEST;
  requestId: string;
  ats: AtsKind;
  fields: ResumeFields;
  profile: ProfileRecord | null;
  resumePdfBase64?: string | null;
  resumeFileName?: string | null;
}

export interface PfmAutofillResult {
  type: typeof PFM_AUTOFILL_RESULT;
  requestId: string;
  report: FillReport;
}
