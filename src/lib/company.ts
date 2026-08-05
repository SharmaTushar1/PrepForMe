/**
 * Company / role matching helpers.
 *
 * `normaliseCompany` is deliberately identical to
 * `supabase/functions/_shared/claims.ts` — Vite and Deno cannot share a module.
 * Catalog picks prefer stable slugs (`google`, `software_engineer`, `mid`) as
 * prep keys; these helpers are for customs and sibling UI matching.
 */

const LEGAL_SUFFIXES =
  /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|nv|bv)\b\.?/gi;

/** Noise that belongs in specialty / employment_type, not the role title. */
const ROLE_PAREN_NOISE =
  /\s*[\(\[]\s*(ftc|contract|contractor|temp|temporary|remote|hybrid|onsite|on-site|full[\s-]?time|part[\s-]?time|fte|intern(?:ship)?)\s*[\)\]]/gi;

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

/** Strip parenthetical employment/location noise from a custom role title. */
export function stripRoleNoise(role: string): string {
  return role
    .replace(ROLE_PAREN_NOISE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Prep / search key for a custom role title. */
export function normaliseRoleForPrep(role: string): string {
  return normaliseRole(stripRoleNoise(role));
}
