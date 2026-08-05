import { stripRoleNoise } from "./company";

/**
 * Build a LinkedIn people-search URL for referral outreach.
 *
 * Keywords are the role family (cleaned) plus optional specialty — never the
 * company name when we have a currentCompany id (that was matching bios).
 * Without an org id we still put the company in keywords as a weak fallback.
 */
export function linkedinPeopleSearchUrl(input: {
  company: string;
  role: string;
  specialty?: string | null;
  linkedinCompanyId?: string | null;
}): string {
  const roleTitle = stripRoleNoise(input.role.trim());
  const specialty = input.specialty?.trim() ?? "";
  const titlePart = [roleTitle, specialty].filter(Boolean).join(" ");

  const params = new URLSearchParams();
  params.set("origin", "FACETED_SEARCH");
  params.set("network", '["S"]');

  const companyId = input.linkedinCompanyId?.trim();
  if (companyId) {
    params.set("currentCompany", JSON.stringify([companyId]));
    if (titlePart) params.set("keywords", titlePart);
  } else {
    const keywords = [input.company.trim(), titlePart].filter(Boolean).join(" ");
    params.set("keywords", keywords);
  }

  return `https://www.linkedin.com/search/results/people/?${params.toString()}`;
}
