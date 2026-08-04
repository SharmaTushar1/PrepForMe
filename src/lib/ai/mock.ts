import type { Experience, PrepCitation, Recap } from "../../types";
import { covers, extractKeywords } from "./keywords";
import type {
  AiProvider,
  AtsCategories,
  AtsInput,
  AtsKeyword,
  ParsedResume,
  PrepAnswer,
  PrepQuestionInput,
  ProfileContext,
  ReferralDraft,
  ReferralInput,
  ResumeAnalysis,
  ResumeEdit,
  ResumeImprovement,
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
  // Still false now that parseResume answers instead of throwing: what comes
  // back is the fixture below, not anything read out of the user's file. The
  // upload surfaces stay reachable so they can be built — it's the claim that
  // we read the file that this flag gates.
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

  parseResume: () => delay(SAMPLE_PARSE, 900),

  /**
   * Sample rewrites of the sample resume's own weak bullets.
   *
   * `original` matches `SAMPLE_PARSE` exactly, which is what makes the accept
   * path real offline: the substitution into a rebuilt document is the same code
   * against the same keys, so the only thing being faked is where the text came
   * from.
   */
  async improveResume(_resumeId, { onProgress } = {}): Promise<ResumeImprovement> {
    const total = SAMPLE_EDITS.length + 2;
    onProgress?.({ step: 1, total, label: "Reading your report" });
    await delay(null, 320);
    onProgress?.({ step: 2, total, label: "Working out what to change" });

    for (let i = 0; i < SAMPLE_EDITS.length; i++) {
      await delay(null, 340);
      onProgress?.({
        step: 3 + i,
        total,
        label: i === 0 ? "Rewrote a line" : `Rewrote ${i + 1} lines`,
      });
    }

    return { edits: SAMPLE_EDITS, model: "local-heuristic", sample: true };
  },

  /**
   * Walks the same four steps the real analyzer reports, including the long wait
   * in the middle — compressed, but the same shape, so the waiting caption and the
   * bar's paler fill can be looked at without spending a token. The progress bar
   * is the hardest part of this screen to get right and the most expensive to test
   * against a model, so it stays exercisable for free.
   */
  async analyzeResume(_resumeId, { onProgress } = {}): Promise<ResumeAnalysis> {
    const total = 4;
    const expectedMs = 4_000;

    onProgress?.({ step: 1, total, label: "Reading the document" });
    await delay(null, 300);
    onProgress?.({ step: 2, total, label: "Reading your resume" });

    // The model call: one step, nothing observable inside it, so what moves is
    // the clock. Overshoots `expectedMs` on purpose — that path has copy of its
    // own and would otherwise never be seen.
    for (let elapsedMs = 0; elapsedMs <= 5_000; elapsedMs += 500) {
      await delay(null, 500);
      onProgress?.({
        step: 2,
        total,
        label: "Reading your resume",
        waiting: { elapsedMs, expectedMs },
      });
    }

    onProgress?.({ step: 3, total, label: "Checking the report over" });
    await delay(null, 260);
    onProgress?.({ step: 4, total, label: "Saving the report" });
    await delay(null, 260);

    return SAMPLE_ANALYSIS;
  },
};

/* -------------------------------------------------- sample resume analysis
 *
 * Not an analysis of anything — a fixture, so every state of the report and
 * review screens can be built and looked at without spending a token. It is
 * deliberately varied: a category with no findings at all, findings with and
 * without quoted evidence, all three severities, and scores from 41 to 95.
 * `sample: true` is what the screen must key its "no model was called" banner
 * off; nothing here should ever be mistaken for the user's own resume.
 */

const SAMPLE_PARSE: ParsedResume = {
  fullName: "Sample Candidate",
  headline: "Senior Backend Engineer",
  // Deliberately the address the `contact` category objects to below, so the
  // parse and the report describe the same imaginary file.
  email: "beastmode_dev_99@example.com",
  location: "Bengaluru, India",
  summary:
    "Backend engineer with six years on payments and event infrastructure. Happiest where correctness and latency are both non-negotiable.",
  links: [
    { label: "LinkedIn", url: "https://www.linkedin.com/in/sample-candidate" },
    { label: "GitHub", url: "https://github.com/sample-candidate" },
  ],
  experiences: [
    {
      title: "Senior Backend Engineer",
      company: "Northwind Labs",
      startDate: "2022-03-01",
      endDate: null,
      bullets: [
        "Cut p99 checkout latency from 1.8s to 420ms by replacing a synchronous fan-out with a batched read path.",
        "Responsible for the payments service and its on-call rotation.",
        "Led the migration of 40 services off a shared Postgres instance with no customer-visible downtime.",
      ],
    },
    {
      title: "Backend Engineer",
      company: "Cobalt Systems",
      startDate: "2019-07-01",
      endDate: "2022-02-28",
      bullets: [
        "Built the ingestion pipeline that now carries 2.4B events a day.",
        "Worked with product and design on the reporting API.",
      ],
    },
  ],
  education: [
    {
      title: "B.E. Computer Science",
      organization: "Visvesvaraya Technological University",
      // Verbatim, en dash and all, the way a real resume prints it.
      dateRange: "Aug 2015 – Jun 2019",
      lines: ["First class with distinction.", "Coursework: distributed systems, compilers."],
    },
  ],
  projects: [
    {
      title: "ledger-lint",
      organization: "",
      dateRange: "2023",
      lines: [
        "Static checker for double-entry bookkeeping invariants. 900 stars, used by four open-source finance projects.",
      ],
    },
  ],
  // Deliberately dateless and line-less: the review screen has to render an
  // entry that is nothing but a title and an issuer.
  certifications: [
    {
      title: "Certified Kubernetes Administrator",
      organization: "The Linux Foundation",
      dateRange: "",
      lines: [],
    },
  ],
  skills: ["Go", "PostgreSQL", "Kafka", "Kubernetes", "Terraform", "gRPC"],
};

const SAMPLE_CATEGORIES: AtsCategories = {
  parse: {
    id: "parse",
    label: "What a parser extracts",
    score: 82,
    summary:
      "Your name, both employers, and every title came through clean. One date range didn't.",
    findings: [
      {
        severity: "warning",
        title: "A date range lost its end",
        detail:
          "An en dash with no spaces reads as a single token, so this row indexes as one date instead of a range and the role looks like it lasted a day.",
        fix: "Write it as \"Jul 2019 – Feb 2022\", with spaces around the dash.",
        evidence: "Cobalt Systems, Jul 2019–Feb 2022",
      },
      {
        severity: "pass",
        title: "Titles and employers survived",
        detail:
          "Both roles came back with the title and company attached to the right dates, which is the pairing everything downstream depends on.",
        fix: "Keep title, employer, and dates on one line each — that's what made them readable.",
      },
    ],
  },
  format: {
    id: "format",
    label: "File and layout",
    score: 41,
    summary: "Two columns and a header are costing you more than anything else in this report.",
    findings: [
      {
        severity: "critical",
        title: "Two-column layout",
        detail:
          "Parsers read a page in one pass, left to right. A second column gets interleaved into the first, so sentences arrive spliced together and the whole document reads as noise.",
        fix: "Move to a single column. Keep the skills block as a plain list under the experience section.",
      },
      {
        severity: "critical",
        title: "Contact details sit in the page header",
        detail:
          "Text in a PDF header is often skipped entirely, which is how a resume arrives with no email attached to it.",
        fix: "Move your name, email, and location into the body of the first page.",
      },
      {
        severity: "warning",
        title: "Dates are inside a table",
        detail:
          "Table cells are read column by column, so a date can end up attached to the role above or below it.",
        fix: "Put the date on the same text line as the title, separated by a comma or a pipe.",
      },
    ],
  },
  sections: {
    id: "sections",
    label: "Section headings",
    score: 90,
    summary: "Experience and Skills are named the way a parser expects. One heading isn't.",
    findings: [
      {
        severity: "warning",
        title: "A non-standard heading",
        detail:
          "Headings are how a parser decides which block is which. An invented one usually lands in an \"other\" bucket nobody reads.",
        fix: "Rename it to \"Experience\", or fold it into the roles it describes.",
        evidence: "CAREER HIGHLIGHTS",
      },
    ],
  },
  impact: {
    id: "impact",
    label: "Bullets and impact",
    score: 55,
    summary: "Three of your five bullets lead with an action and a number. Two describe duties.",
    findings: [
      {
        severity: "warning",
        title: "A duty, not a result",
        detail:
          "\"Responsible for\" names the job you held, which the title already says. It tells a reader nothing about what changed because you held it.",
        fix: "Say what improved and by how much — uptime, incident count, time to recover.",
        evidence: "Responsible for the payments service and its on-call rotation.",
      },
      {
        severity: "warning",
        title: "A collaboration with no outcome",
        detail:
          "Working with other functions is table stakes at this level; the bullet spends a line without making a claim.",
        fix: "Name what shipped and what it moved.",
        evidence: "Worked with product and design on the reporting API.",
      },
      {
        severity: "pass",
        title: "Your strongest bullet is the shape to copy",
        detail:
          "A verb, a specific before and after, and the mechanism that got you there. Three of your bullets already read like this.",
        fix: "Use this one as the template when you rewrite the two below it.",
        evidence:
          "Cut p99 checkout latency from 1.8s to 420ms by replacing a synchronous fan-out with a batched read path.",
      },
    ],
  },
  skills: {
    id: "skills",
    label: "Skills visibility",
    score: 68,
    summary: "You have a skills section, but half of what you actually use is only in prose.",
    findings: [
      {
        severity: "warning",
        title: "Skills mentioned only inside a bullet",
        detail:
          "A recruiter filtering on a tool searches the skills block first. Anything that appears only in a sentence can be missed.",
        fix: "Add the tools named in your bullets to the skills list, as long as you'd defend each one in an interview.",
        evidence: "Built the ingestion pipeline that now carries 2.4B events a day.",
      },
      {
        severity: "pass",
        title: "No keyword stuffing",
        detail:
          "Skill terms sit at roughly 2% of the document, inside the healthy band. Nothing is repeated to game a filter.",
        fix: "Keep it there — only add a term you'd be happy to be interviewed on.",
      },
    ],
  },
  length: {
    id: "length",
    label: "Length",
    score: 95,
    summary: "Two pages and 640 words is right for six years of experience.",
    findings: [],
  },
  contact: {
    id: "contact",
    label: "Contact details",
    score: 74,
    summary: "Everything a recruiter needs is present. One line of it works against you.",
    findings: [
      {
        severity: "critical",
        title: "No phone number",
        detail:
          "Some applicant tracking systems treat a missing phone number as an incomplete application and stop there.",
        fix: "Add a phone number next to your email on the first page.",
      },
      {
        severity: "warning",
        title: "A personal email address",
        detail: "The address is the first thing read after your name, and this one sets a tone.",
        fix: "Use firstname.lastname@ at any mainstream provider.",
        evidence: "beastmode_dev_99@example.com",
      },
      {
        severity: "pass",
        title: "Both links resolve",
        detail: "LinkedIn and GitHub are written as full URLs, so they survive being copied out.",
        fix: "Keep writing them in full rather than hiding them behind link text.",
      },
    ],
  },
};

const SAMPLE_ANALYSIS: ResumeAnalysis = {
  model: "local-heuristic",
  sample: true,
  // Nothing stored this, which is also why rewrites of it can't be saved.
  reportId: null,
  parsed: SAMPLE_PARSE,
  report: {
    overallScore: 72,
    summary:
      "The writing is strong and the parse mostly holds up. The layout is what's costing you — a two-column page with contact details in the header is the difference between this resume being read and being discarded before a human sees it.",
    // The sample resume is the two-column one the `format` category objects to,
    // so the free fixture is also the one that exercises the rebuild offer.
    layout: "multi_column",
    categories: SAMPLE_CATEGORIES,
    topFixes: [
      {
        category: "format",
        severity: "critical",
        title: "Two-column layout",
        fix: "Move to a single column. Nothing else in this report matters as much.",
      },
      {
        category: "contact",
        severity: "critical",
        title: "No phone number",
        fix: "Add a phone number next to your email on the first page.",
      },
      {
        category: "impact",
        severity: "warning",
        title: "Two bullets describe duties",
        fix: "Rewrite both to lead with a verb and land on a number.",
      },
    ],
  },
};

/* ------------------------------------------------------- sample rewrites
 *
 * Three shapes on purpose, because they are the three the UI has to handle
 * differently: an ordinary rewrite, one that leaves a blank the candidate must
 * fill, and one that introduces a figure the original never stated — which the
 * real validator flags and "accept all" refuses to include. Every `original` is
 * copied from `SAMPLE_PARSE` above, so accepting one actually changes the
 * rebuilt document.
 */
const SAMPLE_EDITS: ResumeEdit[] = [
  {
    id: "sample-edit-1",
    category: "impact",
    findingTitle: "A duty, not a result",
    original: "Responsible for the payments service and its on-call rotation.",
    suggested:
      "Owned the payments service and its on-call rotation, cutting time to recover from ___ to ___.",
    note:
      "Leads with ownership instead of responsibility. Fill in your before-and-after recovery time, or swap in incident count if that's the number you have.",
    hasBlank: true,
    flag: "",
    status: "suggested",
  },
  {
    id: "sample-edit-2",
    category: "impact",
    findingTitle: "A collaboration with no outcome",
    original: "Worked with product and design on the reporting API.",
    suggested:
      "Shipped the reporting API with product and design, replacing ___ of manual reporting work.",
    note:
      "Names what shipped rather than who you sat with. Fill in what the API replaced — hours a week, a spreadsheet, a manual export.",
    hasBlank: true,
    flag: "",
    status: "suggested",
  },
  {
    id: "sample-edit-3",
    category: "skills",
    findingTitle: "Skills mentioned only inside a bullet",
    original: "Built the ingestion pipeline that now carries 2.4B events a day.",
    suggested:
      "Built the Kafka ingestion pipeline that now carries 2.4B events a day, at 99.9% delivery.",
    note:
      "Names the tool so it is findable, and states the reliability bar the pipeline holds.",
    // Deliberately flagged: 99.9 appears nowhere in the original, so this is
    // exactly the rewrite a candidate must not accept without checking.
    flag:
      "This rewrite adds a figure your line didn't state (99.9). Check it against what actually happened before you use it.",
    hasBlank: false,
    status: "suggested",
  },
];

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
