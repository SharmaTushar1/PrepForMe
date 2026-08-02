/**
 * Query keys are namespaced by user id so a sign-out followed by a different
 * sign-in can never read the previous account's cache.
 */
export const keys = {
  profile: (userId: string) => ["profile", userId] as const,
  experiences: (userId: string) => ["experiences", userId] as const,
  skills: (userId: string) => ["skills", userId] as const,
  settings: (userId: string) => ["settings", userId] as const,
  applications: (userId: string) => ["applications", userId] as const,
  stageEvents: (userId: string) => ["stageEvents", userId] as const,
  recaps: (userId: string, applicationId: string) =>
    ["recaps", userId, applicationId] as const,
  prepSources: (userId: string, applicationId: string) =>
    ["prepSources", userId, applicationId] as const,
  prepMessages: (userId: string, applicationId: string) =>
    ["prepMessages", userId, applicationId] as const,
};
