/**
 * Runs only on the PrepFor.Me web app's own origin (see `matches` in
 * manifest.json) — never on a job site. Reads the Supabase session that's
 * already sitting in this tab's localStorage because the user signed into
 * the web app, and hands it to the background service worker so the panel
 * on some other tab can act as the same user. Nothing is written back to
 * this page; this is read-only.
 */
import type { BridgeSession } from "../lib/types";

const POLL_MS = 4000;

/** supabase-js v2 keys its stored session `sb-<project-ref>-auth-token`; the
 * ref isn't known here, so any key matching the shape is read instead of
 * hardcoding one. */
const SESSION_KEY_PATTERN = /^sb-.*-auth-token$/;

interface StoredSupabaseSession {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: { email?: string | null };
}

function readSessionFromLocalStorage(): BridgeSession | null {
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !SESSION_KEY_PATTERN.test(key)) continue;
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as StoredSupabaseSession;
      if (!parsed.access_token || !parsed.refresh_token) continue;
      return {
        accessToken: parsed.access_token,
        refreshToken: parsed.refresh_token,
        expiresAt: parsed.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        userEmail: parsed.user?.email ?? null,
      };
    } catch {
      // Not JSON, or not shaped like a session — keep looking.
    }
  }
  return null;
}

let lastSent: string | null = null;

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
window.setInterval(syncOnce, POLL_MS);
window.addEventListener("storage", syncOnce);
