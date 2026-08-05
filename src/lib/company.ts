/**
 * Company name matching for grouping roles at the same employer.
 *
 * Deliberately identical to `normaliseCompany` in
 * `supabase/functions/_shared/claims.ts`, which decides the `company` key on
 * every `prep_chunks` row. The two cannot import from each other — one is a Vite
 * bundle, the other a Deno function — so they are kept in step by hand. If they
 * drift, the UI counts a company-wide source that retrieval will not match, or
 * hides one it would, which is the specific lie this whole feature exists to
 * avoid. Change both or neither.
 *
 * **Planned (PROJECT.md §16, not built):** level equivalence (Mid ≈ L3), role-title
 * cleanup for search (`(FTC)` etc.), and a Deno mirror for whatever lands here.
 */
const LEGAL_SUFFIXES =
  /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|nv|bv)\b\.?/gi;

export function normaliseCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseRole(role: string): string {
  return role.toLowerCase().replace(/\s+/g, " ").trim();
}
