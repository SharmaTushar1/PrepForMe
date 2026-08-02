import { mockAiProvider } from "./mock";
import type { AiProvider } from "./types";

/**
 * The one place the app decides which provider it's talking to. A hosted model
 * arrives as a second implementation behind a Supabase Edge Function — the key
 * stays server-side and nothing above this line changes.
 */
export const ai: AiProvider = mockAiProvider;

export type {
  AiProvider,
  AtsKeyword,
  ParsedResume,
  PrepAnswer,
  ProfileContext,
  ReferralDraft,
  TailoringChange,
  TailoringResult,
} from "./types";
