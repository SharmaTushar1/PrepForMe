/**
 * Runs only on the PrepFor.Me web app's own origin (see `matches` in
 * manifest.json) — never on a job site. Reads the Supabase session that's
 * already sitting in this tab's localStorage because the user signed into
 * the web app, and hands it to the background service worker so the panel
 * on some other tab can act as the same user. Nothing is written back to
 * this page; this is read-only.
 *
 * Polls faster when opened from the extension (`?from=extension`) so the
 * return-to-job-tab handoff feels instant after OAuth/magic-link lands.
 */
import type { BridgeSession } from "../lib/types";

const NORMAL_POLL_MS = 2000;
const FAST_POLL_MS = 500;
const fromExtension = new URLSearchParams(window.location.search).has("from") &&
  new URLSearchParams(window.location.search).get("from") === "extension";

/** supabase-js keys its stored session `sb-<project-ref>-auth-token`. */
const SESSION_KEY_PATTERN = /^sb-.*-auth-token$/;

interface StoredSupabaseSession {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { email?: string | null };
}

/** Parses a Supabase local-storage value into the extension's session shape. */
function parseStored(raw: string): BridgeSession | null {
  try {
    const parsed = JSON.parse(raw) as StoredSupabaseSession & { currentSession?: StoredSupabaseSession };
    const session = parsed.access_token ? parsed : parsed.currentSession;
    if (!session?.access_token || !session.refresh_token) return null;
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      userEmail: session.user?.email ?? null,
    };
  } catch {
    return null;
  }
}

/** Finds the current Supabase session among the web app's local-storage entries. */
function readSessionFromLocalStorage(): BridgeSession | null {
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (!SESSION_KEY_PATTERN.test(key) && key !== "supabase.auth.token") continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    const session = parseStored(raw);
    if (session) return session;
  }
  return null;
}

let lastSent: string | null = null;

/** Relays a changed web-app session to the extension background worker. */
function syncOnce(): void {
  const session = readSessionFromLocalStorage();
  const fingerprint = session ? `${session.accessToken}:${session.expiresAt}` : null;
  if (fingerprint === lastSent) return;
  lastSent = fingerprint;
  chrome.runtime.sendMessage({ type: "SESSION_FROM_WEBAPP", session }).catch(() => {
    // Background not ready yet (extension just installed/updated) — the next
    // poll tick tries again.
  });
}

syncOnce();
window.setInterval(syncOnce, fromExtension ? FAST_POLL_MS : NORMAL_POLL_MS);
window.addEventListener("storage", syncOnce);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") syncOnce();
});
