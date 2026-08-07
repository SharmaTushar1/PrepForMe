import type { BridgeSession } from "./types";

/** Everything sent through `chrome.runtime.sendMessage`, typed at both ends. */
export type ExtensionMessage =
  | { type: "SESSION_FROM_WEBAPP"; session: BridgeSession | null }
  | { type: "GET_SESSION" }
  | { type: "TOGGLE_PANEL" };

export type GetSessionResponse =
  | { ok: true; accessToken: string; userEmail: string | null }
  | { ok: false; reason: "not_signed_in" | "expired" | "refresh_failed" };

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
