export type Stage =
  | "Saved"
  | "Applied"
  | "Screen"
  | "Technical"
  | "Onsite"
  | "Offer"
  | "Rejected"
  | "Withdrawn";

export type View =
  | "landing"
  | "onboarding"
  | "home"
  | "applications"
  | "appDetail"
  | "debrief"
  | "profile"
  | "discover"
  | "practice"
  | "settings";

export type Tab = "materials" | "referrals" | "prep" | "debriefs";

export type TrackerView = "board" | "table";

export type ReferralChannel = "invite" | "message";

export interface Application {
  id: string;
  company: string;
  role: string;
  level: string;
  stage: Stage;
  next: string;
  updated: string;
  resume: boolean;
  prep: boolean;
  sources: number;
  debriefs: number;
  /** original design field: seed "height" used for the demo bar visuals */
  h: number;
}

export interface TourStep {
  view?: View;
  appId?: string;
  tab?: Tab;
  sel: string | null;
  title: string;
  hint?: string;
  body: string;
}

export interface Spot {
  centered?: boolean;
  t?: number;
  l?: number;
  w?: number;
  h?: number;
  ttTop?: number;
  ttLeft?: number;
  below?: boolean;
  ttW?: number;
}

export interface AppState {
  view: View;
  demo: number;
  obStep: number;
  selectedAppId: string;
  tab: Tab;
  trackerView: TrackerView;
  tailoring: boolean;
  debriefSaved: boolean;
  extOpen: boolean;
  roundType: string;
  referralChannel: ReferralChannel;
  premium: boolean;
  charLimit: number;
  tourOpen: boolean;
  tourStep: number;
  spot: Spot | null;
  justLeveled: string | null;
  contactOpen: boolean;
  contactSent: boolean;
  apps: Application[];
}
