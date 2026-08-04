/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Which AI provider `src/lib/ai` selects. Anything but "edge" is the mock. */
  readonly VITE_AI_PROVIDER?: "mock" | "edge";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
