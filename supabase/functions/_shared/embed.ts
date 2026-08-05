/**
 * OpenAI embeddings for prep_chunks.
 *
 * text-embedding-3-small, 1536 dims — matches the vector column in 0007.
 * Batched: one request for the whole array, vectors returned in input order.
 */

import { HttpError } from "./model.ts";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

const DEFAULT_OPENAI_BASE = "https://api.openai.com";

export function readOpenAiKey(): string {
  const key = Deno.env.get("OPENAI_API_KEY")?.trim() ?? "";
  if (key === "") {
    throw new HttpError(
      "Embeddings are not switched on for this environment yet.",
      500,
    );
  }
  return key;
}

export function openAiBase(): string {
  return (Deno.env.get("OPENAI_BASE_URL")?.trim() || DEFAULT_OPENAI_BASE)
    .replace(/\/+$/, "");
}

/**
 * Embed texts in order. Empty input returns []. Asserts length match so a
 * silent misalignment cannot write every embedding to the wrong row.
 */
export async function embedTexts(
  texts: string[],
  apiKey: string = readOpenAiKey(),
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await fetch(`${openAiBase()}/v1/embeddings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const status = response.status;
    console.error("openai embeddings failed", status, await response.text());
    if (status === 429) {
      throw new HttpError(
        "The embedding service is rate limited right now. Wait a minute and try again.",
        502,
      );
    }
    if (status === 401 || status === 403) {
      throw new HttpError(
        "The embedding service rejected this server's credentials.",
        502,
      );
    }
    throw new HttpError("The embedding service returned an error.", 502);
  }

  const body = await response.json() as {
    data?: { embedding?: number[]; index?: number }[];
  };
  const data = body.data ?? [];
  if (data.length !== texts.length) {
    console.error(
      `embedding count mismatch: asked ${texts.length}, got ${data.length}`,
    );
    throw new HttpError(
      "The embedding service returned an unexpected response.",
      502,
    );
  }

  // OpenAI may return out of order; sort by index.
  const sorted = [...data].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return sorted.map((row) => {
    const embedding = row.embedding;
    if (!embedding || embedding.length !== EMBEDDING_DIMS) {
      throw new HttpError(
        "The embedding service returned a vector of the wrong size.",
        502,
      );
    }
    return embedding;
  });
}
