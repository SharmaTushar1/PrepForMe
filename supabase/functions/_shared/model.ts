/**
 * Everything both model-calling functions need: the environment they read, the
 * error they refuse with, and the streamed response they parse.
 *
 * Extracted when `improve-resume` joined `analyze-resume`. The reason to share
 * rather than copy is narrow but real: the stream parser encodes what was learnt
 * from a run that spent a full token budget and returned nothing usable — that a
 * truncated structured response is unparseable, that `stop_reason` has to be
 * checked before the JSON is trusted, and that a wall-clock limit kills the
 * isolate rather than the request. Two copies of that would drift, and the drift
 * would be discovered on a billed call.
 */

/** An outcome the user is meant to read, with the status it leaves as. */
export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "HttpError";
  }
}

export const ANTHROPIC_VERSION = "2023-06-01";

const DEFAULT_MODEL = "claude-sonnet-5";
const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com";

/**
 * `high` is the model's default and is aimed at hard reasoning. Neither job here
 * is that: one reviews a PDF against a fixed rubric, the other rewrites
 * sentences under stated constraints. At `high` the thinking both dominated the
 * token budget and pushed a single call past three minutes — long enough for the
 * edge runtime to kill the isolate mid-flight.
 */
const DEFAULT_EFFORT = "medium";
const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

export interface Environment {
  supabaseUrl: string;
  supabaseKey: string;
  anthropicKey: string;
  model: string;
  effort: string;
  /**
   * Where the Messages API lives. Overridable so the streaming path can be
   * exercised against a stub — every failure mode past the first byte is billed
   * for real otherwise — and so a deployment behind an egress proxy has a seam
   * to use. Unset means Anthropic.
   */
  anthropicBase: string;
}

/**
 * The Supabase runtime injects its own keys; the Anthropic key is a secret this
 * project supplies, and it exists only server-side. It must never gain a `VITE_`
 * prefix anywhere, which would inline it into the browser bundle.
 *
 * Verified against the local runtime container on CLI 2.111.0: it injects
 * `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and
 * `SUPABASE_DB_URL`. The publishable and secret keys exist there only as
 * `SUPABASE_INTERNAL_*`, which are the runtime's own bootstrap variables and not
 * meant for function code. `SUPABASE_PUBLISHABLE_KEY` is checked second anyway,
 * because the project has already moved to publishable naming on the client and
 * a hosted runtime may inject it under that name. A secret key is last: any of
 * these works here only because the caller's `Authorization` header, not the
 * key, is what the request is authorized on.
 *
 * `feature` names what is switched off when the model key is missing, so the
 * refusal tells the user which button did nothing rather than that "the server"
 * is misconfigured.
 */
export function readEnvironment(feature: string): Environment {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ??
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ??
    Deno.env.get("SUPABASE_SECRET_KEY") ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
    "";
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const model = Deno.env.get("ANTHROPIC_MODEL")?.trim() || DEFAULT_MODEL;

  // Checked against the known levels rather than passed through: an unknown
  // value is a 400 from the API, which would read to the user as a broken
  // feature rather than as the typo in an environment variable that it is.
  const configuredEffort = Deno.env.get("ANTHROPIC_EFFORT")?.trim()
    .toLowerCase();
  const effort = configuredEffort && EFFORT_LEVELS.includes(configuredEffort)
    ? configuredEffort
    : DEFAULT_EFFORT;
  if (configuredEffort && effort !== configuredEffort) {
    console.error(
      `ignoring ANTHROPIC_EFFORT="${configuredEffort}": not one of ${
        EFFORT_LEVELS.join(", ")
      }`,
    );
  }

  if (supabaseUrl === "" || supabaseKey === "") {
    console.error(
      "missing Supabase environment: SUPABASE_URL and an anon, publishable, secret or service role key are all required",
    );
    throw new HttpError(`${feature} is not configured on this server.`, 500);
  }
  if (anthropicKey === "") {
    console.error("missing ANTHROPIC_API_KEY");
    throw new HttpError(
      `${feature} is not switched on for this environment yet.`,
      500,
    );
  }

  const anthropicBase =
    (Deno.env.get("ANTHROPIC_BASE_URL")?.trim() || DEFAULT_ANTHROPIC_BASE)
      .replace(/\/+$/, "");
  if (anthropicBase !== DEFAULT_ANTHROPIC_BASE) {
    console.error(`using a non-default model endpoint: ${anthropicBase}`);
  }

  return {
    supabaseUrl,
    supabaseKey,
    anthropicKey,
    model,
    effort,
    anthropicBase,
  };
}

/**
 * What an upstream status means, for someone who pressed a button.
 *
 * A request rejected before the model runs is not billed, and saying so is the
 * difference between "try again" and "have I just wasted one of my runs".
 */
export function upstreamMessage(status: number): string {
  if (status === 429) {
    return "The model service is rate limited right now. Wait a minute and try again.";
  }
  if (status === 529 || status === 503) {
    return "The model service is overloaded right now. Please try again shortly.";
  }
  if (status === 401 || status === 403) {
    return "The model service rejected this server's credentials, so nothing ran and nothing was charged.";
  }
  if (status === 400 || status === 422) {
    return "The model service could not process this request. Nothing was charged for it — please report this if it keeps happening.";
  }
  return "The model service returned an error. Please try again.";
}

// ------------------------------------------------------------------ streaming

export interface ModelResult {
  raw: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
}

/** One event of the streamed Anthropic response, in the shapes this file reads. */
interface AnthropicStreamEvent {
  type?: string;
  delta?: { type?: string; text?: string; stop_reason?: string | null };
  message?: { usage?: { input_tokens?: number; output_tokens?: number } };
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export interface StreamHooks {
  /** What this call is, for the messages a failure produces: "analysis". */
  noun: string;
  /** Called once, the first time the model emits a thinking token. */
  onThinking?: () => void;
  /**
   * Called every time more answer text arrives, with everything accumulated so
   * far and the index at which this delta begins. Progress is reported off this
   * rather than off a timer, so the bar moves when work happens and stalls when
   * the work stalls.
   *
   * **Scan from `from`, never from the start.** A long answer arrives as a
   * thousand-plus deltas, and re-examining the whole buffer on each one is
   * quadratic: measured at 150 times the necessary work on an 18 kB answer. That
   * is waste rather than the thing that kills isolates — the CPU ceiling is
   * charged per frame by the runtime itself, which is why an analysis no longer
   * streams at all — but there is no reason to pay it. Scan
   * `json.slice(from - overlap)`, or seed a regex `lastIndex`.
   */
  onText?: (json: string, from: number) => void;
}

/**
 * Turn Anthropic's server-sent events into the JSON object, the token counts, and
 * progress along the way.
 *
 * The events are framed as SSE (`data: {...}` lines) even though what the callers
 * emit downstream is NDJSON — worth not confusing, since both are line-oriented
 * and only one of them is being parsed here.
 */
export async function readModelStream(
  body: ReadableStream<Uint8Array>,
  { noun, onThinking, onText }: StreamHooks,
): Promise<ModelResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let pending = "";
  let json = "";
  let inputTokens: number | null = null;
  let outputTokens: number | null = null;
  let stopReason: string | null = null;
  let sawThinking = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      // The last element is whatever arrived without its newline yet.
      pending = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice("data:".length).trim();
        if (payload === "" || payload === "[DONE]") continue;

        let event: AnthropicStreamEvent;
        try {
          event = JSON.parse(payload) as AnthropicStreamEvent;
        } catch {
          // A frame this side cannot read is not worth abandoning a paid run
          // over; the JSON is reassembled from the deltas that do parse, and a
          // gap in it surfaces as a parse failure at the end with the whole
          // response in hand.
          console.error("unreadable stream frame", payload.slice(0, 200));
          continue;
        }

        if (event.type === "error") {
          console.error("the model stream reported an error", event.error);
          throw new HttpError(
            `The ${noun} stopped partway through. Please try again.`,
            502,
          );
        }

        if (event.type === "message_start") {
          inputTokens = event.message?.usage?.input_tokens ?? inputTokens;
        }

        if (event.type === "message_delta") {
          stopReason = event.delta?.stop_reason ?? stopReason;
          outputTokens = event.usage?.output_tokens ?? outputTokens;
        }

        if (event.type === "content_block_delta") {
          if (event.delta?.type === "thinking_delta" && !sawThinking) {
            sawThinking = true;
            onThinking?.();
          }
          if (event.delta?.type === "text_delta" && event.delta.text) {
            const from = json.length;
            json += event.delta.text;
            onText?.(json, from);
          }
        }
      }
    }
  } finally {
    // Releasing matters on the throwing paths: an abandoned reader holds the
    // connection open inside an isolate that is already on a clock.
    reader.releaseLock();
  }

  return finish(json, { inputTokens, outputTokens }, stopReason, noun);
}

/** One non-streamed Messages response: the whole body, parsed once. */
interface AnthropicMessage {
  content?: { type?: string; text?: string }[];
  stop_reason?: string | null;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/**
 * Read a response that was requested **without** `stream: true`.
 *
 * Streaming buys an honest progress bar, and for a long answer it costs more than
 * it is worth: the edge runtime charges CPU per frame of the upstream body, and a
 * 7,000-token answer arrives in thousands of them. A real analysis was killed on
 * that limit at 84 seconds — after it was billed — while the isolate's own
 * JavaScript accounted for 365 ms of the budget it had supposedly exhausted. One
 * body, one parse, no per-frame toll.
 *
 * The rewrite pass still streams: its answers run to a few hundred frames, which
 * is well inside the ceiling, and there the moving bar is real.
 */
export async function readModelResponse(
  response: Response,
  noun: string,
): Promise<ModelResult> {
  let body: AnthropicMessage;
  try {
    body = await response.json() as AnthropicMessage;
  } catch (error) {
    console.error("the model response was not JSON", error);
    throw new HttpError(
      `The ${noun} came back in a format this app could not read. Please try again.`,
      502,
    );
  }

  const text = (body.content ?? [])
    // Thinking blocks arrive in the same array and are not part of the answer.
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  return finish(
    text,
    {
      inputTokens: body.usage?.input_tokens ?? null,
      outputTokens: body.usage?.output_tokens ?? null,
    },
    body.stop_reason ?? null,
    noun,
  );
}

/** The checks and the parse both readers end on. */
function finish(
  json: string,
  usage: { inputTokens: number | null; outputTokens: number | null },
  stopReason: string | null,
  noun: string,
): ModelResult {
  if (stopReason === "refusal") {
    throw new HttpError(
      `The model declined this ${noun}. If the document contains anything beyond a resume, export just the resume pages and try again.`,
      422,
    );
  }
  if (stopReason === "max_tokens") {
    // Billed and useless: structured output truncated mid-JSON cannot be read.
    // If this starts happening, the caller's output ceiling is too small for the
    // effort level, not the resume too long.
    console.error(
      `hit max_tokens at ${usage.outputTokens ?? "unknown"} output tokens`,
    );
    throw new HttpError(
      `The ${noun} ran past its length limit before it finished. Please try again.`,
      502,
    );
  }

  const text = json.trim();
  if (text === "") {
    throw new HttpError(`The ${noun} came back empty. Please try again.`, 502);
  }

  try {
    return { raw: JSON.parse(text), ...usage };
  } catch (error) {
    console.error("the model returned unparseable JSON", error);
    throw new HttpError(
      `The ${noun} came back in a format this app could not read. Please try again.`,
      502,
    );
  }
}
