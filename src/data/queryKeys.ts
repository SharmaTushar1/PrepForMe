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
  resume: (userId: string, resumeId: string) => ["resume", userId, resumeId] as const,
  resumeReport: (userId: string, resumeId: string) =>
    ["resumeReport", userId, resumeId] as const,
  resumeFile: (userId: string, resumeId: string) => ["resumeFile", userId, resumeId] as const,
  /**
   * Keyed by report, not by resume: suggestions are about one reading of the
   * file, so re-analyzing it leaves them behind rather than mixing them into the
   * new report's list.
   */
  resumeEdits: (userId: string, reportId: string) =>
    ["resumeEdits", userId, reportId] as const,
  /**
   * Per feature, because the allowances have different periods and are spent
   * independently — invalidating an analysis must not refetch the chat counter.
   */
  aiUsage: (userId: string, feature: string) => ["aiUsage", userId, feature] as const,
};
