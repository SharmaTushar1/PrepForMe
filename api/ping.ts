import type { VercelRequest, VercelResponse } from "@vercel/node";

/** Minimal probe — if this 200s and PDF still FUNCTION_INVOCATION_FAILED, the crash is Chromium-side. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true });
}
