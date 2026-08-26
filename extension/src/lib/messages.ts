import type { BridgeSession } from "./types";

/** Everything sent through `chrome.runtime.sendMessage`, typed at both ends. */
export type ExtensionMessage =
  | { type: "SESSION_FROM_WEBAPP"; session: BridgeSession | null }
  | { type: "GET_SESSION" }
  | { type: "CLEAR_SESSION" }
  | { type: "TOGGLE_PANEL" }
  /** Opens PrepFor.Me login and remembers which job tab to return to. */
  | { type: "START_SIGN_IN"; returnTabId?: number }
  /** Broadcast when a session lands (panel should leave the signed-out screen). */
  | { type: "SESSION_READY"; email: string | null }
  /** Run autofill in every frame of the sender's tab (cross-origin embeds). */
  | {
      type: "AUTOFILL_ALL_FRAMES";
      ats: "greenhouse" | "generic";
      fields: import("./types").ResumeFields;
      profile: import("./types").ProfileRecord | null;
      resumePdfBase64?: string | null;
      resumeFileName?: string | null;
    }
  /** Handled by the Greenhouse iframe content script (`content-frame-autofill.js`). */
  | {
      type: "AUTOFILL_THIS_FRAME";
      ats: "greenhouse" | "generic";
      fields: import("./types").ResumeFields;
      profile: import("./types").ProfileRecord | null;
      resumePdfBase64?: string | null;
      resumeFileName?: string | null;
    }
  /** Content scripts are subject to the page's CORS. All Supabase / API
   * traffic goes through the service worker, which has host_permissions. */
  | {
      type: "PROXY_FETCH";
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      /** `base64` for binary responses (PDF). Default `text`. */
      responseType?: "text" | "base64";
    }
  /** Stash a PDF in session storage and open the extension PDF viewer tab. */
  | { type: "OPEN_PDF_TAB"; base64: string; fileName?: string };

export type GetSessionResponse =
  | { ok: true; accessToken: string; userEmail: string | null }
  | { ok: false; reason: "not_signed_in" | "expired" | "refresh_failed" };

export type ProxyFetchResponse =
  | { ok: true; status: number; body: string; contentType: string | null }
  | { ok: false; error: string };

export type StartSignInResponse = { ok: true } | { ok: false; error: string };

/** `chrome.runtime.sendMessage` rejects if no listener is registered — most
 * pages have no content script (chrome:// pages, the extension's own
 * origins, tabs never revisited since install). That's a normal outcome, not
 * a bug worth surfacing. */
export async function sendMessageSafe<T>(message: ExtensionMessage): Promise<T | null> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    return null;
  }
}
