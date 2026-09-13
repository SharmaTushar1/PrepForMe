/**
 * A local Anthropic Messages -> Ollama (OpenAI) adapter, for running the
 * model-calling functions against a local Ollama model instead of Anthropic — free, and
 * offline. Local dev only; never deployed (the `_stub` prefix keeps it off the
 * bundle, same as `anthropic.ts`).
 *
 * The functions speak Anthropic's `/v1/messages` with `output_config.format`
 * (json_schema) and, for the rewrite pass, `stream: true` SSE. Ollama speaks
 * OpenAI `/v1/chat/completions` with `response_format` and OpenAI SSE. This
 * translates between the two so nothing in `supabase/functions/**` changes.
 *
 * Run it on the host, then point the functions at it:
 *
 *   deno run --allow-net --allow-env supabase/functions/_stub/ollama-bridge.ts
 *   supabase functions serve --env-file supabase/.env.ollama
 *
 * The bridge reaches Ollama on the host at OLLAMA_BASE_URL (default
 * http://localhost:11434). The function, inside the CLI container, reaches the
 * bridge at http://host.docker.internal:8788 — see supabase/.env.ollama.
 *
 * Caveats worth knowing:
 * - Structured output is best-effort. Ollama enforces the JSON *schema* via
 *   `format`, but not Anthropic's property-count limits; the functions' own
 *   validators still run, so a malformed answer surfaces as a parse failure
 *   rather than a wrong report.
 * - Anthropic `document` blocks (the resume PDF) are extracted to plain text
 *   here. Ollama has no PDF reader; without this, analysis scores 0 with
 *   "no resume file was received". Layout judgement is lost — text only.
 * - `usage` token counts are passed through when Ollama reports them, else null.
 * - Embeddings still go to OpenAI (OPENAI_API_KEY); this only covers chat.
 */

const PORT = 8788;
const OLLAMA_BASE = (Deno.env.get("OLLAMA_BASE_URL") ?? "http://localhost:11434")
  .replace(/\/+$/, "");
const DEFAULT_OLLAMA_MODEL = "qwen2.5:7b";

/**
 * Prefer the model the functions sent (`ANTHROPIC_MODEL` in .env.ollama) over a
 * stale OLLAMA_MODEL in the shell. A Claude id means the caller forgot to
 * retarget and we fall back to the local default.
 */
function pickModel(req: AnthropicRequest): string {
  const fromReq = req.model?.trim() ?? "";
  if (fromReq !== "" && !fromReq.startsWith("claude")) return fromReq;
  return Deno.env.get("OLLAMA_MODEL")?.trim() || DEFAULT_OLLAMA_MODEL;
}

interface AnthropicRequest {
  model?: string;
  max_tokens?: number;
  system?: string;
  messages?: { role: string; content: unknown }[];
  stream?: boolean;
  output_config?: { format?: { type?: string; schema?: unknown } };
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array | null> {
  for (const format of ["deflate", "deflate-raw"] as const) {
    try {
      const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(
        new DecompressionStream(format),
      );
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // try the other wrapper
    }
  }
  return null;
}

function decodePdfEscapes(raw: string): string {
  return raw
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\([()\\])/g, "$1")
    .replace(/\\(\d{1,3})/g, (_, oct: string) =>
      String.fromCharCode(Number.parseInt(oct, 8))
    );
}

function literalStrings(pdfText: string): string {
  const parts: string[] = [];
  const re = /\((?:\\.|[^\\)])*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(pdfText)) !== null) {
    const inner = match[0].slice(1, -1);
    if (inner.trim() === "") continue;
    parts.push(decodePdfEscapes(inner));
  }
  return parts.join(" ").replace(/[ \t]+\n/g, "\n").replace(/[ ]{2,}/g, " ").trim();
}

/**
 * Best-effort plain text from a resume PDF. Anthropic reads the file as a
 * document block; Ollama cannot, so this is the local substitute.
 */
async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const latin1 = new TextDecoder("latin1").decode(bytes);
  const chunks: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\nendstream/g;
  let match: RegExpExecArray | null;
  while ((match = streamRe.exec(latin1)) !== null) {
    const dictStart = latin1.lastIndexOf("<<", match.index);
    const dict = dictStart >= 0 ? latin1.slice(dictStart, match.index) : "";
    if (!/\/FlateDecode/.test(dict)) continue;
    const raw = Uint8Array.from(match[1], (char) => char.charCodeAt(0));
    const inflated = await inflateZlib(raw);
    if (!inflated) continue;
    const decoded = new TextDecoder("latin1").decode(inflated);
    const text = literalStrings(decoded);
    if (text) chunks.push(text);
  }
  const uncompressed = literalStrings(latin1);
  if (uncompressed.length > 80) chunks.push(uncompressed);
  const joined = chunks.join("\n").trim();
  return joined;
}

function decodeBase64Bytes(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Flatten an Anthropic message `content` (string or content blocks) to text. */
async function contentToText(content: unknown): Promise<string> {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block);
      continue;
    }
    if (!block || typeof block !== "object") continue;
    const rec = block as {
      type?: string;
      text?: unknown;
      source?: { type?: string; media_type?: string; data?: string };
    };
    if (rec.type === "document" && rec.source?.data) {
      const bytes = decodeBase64Bytes(rec.source.data);
      const extracted = await extractPdfText(bytes);
      if (extracted.length > 40) {
        console.error(`extracted ${extracted.length} chars from attached PDF`);
        parts.push(
          "The attached resume, as extracted text (layout is approximate):\n\n" +
            extracted,
        );
      } else {
        console.error(
          `PDF attached but text extraction produced ${extracted.length} chars`,
        );
        parts.push(
          "(A PDF was attached but this local adapter could not extract readable text from it.)",
        );
      }
      continue;
    }
    if ("text" in rec) parts.push(String(rec.text ?? ""));
  }
  return parts.join("\n\n");
}

async function toOpenAiMessages(
  req: AnthropicRequest,
): Promise<{ role: string; content: string }[]> {
  const messages: { role: string; content: string }[] = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  for (const m of req.messages ?? []) {
    messages.push({ role: m.role, content: await contentToText(m.content) });
  }
  return messages;
}

/** Qwen often wraps JSON in think tags or fences; Anthropic never does. */
function unwrapModelText(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = out.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) out = fenced[1].trim();
  return out;
}

/** The OpenAI request body for Ollama, with structured output when asked for. */
async function toOpenAiBody(
  req: AnthropicRequest,
  stream: boolean,
): Promise<Record<string, unknown>> {
  const schema = req.output_config?.format?.schema;
  const body: Record<string, unknown> = {
    model: pickModel(req),
    messages: await toOpenAiMessages(req),
    max_tokens: req.max_tokens ?? 4096,
    stream,
  };
  if (schema !== undefined) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "response", schema, strict: true },
    };
  }
  return body;
}

function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

async function handleNonStream(req: AnthropicRequest): Promise<Response> {
  const upstream = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await toOpenAiBody(req, false)),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    console.error(`ollama non-stream failed ${upstream.status}: ${detail.slice(0, 300)}`);
    // Anthropic-shaped error so the function's upstreamMessage maps it.
    return new Response(
      JSON.stringify({ type: "error", error: { message: detail.slice(0, 300) } }),
      { status: upstream.status, headers: { "content-type": "application/json" } },
    );
  }

  const data = await upstream.json() as {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = unwrapModelText(data.choices?.[0]?.message?.content ?? "");
  const finish = data.choices?.[0]?.finish_reason ?? "stop";

  const anthropic = {
    id: `msg_${crypto.randomUUID()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    stop_reason: finish === "length" ? "max_tokens" : "end_turn",
    usage: {
      input_tokens: data.usage?.prompt_tokens ?? null,
      output_tokens: data.usage?.completion_tokens ?? null,
    },
  };
  return new Response(JSON.stringify(anthropic), {
    headers: { "content-type": "application/json" },
  });
}

async function handleStream(req: AnthropicRequest): Promise<Response> {
  const upstream = await fetch(`${OLLAMA_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(await toOpenAiBody(req, true)),
  });

  if (!upstream.ok || !upstream.body) {
    const detail = upstream.body ? await upstream.text() : "no body";
    console.error(`ollama stream failed ${upstream.status}: ${detail.slice(0, 300)}`);
    return new Response(
      JSON.stringify({ type: "error", error: { message: detail.slice(0, 300) } }),
      { status: upstream.ok ? 502 : upstream.status, headers: { "content-type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Anthropic opens with message_start carrying input usage.
      controller.enqueue(encoder.encode(sseFrame({
        type: "message_start",
        message: { usage: { input_tokens: null, output_tokens: null } },
      })));
      controller.enqueue(encoder.encode(sseFrame({
        type: "content_block_start",
        index: 0,
        content_block: { type: "text", text: "" },
      })));

      const reader = upstream.body!.getReader();
      let pending = "";
      let outputTokens: number | null = null;
      let stopReason = "end_turn";

      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const payload = line.slice("data:".length).trim();
            if (payload === "" || payload === "[DONE]") continue;
            let chunk: {
              choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
              usage?: { completion_tokens?: number };
            };
            try {
              chunk = JSON.parse(payload);
            } catch {
              continue;
            }
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              controller.enqueue(encoder.encode(sseFrame({
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: delta },
              })));
            }
            const finish = chunk.choices?.[0]?.finish_reason;
            if (finish) stopReason = finish === "length" ? "max_tokens" : "end_turn";
            if (chunk.usage?.completion_tokens != null) {
              outputTokens = chunk.usage.completion_tokens;
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      controller.enqueue(encoder.encode(sseFrame({ type: "content_block_stop", index: 0 })));
      controller.enqueue(encoder.encode(sseFrame({
        type: "message_delta",
        delta: { stop_reason: stopReason },
        usage: { output_tokens: outputTokens },
      })));
      controller.enqueue(encoder.encode(sseFrame({ type: "message_stop" })));
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
    },
  });
}

Deno.serve({ port: PORT }, async (request) => {
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/v1/messages") || request.method !== "POST") {
    return new Response("ollama-bridge: POST /v1/messages only", { status: 404 });
  }
  let req: AnthropicRequest;
  try {
    req = await request.json() as AnthropicRequest;
  } catch {
    return new Response(
      JSON.stringify({ type: "error", error: { message: "bad request body" } }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  console.error(
    `-> ${req.stream ? "stream" : "single"} messages, model=${pickModel(req)}, ` +
      `schema=${req.output_config?.format?.schema ? "yes" : "no"}`,
  );
  return req.stream ? await handleStream(req) : await handleNonStream(req);
});

console.error(
  `ollama-bridge listening on :${PORT}, forwarding to ${OLLAMA_BASE} ` +
    `(default ${DEFAULT_OLLAMA_MODEL}; per-request model wins)`,
);
