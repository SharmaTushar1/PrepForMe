/** Every route in the app, in one place. */
export const ROUTES = {
  landing: "/",
  login: "/login",
  onboarding: "/onboarding",
  home: "/app",
  applications: "/app/applications",
  application: (id: string) => `/app/applications/${id}`,
  applicationTab: (id: string, tab: string) => `/app/applications/${id}?tab=${tab}`,
  newRecap: (id: string) => `/app/applications/${id}/recap/new`,
  profile: "/app/profile",
  discover: "/app/discover",
  practice: "/app/practice",
  settings: "/app/settings",
} as const;
