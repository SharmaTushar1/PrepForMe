import type { Experience, PrepCitation, Recap } from "../../types";
import { covers, extractKeywords } from "./keywords";
import type {
  AiProvider,
  AtsInput,
  AtsKeyword,
  ParsedResume,
  PrepAnswer,
  PrepQuestionInput,
  ProfileContext,
  ReferralDraft,
  ReferralInput,
  SuggestReferralsInput,
  TailorInput,
  TailoringChange,
  TailoringResult,
} from "./types";

/**
 * The local provider. It reasons only over data the user actually gave us —
 * their bullets, the pasted job description, their own recaps — so nothing it
 * produces is a claim they can't back up. When a real model is wired in behind
 * an Edge Function, every screen keeps working unchanged.
 */

const THINKING_MS = 550;

function delay<T>(value: T, ms = THINKING_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

/** Everything of the user's that a keyword could legitimately appear in. */
function resumeText(context: ProfileContext): string {
  const parts: string[] = [];
  if (context.profile?.headline) parts.push(context.profile.headline);
  for (const exp of context.experiences) {
    parts.push(exp.title, exp.company, exp.summary ?? "");
    for (const b of exp.bullets) if (b.enabled) parts.push(b.text);
  }
  for (const s of context.skills) parts.push(s.name);
  return parts.join("\n");
}

function enabledBullets(experiences: Experience[]) {
  return experiences.flatMap((e) => e.bullets.filter((b) => b.enabled));
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Reframe a real bullet by leading with the job description's own word for the
 * work it already describes. Nothing is added — the sentence is re-emphasized.
 */
function reframe(bullet: string, keyword: string): string {
  const label = keyword.charAt(0).toUpperCase() + keyword.slice(1);
  return `${label}: ${lowerFirst(bullet.trim())}`;
}

function keywordsIn(text: string, keywords: string[]): string[] {
  return keywords.filter((k) => covers(text, k));
}

function computeAtsGap({ application, context }: AtsInput): AtsKeyword[] {
  const jd = application.jobDescription ?? "";
  const keywords = extractKeywords(jd);
  if (!keywords.length) return [];
  const mine = resumeText(context);
  return keywords.map((keyword) => {
    const covered = covers(mine, keyword);
    return {
      keyword,
      covered,
      hint: covered ? undefined : "only add this if you've actually done it.",
    };
  });
}

export const mockAiProvider: AiProvider = {
  name: "local",
  supportsResumeParsing: false,

  async tailorResume({ application, context }: TailorInput): Promise<TailoringResult> {
    const keywords = computeAtsGap({ application, context });
    const covered = keywords.filter((k) => k.covered).map((k) => k.keyword);
    const bullets = enabledBullets(context.experiences);

    const changes: TailoringChange[] = [];
    const used = new Set<string>();

    for (const bullet of bullets) {
      const matches = keywordsIn(bullet.text, covered).filter((k) => !used.has(k));
      if (!matches.length) continue;
      const keyword = matches[0];
      used.add(keyword);
      const after = reframe(bullet.text, keyword);
      if (after === bullet.text) continue;
      changes.push({
        before: bullet.text,
        after,
        rationale: `led with "${keyword}" — the job description's own word for work you've already done`,
        sourceBulletId: bullet.id,
      });
      if (changes.length === 4) break;
    }

    const summary = changes.length
      ? `Re-emphasized ${changes.length} of your real bullet${changes.length === 1 ? "" : "s"} to match this role's language. Nothing was invented.`
      : bullets.length
        ? "Your bullets already read the way this role is written — no reframing needed."
        : "Add some experience bullets to your profile and we'll reframe them for this role.";

    return delay({
      summary,
      changes,
      keywords,
      variant: used.size ? `${[...used][0]}-led` : null,
      model: "local/keyword-match",
    });
  },

  atsGap: (input) => delay(computeAtsGap(input), 0),

  async draftReferralNote({
    application,
    context,
    person,
    charLimit,
  }: ReferralInput): Promise<string> {
    const role = application.role;
    const company = application.company;
    const mine = context.experiences[0];
    const anchor = mine ? `I've been doing ${lowerFirst(mine.title)} work at ${mine.company}` : null;

    const opener = `Hi ${person.name.split(" ")[0]} —`;
    const middle = anchor
      ? `${anchor}, and I'm exploring the ${role} role at ${company}.`
      : `I'm exploring the ${role} role at ${company}.`;
    const close = "Would you be open to connecting?";

    let note = `${opener} ${middle} ${close}`;
    // A draft that can't be sent isn't a draft. Trim the softest part first.
    if (charLimit && note.length > charLimit) {
      note = `${opener} I'm exploring the ${role} role at ${company}. ${close}`;
    }
    if (charLimit && note.length > charLimit) {
      note = `${opener} exploring the ${role} role at ${company} — open to connecting?`;
    }
    return delay(note, 200);
  },

  async suggestReferrals({
    application,
    context,
    charLimit,
  }: SuggestReferralsInput): Promise<ReferralDraft[]> {
    // Without a people graph we can't name real humans, so we describe the
    // three roles worth reaching out to and draft a note for each.
    const shapes = [
      { name: "Someone on the team", role: `${application.role} at ${application.company}`, tag: "Team you'd join" },
      { name: "A peer in your space", role: `Works on what you work on`, tag: "Same problem space" },
      { name: "The hiring manager", role: `Hiring for this role`, tag: "Decision maker" },
    ];

    const drafts: ReferralDraft[] = [];
    for (const shape of shapes) {
      const note = await this.draftReferralNote({
        application,
        context,
        person: shape,
        charLimit,
      });
      drafts.push({ ...shape, note });
    }
    return drafts;
  },

  async answerPrepQuestion({
    question,
    application,
    context,
    recaps,
    sourceCount,
  }: PrepQuestionInput): Promise<PrepAnswer> {
    const citations: PrepCitation[] = [];
    const lines: string[] = [];

    lines.push(
      `On ${application.company} · ${application.role}${application.level ? ` · ${application.level}` : ""}:`,
    );

    if (sourceCount > 0) {
      citations.push({ label: "Company info", layer: "company" });
      lines.push(
        `I'm working from the ${sourceCount} source${sourceCount === 1 ? "" : "s"} you've added for this company.`,
      );
    } else {
      citations.push({ label: "General role guidance", layer: "general" });
      lines.push(
        "No company sources are attached yet, so this is general guidance for the role — add a URL in the Company layer and it gets specific.",
      );
    }

    if (recaps.length) {
      citations.push({ label: "Your notes", layer: "personal" });
      const themes = recapThemes(recaps);
      lines.push(
        `Your ${recaps.length} logged recap${recaps.length === 1 ? "" : "s"} point at: ${themes.join("; ")}.`,
      );
    } else {
      lines.push(
        "Once you log a recap, answers here start drawing on what they actually asked you.",
      );
    }

    if (application.jobDescription) {
      citations.push({ label: "Role & level", layer: "role" });
      const keywords = extractKeywords(application.jobDescription, 5);
      if (keywords.length) {
        lines.push(`The posting leans on: ${keywords.join(", ")} — have a story ready for each.`);
        const mine = keywordsIn(resumeText(context), keywords);
        if (mine.length) {
          lines.push(`Your profile already backs ${mine.join(", ")}, so lead with those.`);
        }
      }
    }

    lines.push(`(Asked: "${question.trim()}")`);

    return delay({ content: lines.join(" "), citations });
  },

  async parseResume(): Promise<ParsedResume> {
    throw new Error(
      "Resume parsing isn't wired up yet — add your experience directly on the Profile screen.",
    );
  },
};

/** Short, quoted themes pulled straight out of the user's own recap text. */
function recapThemes(recaps: Recap[]): string[] {
  const themes: string[] = [];
  for (const recap of recaps.slice(0, 3)) {
    const source = (recap.questions ?? recap.notes ?? "").trim();
    if (!source) {
      themes.push(`a ${recap.roundType.toLowerCase()} round`);
      continue;
    }
    const first = source.split(/[\n.?]/).map((s) => s.trim()).find(Boolean);
    if (first) themes.push(`${recap.roundType.toLowerCase()} — "${truncate(first, 70)}"`);
  }
  return themes.length ? themes : ["nothing specific yet"];
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}
