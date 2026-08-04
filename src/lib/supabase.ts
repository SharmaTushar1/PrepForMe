import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
/** Supabase's `sb_publishable_…` key, which replaced the legacy `anon` JWT. */
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * False when `.env.local` hasn't been filled in yet. The app still boots so the
 * marketing site and the sign-in screen can explain what's missing, rather than
 * dying at import time.
 */
export const isSupabaseConfigured = Boolean(url && publishableKey);

/**
 * The Functions base URL and key, for the one call that can't go through
 * `functions.invoke`: it buffers the whole response, and the analyzer streams
 * its progress. See `src/lib/ai/edge.ts`.
 */
export const functionsUrl = `${(url || "http://localhost:54321").replace(/\/+$/, "")}/functions/v1`;
export const supabaseKey = publishableKey || "key-not-configured";

export const supabase = createClient(
  url || "http://localhost:54321",
  publishableKey || "key-not-configured",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

interface PostgrestResponse {
  data: unknown;
  error: { message: string } | null;
}

/**
 * Run a PostgREST query, throwing on failure so react-query can own the error
 * state, and assert the row shape in exactly one place per query.
 */
export async function unwrap<T>(query: PromiseLike<PostgrestResponse>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data as T;
}
