/**
 * Claim extraction, normalisation, and first-party / news classification.
 *
 * We never persist verbatim page text — only restated atomic claims the model
 * can support from the source. Unsupported claims are dropped.
 */

import {
  ANTHROPIC_VERSION,
  HttpError,
  logUpstreamFailure,
  outputConfig,
  readEnvironment,
  readModelResponse,
  upstreamMessage,
} from "./model.ts";

/**
 * The model both calls here use. Haiku by default: extraction and the relevance
 * check are cheap classification over text that is already in hand, not the
 * layout judgement the resume analyzer needs Sonnet for.
 */
function extractModel(): string {
  return Deno.env.get("ANTHROPIC_EXTRACT_MODEL")?.trim() ||
    "claude-haiku-4-5-20251001";
}

export type ClaimKind = "company_fact" | "interview_process";

export type Provenance =
  | "company_site"
  | "company_blog"
  | "news"
  | "user_supplied_thirdparty"
  | "candidate_report"
  | "general_pattern"
  | "ai_inferred";

export interface ExtractedClaim {
  content: string;
  claimKind: ClaimKind;
  /** Short supporting span from the source; used only to drop unsupported claims. */
  support?: string;
}

export interface ClassifiedClaim extends ExtractedClaim {
  provenance: Provenance;
  /** Whether this row may be inserted with user_id null. */
  shareImmediately: boolean;
}

const LEGAL_SUFFIXES =
  /\b(inc|incorporated|llc|ltd|limited|corp|corporation|co|company|plc|gmbh|ag|sa|nv|bv)\b\.?/gi;

/** Lowercase, trim, strip common legal suffixes for matching. */
export function normaliseCompany(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normaliseRole(role: string): string {
  return role.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Registrable-ish host: strip www. */
export function normaliseDomain(hostOrUrl: string): string | null {
  try {
    const raw = hostOrUrl.includes("://")
      ? hostOrUrl
      : `https://${hostOrUrl}`;
    const host = new URL(raw).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    const cleaned = hostOrUrl.toLowerCase().replace(/^www\./, "").trim();
    return cleaned.includes(".") ? cleaned : null;
  }
}

/** True when url's host equals domain or is a subdomain of it. */
export function isFirstPartyUrl(url: string, companyDomain: string | null): boolean {
  if (!companyDomain) return false;
  const host = normaliseDomain(url);
  const domain = normaliseDomain(companyDomain);
  if (!host || !domain) return false;
  return host === domain || host.endsWith(`.${domain}`);
}

/** Guess domain from a posting URL's host. */
export function guessDomainFromPostingUrl(postingUrl: string | null | undefined): string | null {
  if (!postingUrl) return null;
  return normaliseDomain(postingUrl);
}

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["claims"],
  properties: {
    claims: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["content", "claimKind", "supported"],
        properties: {
          content: { type: "string" },
          claimKind: {
            type: "string",
            enum: ["company_fact", "interview_process"],
          },
          support: { type: "string" },
          supported: { type: "boolean" },
        },
      },
    },
  },
} as const;

const MAX_EXTRACT_TOKENS = 8_000;

/**
 * Extract restated claims from ephemeral source text. Drops unsupported or
 * empty claims. temperature is left at the API default with low effort.
 */
export async function extractClaims(
  sourceText: string,
  context: { company: string; role: string },
): Promise<ExtractedClaim[]> {
  const env = readEnvironment("Claim extraction");
  const truncated = sourceText.slice(0, 80_000);
  const model = extractModel();

  const response = await fetch(`${env.anthropicBase}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_EXTRACT_TOKENS,
      messages: [
        {
          role: "user",
          content: `You extract interview-prep claims from source text about ${context.company} (role context: ${context.role}).

Rules:
- Restate each claim in your own words. Do not quote long passages.
- Only include claims explicitly supported by the text. If unsupported, set supported=false.
- claimKind = company_fact for products, funding, culture, headcount, launches, reorgs.
- claimKind = interview_process for interview loops, rounds, question themes, process.
- For news-style text, prefer company_fact; omit gossip and interview-process hearsay.
- Omit anything you cannot restate without quoting.

Source text:
---
${truncated}
---`,
        },
      ],
      output_config: outputConfig(model, "low", {
        type: "json_schema",
        schema: EXTRACTION_SCHEMA,
      }),
    }),
  });

  if (!response.ok) {
    await logUpstreamFailure("claim extraction", response);
    throw new HttpError(upstreamMessage(response.status), 502);
  }

  const result = await readModelResponse(response, "claim extraction");
  const raw = result.raw as {
    claims?: {
      content?: string;
      claimKind?: string;
      support?: string;
      supported?: boolean;
    }[];
  };

  const out: ExtractedClaim[] = [];
  for (const row of raw.claims ?? []) {
    if (row.supported === false) continue;
    const content = (row.content ?? "").trim();
    if (content.length < 12) continue;
    if (row.claimKind !== "company_fact" && row.claimKind !== "interview_process") {
      continue;
    }
    out.push({
      content,
      claimKind: row.claimKind,
      support: row.support?.trim() || undefined,
    });
  }
  return out;
}

const RELEVANCE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["relevant", "reason"],
  properties: {
    relevant: { type: "boolean" },
    reason: { type: "string" },
  },
} as const;

/** Soft relevance check — warn when the source looks off-topic. */
export async function checkRelevance(input: {
  company: string;
  role: string;
  preview: string;
}): Promise<{ relevant: boolean; reason: string }> {
  const env = readEnvironment("Relevance check");
  const model = extractModel();
  const response = await fetch(`${env.anthropicBase}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Is this source useful for interviewing at ${input.company} for ${input.role}?
Answer relevant=false only when it is clearly about a different company, a different profession with no overlap, or empty spam.

Preview:
---
${input.preview.slice(0, 4_000)}
---`,
        },
      ],
      output_config: outputConfig(model, "low", {
        type: "json_schema",
        schema: RELEVANCE_SCHEMA,
      }),
    }),
  });

  if (!response.ok) {
    // Soft path: if the checker fails, allow through rather than block ingest.
    await logUpstreamFailure("relevance check", response);
    return { relevant: true, reason: "Relevance could not be checked; proceeding." };
  }

  const result = await readModelResponse(response, "relevance check");
  const raw = result.raw as { relevant?: boolean; reason?: string };
  return {
    relevant: raw.relevant !== false,
    reason: (raw.reason ?? "").trim() ||
      (raw.relevant === false
        ? "This may not be about this company or role."
        : "Looks relevant."),
  };
}

/**
 * Assign provenance and whether the claim may be shared immediately.
 *
 * Interview claims are never shareImmediately.
 * Company facts: shared for first-party site/blog or news (about the company).
 */
export function classifyClaim(
  claim: ExtractedClaim,
  opts: {
    inputKind: "url" | "pdf" | "paste";
    sourceUrl: string | null;
    companyDomain: string | null;
    sourceKind: string | null;
    isNewsAboutCompany: boolean;
  },
): ClassifiedClaim {
  if (claim.claimKind === "interview_process") {
    return {
      ...claim,
      provenance: opts.inputKind === "url" &&
          opts.sourceUrl &&
          isFirstPartyUrl(opts.sourceUrl, opts.companyDomain)
        ? (opts.sourceKind === "company_blog" ? "company_blog" : "company_site")
        : "user_supplied_thirdparty",
      shareImmediately: false,
    };
  }

  // company_fact
  if (
    opts.inputKind === "url" &&
    opts.sourceUrl &&
    isFirstPartyUrl(opts.sourceUrl, opts.companyDomain)
  ) {
    const provenance: Provenance =
      opts.sourceKind === "company_blog" ? "company_blog" : "company_site";
    return { ...claim, provenance, shareImmediately: true };
  }

  if (opts.isNewsAboutCompany && claim.claimKind === "company_fact") {
    return { ...claim, provenance: "news", shareImmediately: true };
  }

  return {
    ...claim,
    provenance: "user_supplied_thirdparty",
    shareImmediately: false,
  };
}

/** Strip tags / scripts for a rough text extract from HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}
