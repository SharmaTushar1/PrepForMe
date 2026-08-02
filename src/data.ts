import type { Stage, TourStep } from "./types";

/** The pipeline, in order. Rejected and Withdrawn sit outside it. */
export const STAGES: Stage[] = [
  "Saved",
  "Applied",
  "Screen",
  "Technical",
  "Onsite",
  "Offer",
];

/** Every stage a role can be set to, including the terminal ones. */
export const ALL_STAGES: Stage[] = [...STAGES, "Rejected", "Withdrawn"];

/** Stages that mean the company came back to you. */
export const RESPONDED_STAGES: Stage[] = ["Screen", "Technical", "Onsite", "Offer"];

/** Stages that mean you actually interviewed. */
export const INTERVIEW_STAGES: Stage[] = ["Technical", "Onsite"];

/** Stages that represent a conversation that happened, and so a recap to log. */
export const ROUND_STAGES: Stage[] = ["Screen", "Technical", "Onsite"];

/** Stages that keep a role in your active pipeline. */
export const CLOSED_STAGES: Stage[] = ["Rejected", "Withdrawn"];

/** Product tour. ":id" resolves to the user's deepest prep space at runtime. */
export const TOUR_STEPS: TourStep[] = [
  { path: "/app", sel: "add-role", title: "Add a role", hint: 'Click "+ Add a role"', body: "Everything starts here. Paste a job description or a link to track a new application — PrepFor.Me builds the workspace around it." },
  { path: "/app", sel: "readiness", title: "Your readiness at a glance", body: "Response rate, interviews this week, prep strength. Application volume is never the headline — depth is." },
  { path: "/app", sel: "needs", title: "What needs you next", body: "Recaps to log, interviews to prep, resumes to tailor. Click any item to jump straight into the work." },
  { path: "/app", sel: "dossier", title: "Your deepest company file", hint: "Click to open the dossier", body: "This grows with every source and recap you add. The more you use it, the sharper your prep gets.", requiresApplication: true },
  { path: "/app", sel: "nav-applications", title: "Open the tracker", hint: 'Click "Applications"', body: "See your whole pipeline on a board or a table, and move roles through their stages." },
  { path: "/app/applications", sel: "tracker", title: "Every role is a card", hint: "Click any card to open it", body: "Cards move through Saved → Applied → Screen → Technical → Onsite → Offer. Filter, or switch to a dense table." },
  { path: "/app/applications/:id", tab: "materials", sel: "detail-tabs", title: "Each application is the heart", body: "One role holds its tailored resume, referral drafts, company prep, and interview recaps — all together, right here.", requiresApplication: true },
  { path: "/app/applications/:id", tab: "materials", sel: "advance", title: "Move it forward", hint: 'Click "Advance"', body: 'Advance the stage as you progress. Rejected? It prompts a quick "what did you learn" so it still feeds your prep.', requiresApplication: true },
  { path: "/app/applications/:id", tab: "referrals", sel: "tab-referrals", title: "Get a warm intro first", body: "Referrals drafts a personalized note per person and opens LinkedIn. You review and send — we never send for you.", requiresApplication: true },
  { path: "/app/applications/:id", tab: "prep", sel: "tab-prep", title: "Know the company cold", body: "Company prep is a chat grounded in real sources and your debriefs. Every answer shows where it came from.", requiresApplication: true },
  { path: "/app/applications/:id", tab: "debriefs", sel: "tab-debriefs", title: "Log every interview", hint: 'Open "Recaps"', body: "After a real interview, capture what was asked. It’s the highest-value data here — each recap deepens this company’s prep.", requiresApplication: true },
  { path: "/app/profile", sel: "profile-review", title: "Your profile is the spine", body: "Everything is generated from here. A standing review flags gaps, and every bullet is an editable, reorderable object." },
  { path: "/app/discover", sel: "discover-search", title: "Discover roles", hint: "Describe what you want", body: "Describe the role in plain words. We query public job feeds and rank matches against your profile — then add the good ones to your tracker." },
  { path: "/app/practice", sel: "practice", title: "Practice is coming", body: "The flagship premium engine: grounded mock interviews and rubric-scored feedback. Not built yet — tell us what you'd practice first and it moves up the list." },
  { path: "/app/settings", sel: "privacy", title: "You own your data", body: "Export everything in one click, and clear any company’s corpus. We hold sensitive history so the app can work for you — and the controls are front and center." },
  { path: "/app", sel: "sidebar-help", title: "Always within reach", body: "Reopen this tour, contact our support team, or manage the browser extension — right here, on every screen." },
  { path: "/app", sel: null, title: "You're set", body: "That’s the loop: prepare deeply, apply with intent, log what happens, get sharper. Reopen this tour anytime from the sidebar." },
];

/**
 * Avatar palettes — [background, foreground]. Well-known companies keep their
 * hand-picked colors; anything else gets a stable hue derived from its name, so
 * a company always looks the same without needing a palette entry.
 */
const LOGO_PALETTES: Record<string, [string, string]> = {
  stripe: ["oklch(0.55 0.15 275 / 0.14)", "oklch(0.42 0.14 275)"],
  ramp: ["oklch(0.6 0.15 150 / 0.15)", "oklch(0.42 0.13 150)"],
  notion: ["oklch(0.5 0.01 260 / 0.12)", "oklch(0.3 0.01 260)"],
  figma: ["oklch(0.6 0.17 25 / 0.14)", "oklch(0.5 0.16 25)"],
  linear: ["oklch(0.55 0.13 285 / 0.14)", "oklch(0.42 0.13 285)"],
  vercel: ["oklch(0.3 0.01 260 / 0.1)", "oklch(0.25 0.01 260)"],
  datadog: ["oklch(0.55 0.16 300 / 0.14)", "oklch(0.44 0.15 300)"],
  airbnb: ["oklch(0.62 0.16 15 / 0.14)", "oklch(0.52 0.16 15)"],
  "michael page": ["oklch(0.6 0.16 30 / 0.14)", "oklch(0.5 0.15 30)"],
};

function hue(company: string): number {
  let h = 0;
  for (let i = 0; i < company.length; i++) {
    h = (h * 31 + company.charCodeAt(i)) % 360;
  }
  return h;
}

export function logoPalette(company: string): [string, string] {
  const named = LOGO_PALETTES[company.trim().toLowerCase()];
  if (named) return named;
  const h = hue(company.trim().toLowerCase());
  return [`oklch(0.55 0.15 ${h} / 0.14)`, `oklch(0.42 0.13 ${h})`];
}

/** Stage pill styling — [foreground color, background color]. */
const STAGE_STYLES: Record<string, [string, string]> = {
  Saved: ["oklch(0.5 0.01 260)", "oklch(0.94 0.004 260)"],
  Applied: ["oklch(0.42 0.1 255)", "oklch(0.55 0.15 255 / 0.1)"],
  Screen: ["oklch(0.42 0.11 285)", "oklch(0.55 0.13 285 / 0.12)"],
  Technical: ["oklch(0.42 0.11 300)", "oklch(0.55 0.14 300 / 0.12)"],
  Onsite: ["oklch(0.4 0.11 200)", "oklch(0.55 0.13 200 / 0.12)"],
  Offer: ["oklch(0.38 0.12 150)", "oklch(0.55 0.13 150 / 0.14)"],
  Rejected: ["oklch(0.5 0.13 25)", "oklch(0.6 0.16 25 / 0.1)"],
  Withdrawn: ["oklch(0.5 0.01 260)", "oklch(0.94 0.004 260)"],
};

export function stageStyle(stage: string): [string, string] {
  return STAGE_STYLES[stage] || STAGE_STYLES.Saved;
}

/** Kanban column header colors. */
export const COL_COLORS: Record<string, string> = {
  Saved: "oklch(0.5 0.01 260)",
  Applied: "oklch(0.42 0.1 255)",
  Screen: "oklch(0.42 0.11 285)",
  Technical: "oklch(0.42 0.11 300)",
  Onsite: "oklch(0.4 0.11 200)",
  Offer: "oklch(0.38 0.12 150)",
};

/** The signature accent color, used everywhere. */
export const ACCENT = "oklch(0.55 0.15 255)";

/** Neutral used for "not yet" dots and empty progress segments. */
export const MUTED_DOT = "oklch(0.88 0.006 260)";
