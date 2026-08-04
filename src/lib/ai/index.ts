import { edgeAiProvider } from "./edge";
import { mockAiProvider } from "./mock";
import type { AiProvider } from "./types";

/**
 * The one place the app decides which provider it's talking to.
 *
 * Defaults to the mock, and the default is the point: `edge` is the only value
 * that reaches a model and spends money, so it has to be asked for explicitly,
 * per environment. An unset, misspelled, or stale variable therefore costs
 * nothing rather than silently billing a dev machine.
 */
export const ai: AiProvider =
  import.meta.env.VITE_AI_PROVIDER === "edge" ? edgeAiProvider : mockAiProvider;

export { ATS_CATEGORY_IDS, ATS_LAYOUTS } from "./types";

export type {
  AiProvider,
  AnalysisProgress,
  AnalyzeResumeOptions,
  ImproveResumeOptions,
  AtsCategories,
  AtsCategory,
  AtsCategoryId,
  AtsFinding,
  AtsKeyword,
  AtsLayout,
  AtsReport,
  AtsSeverity,
  AtsTopFix,
  ParsedResume,
  ParsedResumeEntry,
  ParsedResumeExperience,
  ParsedResumeLink,
  PrepAnswer,
  ProfileContext,
  ReferralDraft,
  ResumeAnalysis,
  ResumeEdit,
  ResumeEditStatus,
  ResumeImprovement,
  TailoringChange,
  TailoringResult,
} from "./types";
