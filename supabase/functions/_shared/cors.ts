/**
 * Browser-facing response helpers.
 *
 * `supabase.functions.invoke` is called from the SPA, so every response —
 * including refusals and crashes — has to carry CORS headers or the browser
 * hides the status behind a network error and the user sees nothing useful.
 */

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function preflightResponse(): Response {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

/**
 * The only shape a non-2xx may take: `{ error }` with a message written for a
 * human. `src/lib/ai/edge.ts` digs this string out of the thrown
 * `FunctionsHttpError` and shows it verbatim, so it must never be a stack
 * trace, a status line, or anything naming a key or an internal table.
 *
 * A refusal must never come back as a 200 carrying an error field — the client
 * would read it as a successful analysis.
 */
export function errorResponse(message: string, status: number): Response {
  return jsonResponse({ error: message }, status);
}
