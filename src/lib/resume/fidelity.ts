/**
 * Content-fidelity: tailored fields vs the profile spine.
 * Fail closed on employer / title / date drift; flag fabricated bullet claims;
 * `___` placeholders are allowed (visually flagged in HTML/PDF).
 */

import type { ResumeFields } from "../../types";

export type FidelitySeverity = "hard" | "soft";

export interface FidelityIssue {
  severity: FidelitySeverity;
  path: string;
  message: string;
}

export interface FidelityReport {
  ok: boolean;
  issues: FidelityIssue[];
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dateKey(start: string | null, end: string | null): string {
  return `${norm(start)}|${norm(end)}`;
}

/** Tokens that look like unverifiable quantified claims. */
const FABRICATED_HINT =
  /\b(\d{2,}%|\d+\s*(?:x|times)|\$\d|\d+\s*(?:million|billion|k\b))\b/i;

function spineBullets(spine: ResumeFields): Set<string> {
  const set = new Set<string>();
  for (const exp of spine.experiences) {
    for (const b of exp.bullets) set.add(norm(b));
  }
  for (const section of [spine.projects, spine.education, spine.certifications]) {
    for (const e of section) {
      for (const line of e.lines) set.add(norm(line));
    }
  }
  return set;
}

function fuzzyContains(haystack: Set<string>, needle: string): boolean {
  const n = norm(needle);
  if (!n || n.includes("___")) return true;
  if (haystack.has(n)) return true;
  // Soft match: tailored bullet is a rephrase if most words appear in some spine bullet.
  const words = n.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  if (words.length < 3) return haystack.has(n);
  for (const candidate of haystack) {
    let hit = 0;
    for (const w of words) if (candidate.includes(w)) hit += 1;
    if (hit / words.length >= 0.55) return true;
  }
  return false;
}

export function checkContentFidelity(
  tailored: ResumeFields,
  spine: ResumeFields,
): FidelityReport {
  const issues: FidelityIssue[] = [];

  for (const key of ["email", "phone", "location"] as const) {
    const expected = spine[key]?.trim();
    if (!expected) continue;
    if (norm(tailored[key]) !== norm(expected)) {
      issues.push({
        severity: "soft",
        path: key,
        message: `${key === "email" ? "Email" : key === "phone" ? "Phone" : "Location"} differs from your profile spine ("${expected}"). Fine if you asked to change it.`,
      });
    }
  }

  if (spine.links.length) {
    const tailoredUrls = new Set(tailored.links.map((l) => norm(l.url)));
    for (const link of spine.links) {
      if (!tailoredUrls.has(norm(link.url))) {
        issues.push({
          severity: "soft",
          path: "links",
          message: `Link from your spine not on this version: ${link.label || link.url}.`,
        });
      }
    }
  }

  const spineRoles = new Map(
    spine.experiences.map((e) => [
      `${norm(e.company)}::${norm(e.title)}`,
      e,
    ]),
  );

  for (const spineExp of spine.experiences) {
    const key = `${norm(spineExp.company)}::${norm(spineExp.title)}`;
    const present = tailored.experiences.some(
      (e) => `${norm(e.company)}::${norm(e.title)}` === key,
    );
    if (!present) {
      issues.push({
        severity: "hard",
        path: "experiences",
        message: `Role missing from tailored resume: "${spineExp.title}" at "${spineExp.company}".`,
      });
    }
  }

  for (let i = 0; i < tailored.experiences.length; i++) {
    const exp = tailored.experiences[i];
    const key = `${norm(exp.company)}::${norm(exp.title)}`;
    const match = spineRoles.get(key);
    if (!match) {
      // Allow "Additional" block for skill-gap attachments.
      if (norm(exp.company) === "additional" || norm(exp.title) === "additional") {
        continue;
      }
      issues.push({
        severity: "hard",
        path: `experiences[${i}]`,
        message: `Employer/title not on your profile spine: "${exp.title}" at "${exp.company}".`,
      });
      continue;
    }
    if (dateKey(exp.startDate, exp.endDate) !== dateKey(match.startDate, match.endDate)) {
      issues.push({
        severity: "hard",
        path: `experiences[${i}].dates`,
        message: `Dates for "${exp.title}" at "${exp.company}" don't match your profile.`,
      });
    }
  }

  const known = spineBullets(spine);
  for (let i = 0; i < tailored.experiences.length; i++) {
    const exp = tailored.experiences[i];
    for (let j = 0; j < exp.bullets.length; j++) {
      const bullet = exp.bullets[j];
      if (bullet.includes("___")) continue;
      if (!fuzzyContains(known, bullet)) {
        const sev: FidelitySeverity = FABRICATED_HINT.test(bullet) ? "hard" : "soft";
        issues.push({
          severity: sev,
          path: `experiences[${i}].bullets[${j}]`,
          message:
            sev === "hard"
              ? `Bullet introduces figures not found on your spine: "${bullet.slice(0, 80)}…"`
              : `Bullet may not match your written experience: "${bullet.slice(0, 80)}${bullet.length > 80 ? "…" : ""}"`,
        });
      }
    }
  }

  const spineSkills = new Set(spine.skills.map(norm));
  for (const skill of tailored.skills) {
    if (skill.includes("___")) continue;
    // Skills added via elicitation are expected; only soft-flag brand-new chips
    // that look invented without user brief (caller adds those under Additional).
    if (!spineSkills.has(norm(skill)) && !/^[A-Za-z0-9.+#\-/ ]{2,40}$/.test(skill)) {
      issues.push({
        severity: "soft",
        path: "skills",
        message: `Unusual skill chip not on your profile: "${skill}".`,
      });
    }
  }

  const hard = issues.some((i) => i.severity === "hard");
  return { ok: !hard, issues };
}
