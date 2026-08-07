import type { ParsedResume } from "../../ai/types";
import type {
  Experience,
  Profile,
  ProfileSectionEntry,
  ResumeFields,
  ResumeTemplateId,
  Skill,
  TailorSession,
} from "../../../types";
import { monthRange } from "../document";

export const RESUME_TEMPLATE_IDS: ResumeTemplateId[] = ["classic", "compact"];

export function isResumeTemplateId(value: unknown): value is ResumeTemplateId {
  return value === "classic" || value === "compact";
}

/** Map a stored parse (or tailored jsonb) into the template view model. */
export function fieldsFromParsed(parsed: ParsedResume | ResumeFields): ResumeFields {
  return {
    fullName: parsed.fullName,
    headline: parsed.headline,
    email: parsed.email,
    phone: "phone" in parsed ? (parsed.phone ?? null) : null,
    location: parsed.location,
    summary: parsed.summary,
    links: (parsed.links ?? []).map((l) => ({ label: l.label, url: l.url })),
    experiences: (parsed.experiences ?? []).map((e) => ({
      title: e.title,
      company: e.company,
      startDate: e.startDate,
      endDate: e.endDate,
      bullets: [...(e.bullets ?? [])],
    })),
    education: (parsed.education ?? []).map((e) => ({
      title: e.title,
      organization: e.organization,
      dateRange: e.dateRange,
      lines: [...(e.lines ?? [])],
    })),
    projects: (parsed.projects ?? []).map((e) => ({
      title: e.title,
      organization: e.organization,
      dateRange: e.dateRange,
      lines: [...(e.lines ?? [])],
    })),
    certifications: (parsed.certifications ?? []).map((e) => ({
      title: e.title,
      organization: e.organization,
      dateRange: e.dateRange,
      lines: [...(e.lines ?? [])],
    })),
    skills: [...(parsed.skills ?? [])],
  };
}

function entriesFromSections(entries: ProfileSectionEntry[] | undefined) {
  return (entries ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((e) => ({
      title: e.title,
      organization: e.organization,
      dateRange: e.dateRange,
      lines: e.lines
        .filter((l) => l.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((l) => l.text),
    }));
}

/**
 * Build Generate/Tailor fields from the profile spine.
 * Section tables win when present; `baseParse` fills gaps for older accounts.
 */
export function fieldsFromProfileSpine(input: {
  profile: Profile | null;
  experiences: Experience[];
  skills: Skill[];
  education?: ProfileSectionEntry[];
  projects?: ProfileSectionEntry[];
  certifications?: ProfileSectionEntry[];
  /** Optional: fill sections the profile doesn't hold yet. */
  baseParse?: ParsedResume | ResumeFields | null;
}): ResumeFields {
  const base = input.baseParse ? fieldsFromParsed(input.baseParse) : emptyFields();
  const enabled = input.experiences
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((exp) => ({
      title: exp.title,
      company: exp.company,
      startDate: exp.startDate,
      endDate: exp.endDate,
      bullets: exp.bullets
        .filter((b) => b.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((b) => b.text),
    }));

  const education = entriesFromSections(input.education);
  const projects = entriesFromSections(input.projects);
  const certifications = entriesFromSections(input.certifications);

  return {
    fullName: base.fullName ?? input.profile?.fullName ?? null,
    headline: input.profile?.headline ?? base.headline,
    email: base.email ?? input.profile?.email ?? null,
    phone: input.profile?.phone ?? base.phone,
    location: input.profile?.location ?? base.location,
    summary: input.profile?.summary ?? base.summary,
    links: input.profile?.links?.length
      ? input.profile.links
      : base.links.length
        ? base.links
        : [],
    experiences: enabled.length ? enabled : base.experiences,
    education: education.length ? education : base.education,
    projects: projects.length ? projects : base.projects,
    certifications: certifications.length ? certifications : base.certifications,
    skills: input.skills.length
      ? input.skills
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((s) => s.name)
      : base.skills,
  };
}

export function emptyFields(): ResumeFields {
  return {
    fullName: null,
    headline: null,
    email: null,
    phone: null,
    location: null,
    summary: null,
    links: [],
    experiences: [],
    education: [],
    projects: [],
    certifications: [],
    skills: [],
  };
}

function factKey(a: string | null | undefined, b: string | null | undefined): string {
  return `${(a ?? "").trim().toLowerCase()}::${(b ?? "").trim().toLowerCase()}`;
}

/**
 * After a tailor/enrich model call: restore identity, contact, and
 * employer/title/date rows from the spine. The model is instructed to keep
 * these, but still drifts (login email for resume email, dropped phone).
 */
export function pinSpineFacts(
  tailored: ResumeFields,
  spine: ResumeFields,
): ResumeFields {
  const modelByRole = new Map(
    tailored.experiences.map((e) => [factKey(e.company, e.title), e]),
  );
  const experiences = spine.experiences.map((spineExp) => {
    const model = modelByRole.get(factKey(spineExp.company, spineExp.title));
    return {
      title: spineExp.title,
      company: spineExp.company,
      startDate: spineExp.startDate,
      endDate: spineExp.endDate,
      bullets:
        model?.bullets?.length ? model.bullets : spineExp.bullets,
    };
  });
  for (const exp of tailored.experiences) {
    if (
      factKey(exp.company, exp.title).includes("additional") ||
      (exp.company ?? "").trim().toLowerCase() === "additional" ||
      (exp.title ?? "").trim().toLowerCase() === "additional"
    ) {
      experiences.push({
        title: exp.title,
        company: exp.company,
        startDate: null,
        endDate: null,
        bullets: exp.bullets,
      });
    }
  }

  const pinEntries = (
    spineEntries: ResumeFields["education"],
    modelEntries: ResumeFields["education"],
    keepAll: boolean,
  ) => {
    if (!spineEntries.length) return modelEntries;
    const modelBy = new Map(
      modelEntries.map((e) => [factKey(e.title, e.organization), e]),
    );
    if (keepAll) {
      return spineEntries.map((s) => {
        const m = modelBy.get(factKey(s.title, s.organization));
        return {
          title: s.title,
          organization: s.organization,
          dateRange: s.dateRange,
          lines: m?.lines?.length ? m.lines : s.lines,
        };
      });
    }
    return modelEntries
      .map((m) => {
        const s = spineEntries.find(
          (e) => factKey(e.title, e.organization) === factKey(m.title, m.organization),
        );
        if (!s) return null;
        return {
          title: s.title,
          organization: s.organization,
          dateRange: s.dateRange,
          lines: m.lines?.length ? m.lines : s.lines,
        };
      })
      .filter((e): e is NonNullable<typeof e> => !!e);
  };

  return {
    fullName: spine.fullName ?? tailored.fullName,
    headline: tailored.headline ?? spine.headline,
    email: spine.email ?? tailored.email,
    phone: spine.phone ?? tailored.phone,
    location: spine.location ?? tailored.location,
    summary: tailored.summary ?? spine.summary,
    links: spine.links.length ? spine.links : tailored.links,
    experiences,
    education: pinEntries(spine.education, tailored.education, true),
    projects: pinEntries(spine.projects, tailored.projects, false),
    certifications: pinEntries(
      spine.certifications,
      tailored.certifications,
      false,
    ),
    skills: tailored.skills.length ? tailored.skills : spine.skills,
  };
}

export function experienceDateLabel(
  startDate: string | null,
  endDate: string | null,
): string {
  return monthRange(startDate, endDate);
}

export function resumeFileStem(fields: ResumeFields): string {
  const name = (fields.fullName ?? "").trim();
  const stem = name === "" ? "Resume" : `${name} Resume`;
  return stem.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ");
}

/** Coerce jsonb from the database into ResumeFields, or null if unusable. */
export function parseStoredResumeFields(value: unknown): ResumeFields | null {
  return parseStoredTailored(value).fields;
}

/**
 * `applications.tailored_resume` is either legacy bare fields, or an envelope
 * that also carries the last tailor session (summary, diffs, skill gaps).
 */
export function parseStoredTailored(value: unknown): {
  fields: ResumeFields | null;
  session: TailorSession | null;
} {
  if (!value || typeof value !== "object") {
    return { fields: null, session: null };
  }
  const raw = value as Record<string, unknown>;

  if (raw.fields && typeof raw.fields === "object") {
    const fields = coerceFields(raw.fields);
    if (!fields) return { fields: null, session: null };
    return { fields, session: coerceSession(raw) };
  }

  const fields = coerceFields(raw);
  return { fields, session: null };
}

/** What we write back to `applications.tailored_resume`. */
export function serializeTailored(
  fields: ResumeFields,
  session: TailorSession | null,
): ResumeFields | Record<string, unknown> {
  const normalized = fieldsFromParsed(fields);
  if (!session) return normalized;
  return {
    fields: normalized,
    summary: session.summary,
    changes: session.changes,
    keywords: session.keywords,
    missingSkills: session.missingSkills,
    variant: session.variant,
    briefs: session.briefs,
  };
}

function coerceFields(value: unknown): ResumeFields | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.experiences) && !Array.isArray(raw.skills)) return null;
  try {
    return fieldsFromParsed(raw as unknown as ParsedResume);
  } catch {
    return null;
  }
}

function coerceSession(raw: Record<string, unknown>): TailorSession | null {
  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const changes = Array.isArray(raw.changes)
    ? raw.changes
        .filter(
          (c): c is Record<string, unknown> => !!c && typeof c === "object",
        )
        .map((c) => ({
          before: String(c.before ?? ""),
          after: String(c.after ?? ""),
          rationale: String(c.rationale ?? ""),
        }))
    : [];
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords
        .filter(
          (k): k is Record<string, unknown> => !!k && typeof k === "object",
        )
        .map((k) => ({
          keyword: String(k.keyword ?? ""),
          covered: Boolean(k.covered),
          ...(typeof k.hint === "string" ? { hint: k.hint } : {}),
        }))
        .filter((k) => k.keyword.length > 0)
    : [];
  const missingSkills = Array.isArray(raw.missingSkills)
    ? raw.missingSkills
        .filter(
          (m): m is Record<string, unknown> => !!m && typeof m === "object",
        )
        .map((m) => ({
          skill: String(m.skill ?? ""),
          prompt: String(m.prompt ?? ""),
        }))
        .filter((m) => m.skill.length > 0)
    : [];
  const briefs: Record<string, string> = {};
  if (raw.briefs && typeof raw.briefs === "object" && !Array.isArray(raw.briefs)) {
    for (const [key, val] of Object.entries(raw.briefs as Record<string, unknown>)) {
      if (typeof val === "string") briefs[key] = val;
    }
  }

  // A session with nothing useful is treated as absent (legacy rows).
  if (
    !summary &&
    changes.length === 0 &&
    keywords.length === 0 &&
    missingSkills.length === 0 &&
    Object.keys(briefs).length === 0
  ) {
    return null;
  }

  return {
    summary,
    changes,
    keywords,
    missingSkills,
    variant: typeof raw.variant === "string" ? raw.variant : null,
    briefs,
  };
}
