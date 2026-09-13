/** Same palette the web app already uses for its extension mockup (`src/components/ExtensionPopup.tsx`), so the real thing looks like it belongs to the same product. */
export const colors = {
  primary: "oklch(0.55 0.15 255)",
  primaryText: "#ffffff",
  success: "oklch(0.55 0.13 145)",
  successText: "oklch(0.32 0.1 150)",
  successBg: "oklch(0.96 0.03 145)",
  warning: "oklch(0.6 0.15 60)",
  warningText: "oklch(0.42 0.12 45)",
  warningBg: "oklch(0.96 0.04 80)",
  danger: "oklch(0.55 0.18 25)",
  dangerText: "oklch(0.4 0.15 25)",
  dangerBg: "oklch(0.96 0.03 25)",
  text: "oklch(0.2 0.01 260)",
  textMuted: "oklch(0.5 0.015 260)",
  border: "oklch(0.9 0.006 260)",
  bg: "#ffffff",
  bgMuted: "oklch(0.98 0.003 260)",
} as const;

export const font =
  "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
