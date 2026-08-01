import type { Application, Stage, TourStep } from "./types";

/** Pipeline stages, in order — ported from the design. */
export const STAGES: Stage[] = [
  "Saved",
  "Applied",
  "Screen",
  "Technical",
  "Onsite",
  "Offer",
];

/** Seed applications — ported verbatim from the design's initial state. */
export const INITIAL_APPS: Application[] = [
  { id: "stripe", company: "Stripe", role: "Staff Software Engineer", level: "Staff · L6", stage: "Onsite", next: "Log your recap", updated: "1d ago", resume: true, prep: true, sources: 7, debriefs: 3, h: 255 },
  { id: "ramp", company: "Ramp", role: "Senior Software Engineer", level: "Senior · L5", stage: "Technical", next: "Prep screen · Fri", updated: "2h ago", resume: true, prep: true, sources: 5, debriefs: 1, h: 150 },
  { id: "mpage", company: "Michael Page", role: "Bilingual Consulting Recruiter", level: "Mid-level", stage: "Screen", next: "Confirm call · Wed", updated: "4h ago", resume: true, prep: true, sources: 4, debriefs: 1, h: 30 },
  { id: "notion", company: "Notion", role: "Senior Software Engineer", level: "Senior", stage: "Screen", next: "Confirm call · Thu", updated: "5h ago", resume: true, prep: true, sources: 4, debriefs: 0, h: 0 },
  { id: "figma", company: "Figma", role: "Staff Engineer, Platform", level: "Staff", stage: "Applied", next: "Tailor resume", updated: "3d ago", resume: false, prep: false, sources: 2, debriefs: 0, h: 300 },
  { id: "linear", company: "Linear", role: "Product Engineer", level: "Mid · L4", stage: "Applied", next: "Awaiting response", updated: "1w ago", resume: true, prep: false, sources: 1, debriefs: 0, h: 265 },
  { id: "vercel", company: "Vercel", role: "Senior Product Engineer", level: "Senior", stage: "Saved", next: "Tailor & apply", updated: "just now", resume: false, prep: false, sources: 0, debriefs: 0, h: 145 },
  { id: "datadog", company: "Datadog", role: "Senior SWE, Metrics", level: "Senior", stage: "Offer", next: "Review offer · Tue", updated: "2d ago", resume: true, prep: true, sources: 6, debriefs: 2, h: 285 },
  { id: "airbnb", company: "Airbnb", role: "Senior Software Engineer", level: "Senior", stage: "Rejected", next: "What did you learn?", updated: "1w ago", resume: true, prep: true, sources: 3, debriefs: 1, h: 10 },
];

/** Product tour — ported verbatim from the design. */
export const TOUR_STEPS: TourStep[] = [
  { view: "home", sel: "add-role", title: "Add a role", hint: 'Click "+ Add a role"', body: "Everything starts here. Paste a job description or a link to track a new application — Job Copilot builds the workspace around it." },
  { view: "home", sel: "readiness", title: "Your readiness at a glance", body: "Response rate, interviews this week, prep strength. Application volume is never the headline — depth is." },
  { view: "home", sel: "needs", title: "What needs you next", body: "Recaps to log, interviews to prep, resumes to tailor. Click any item to jump straight into the work." },
  { view: "home", sel: "dossier", title: "Your deepest company file", hint: "Click to open the dossier", body: "This grows with every source and recap you add. The more you use it, the sharper your prep gets." },
  { view: "home", sel: "nav-applications", title: "Open the tracker", hint: 'Click "Applications"', body: "See your whole pipeline on a board or a table, and move roles through their stages." },
  { view: "applications", sel: "tracker", title: "Every role is a card", hint: "Click any card to open it", body: "Cards move through Saved → Applied → Screen → Technical → Onsite → Offer. Drag, filter, or switch to a dense table." },
  { view: "appDetail", appId: "stripe", tab: "materials", sel: "detail-tabs", title: "Each application is the heart", body: "One role holds its tailored resume, referral drafts, company prep, and interview recaps — all together, right here." },
  { view: "appDetail", appId: "stripe", tab: "materials", sel: "advance", title: "Move it forward", hint: 'Click "Advance"', body: 'Advance the stage as you progress. Rejected? It prompts a quick "what did you learn" so it still feeds your prep.' },
  { view: "appDetail", appId: "stripe", tab: "referrals", sel: "tab-referrals", title: "Get a warm intro first", body: "Referrals drafts a personalized note per person and opens LinkedIn. You review and send — we never send for you." },
  { view: "appDetail", appId: "stripe", tab: "prep", sel: "tab-prep", title: "Know the company cold", body: "Company prep is a chat grounded in real sources and your debriefs. Every answer shows where it came from." },
  { view: "appDetail", appId: "stripe", tab: "debriefs", sel: "tab-debriefs", title: "Log every interview", hint: 'Open "Recaps"', body: "After a real interview, capture what was asked. It’s the highest-value data here — each recap deepens this company’s prep." },
  { view: "profile", sel: "profile-review", title: "Your profile is the spine", body: "Everything is generated from here. A standing review flags gaps, and every bullet is an editable, reorderable object." },
  { view: "discover", sel: "discover-search", title: "Discover roles", hint: "Describe what you want", body: "Describe the role in plain words. We query public job feeds and rank matches against your profile — then add the good ones to your tracker." },
  { view: "practice", sel: "practice", title: "Practice is coming", body: "The flagship premium engine: grounded mock interviews and rubric-scored feedback. Locked for now — join the waitlist." },
  { view: "settings", sel: "privacy", title: "You own your data", body: "Export everything in one click, and clear any company’s corpus. We hold sensitive history so the app can work for you — and the controls are front and center." },
  { view: "home", sel: "sidebar-help", title: "Always within reach", body: "Reopen this tour, contact our support team, or manage the browser extension — right here, on every screen." },
  { view: "home", sel: null, title: "You're set", body: "That’s the loop: prepare deeply, apply with intent, log what happens, get sharper. Reopen this tour anytime from the sidebar." },
];

/** Per-company avatar palettes — [background, foreground]. Ported verbatim. */
const LOGO_PALETTES: Record<string, [string, string]> = {
  stripe: ["oklch(0.55 0.15 275 / 0.14)", "oklch(0.42 0.14 275)"],
  ramp: ["oklch(0.6 0.15 150 / 0.15)", "oklch(0.42 0.13 150)"],
  notion: ["oklch(0.5 0.01 260 / 0.12)", "oklch(0.3 0.01 260)"],
  figma: ["oklch(0.6 0.17 25 / 0.14)", "oklch(0.5 0.16 25)"],
  linear: ["oklch(0.55 0.13 285 / 0.14)", "oklch(0.42 0.13 285)"],
  vercel: ["oklch(0.3 0.01 260 / 0.1)", "oklch(0.25 0.01 260)"],
  datadog: ["oklch(0.55 0.16 300 / 0.14)", "oklch(0.44 0.15 300)"],
  airbnb: ["oklch(0.62 0.16 15 / 0.14)", "oklch(0.52 0.16 15)"],
  mpage: ["oklch(0.6 0.16 30 / 0.14)", "oklch(0.5 0.15 30)"],
};

export function logo(app: Pick<Application, "id">): [string, string] {
  return LOGO_PALETTES[app.id] || ["oklch(0.55 0.15 255 / 0.14)", "oklch(0.4 0.13 255)"];
}

/** Stage pill styling — [foreground color, background color]. Ported verbatim. */
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

/** Kanban column header colors — ported verbatim. */
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
