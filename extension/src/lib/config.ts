/**
 * Baked in at build time from `.env.local` (see `.env.example`) — same
 * mechanism as the main app's `src/lib/supabase.ts`, just without a
 * `VITE_` build step wired to a dev server, so `configured` is what onboarding
 * screens should check before assuming any of this works.
 */

const url = (import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const publishableKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
const apiBase = (import.meta.env.VITE_API_BASE ?? "").trim().replace(/\/+$/, "");
const rawAppOrigins = (import.meta.env.VITE_APP_ORIGINS ?? "").trim();

export const supabaseUrl = url || "https://your-project.supabase.co";
export const supabaseKey = publishableKey || "key-not-configured";
export const functionsUrl = `${supabaseUrl.replace(/\/+$/, "")}/functions/v1`;
export const restUrl = `${supabaseUrl.replace(/\/+$/, "")}/rest/v1`;
export const authUrl = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;

/** Where the /api/render-resume-pdf endpoint lives. */
export const apiBaseUrl = apiBase || "https://prep-for-me.vercel.app";

/**
 * Origins the session bridge trusts. A tab outside this list never gets its
 * localStorage read, no matter what content script code runs — this is the
 * one thing standing between "sync my login" and any page being able to hand
 * the extension a forged session.
 */
export const trustedAppOrigins = (
  rawAppOrigins ? rawAppOrigins.split(",") : ["https://prep-for-me.vercel.app", "http://localhost:5173"]
)
  .map((o) => o.trim())
  .filter(Boolean);

export const isConfigured = Boolean(url && publishableKey);

/** The first trusted origin's login page — what the "sign in" screen links out to. */
export const signInUrl = `${(trustedAppOrigins[0] ?? "https://prep-for-me.vercel.app").replace(/\/+$/, "")}/login`;
