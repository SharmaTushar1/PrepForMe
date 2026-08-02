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
