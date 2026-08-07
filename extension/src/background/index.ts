/**
 * Owns the Supabase session. The web-app bridge content script hands us
 * tokens whenever it sees them change; every other script asks us for a
 * fresh access token rather than touching storage or the refresh endpoint
 * itself, so a token refresh never races across multiple open tabs.
 */
import { authUrl, supabaseKey } from "../lib/config";
import type { ExtensionMessage, GetSessionResponse } from "../lib/messages";
import type { BridgeSession } from "../lib/types";

const STORAGE_KEY = "pfm_session";
/** Refresh this far ahead of expiry so a slow network doesn't cost a request a 401. */
const REFRESH_SKEW_SECONDS = 90;

async function readSession(): Promise<BridgeSession | null> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return (stored[STORAGE_KEY] as BridgeSession | undefined) ?? null;
}

async function writeSession(session: BridgeSession | null): Promise<void> {
  if (session) {
    await chrome.storage.local.set({ [STORAGE_KEY]: session });
  } else {
    await chrome.storage.local.remove(STORAGE_KEY);
  }
}

async function refresh(session: BridgeSession): Promise<BridgeSession | null> {
  const response = await fetch(`${authUrl}/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: supabaseKey },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    user?: { email?: string | null };
  };
  if (!body.access_token || !body.refresh_token) return null;
  const next: BridgeSession = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    userEmail: body.user?.email ?? session.userEmail,
  };
  await writeSession(next);
  return next;
}

async function getSession(): Promise<GetSessionResponse> {
  const session = await readSession();
  if (!session) return { ok: false, reason: "not_signed_in" };

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (session.expiresAt - nowSeconds > REFRESH_SKEW_SECONDS) {
    return { ok: true, accessToken: session.accessToken, userEmail: session.userEmail };
  }

  const refreshed = await refresh(session);
  if (!refreshed) {
    // The web app tab will hand us a good session again on its next load —
    // don't clear storage here, a transient network failure shouldn't sign
    // the user out of the extension.
    return { ok: false, reason: "refresh_failed" };
  }
  return { ok: true, accessToken: refreshed.accessToken, userEmail: refreshed.userEmail };
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  if (message.type === "SESSION_FROM_WEBAPP") {
    writeSession(message.session).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "GET_SESSION") {
    getSession().then(sendResponse);
    return true;
  }
  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" } satisfies ExtensionMessage);
  } catch {
    // No content-panel script on this tab (chrome:// page, our own web app
    // origin, or a tab from before install) — nothing to toggle.
  }
});
