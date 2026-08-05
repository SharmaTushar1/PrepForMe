import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.109.0";
import {
  corsHeaders,
  errorResponse,
  preflightResponse,
} from "../_shared/cors.ts";
import {
  encodeBase64,
  estimatePageCount,
  looksLikePdf,
} from "../_shared/pdf.ts";
import {
  ANTHROPIC_VERSION,
  HttpError,
  outputConfig,
  readEnvironment,
  readModelResponse,
  upstreamMessage,
  type Environment,
  type ModelResult,
} from "../_shared/model.ts";
import { assertUnderAllowance, spendAllowance } from "../_shared/quota.ts";
import { buildAnalysisPrompt } from "../_shared/prompt.ts";
import { analysisSchema, type ResumeAnalysis } from "../_shared/schema.ts";
import { AnalysisFormatError, normalizeAnalysis } from "../_shared/validate.ts";

/**
 * One upload, one streamed Claude call, both halves of the answer.
 *
 * The PDF is read out of storage under the caller's own JWT, so the storage
 * policies in `0004_resumes.sql` remain the thing that decides who can read
 * what — this function adds no authorization of its own beyond the guards
 * below, which exist to bound spend rather than to control access.
 *
 * The response has two shapes, and the boundary between them is the first byte
 * written:
 *
 * - **Before the model call** — everything that can refuse for free does so as a
 *   non-2xx `{ error }` through `errorResponse`.
 * - **From the model call onwards** — a 200 streaming NDJSON `StreamEvent`s. A
 *   status cannot be revised once it has been sent, so a failure after this
 *   point arrives as an `error` event on that 200, and only a `done` event means
 *   an analysis exists. `src/lib/ai/edge.ts` is the other half of this.
 */

// ------------------------------------------------------------------- guards

// The per-user allowance lives in `_shared/plans.ts` and is counted over the
// `ai_usage` ledger by `_shared/quota.ts`. It used to be a constant here, ten a
// day, counted over `resume_reports` — see the note on `spendAllowance` for why
// counting saved reports stopped being adequate once the free tier became one a
// month.

/** Page ceiling. A resume this long is a different document. */
const MAX_PAGES = 15;

/**
 * How long a run may hold the row before another is allowed to start.
 *
 * This is what stops a double-click billing twice, and it is time-boxed rather
 * than absolute so a run that dies without writing an outcome — a crash, a
 * cold-start timeout, a redeploy mid-call — expires instead of wedging the
 * resume forever. Comfortably longer than a full analysis, which is seconds.
 */
const ANALYSIS_LOCK_MS = 3 * 60 * 1000;

/** Matches the bucket's own `file_size_limit`, so both refuse the same files. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Room for the thinking *and* the answer, which is one budget and not two.
 *
 * Sonnet 5 runs adaptive thinking by default, thinking tokens are generated into
 * the same stream, and `max_tokens` caps the total. This was 8000 — sized for
 * the report alone — and the first real call spent most of it thinking, then
 * truncated the report and came back `stop_reason: "max_tokens"`. A truncated
 * structured response is unparseable, so that run was billed in full and
 * produced nothing. The report itself is a few thousand tokens; the rest of this
 * is headroom, and headroom is only billed if it is used.
 */
const MAX_OUTPUT_TOKENS = 20000;

// -------------------------------------------------------------------- types

interface ResumeRow {
  id: string;
  storage_path: string;
  byte_size: number;
  status: string;
  /** Bumped by the `resumes_set_updated_at` trigger, so it dates the lock. */
  updated_at: string;
}

/**
 * What the browser reads, one JSON object per line.
 *
 * `done` is the only success. An `error` can arrive on a 200 because the status
 * line is committed the moment the first byte leaves, so anything that fails
 * after that point has nowhere else to be reported — `src/lib/ai/edge.ts` keeps
 * both halves of that contract.
 */
type StreamEvent =
  | { type: "progress"; step: number; total: number; label: string }
  | { type: "waiting"; elapsedMs: number; expectedMs: number }
  | { type: "done"; analysis: ResumeAnalysis }
  | { type: "error"; message: string };

/**
 * The steps this function actually knows it has taken.
 *
 * There were twelve of these once, driven off the model's own output as it
 * streamed — a genuinely honest bar, and unaffordable: see `readModelResponse`
 * for the CPU ceiling that killed a paid run. What is left is the work this side
 * controls, and the model call is one step of it rather than nine.
 *
 * The wait between steps 2 and 3 is not dressed up as progress. A timer
 * pretending to be a bar would be worse than admitting the truth: it would say
 * "80%" with equal confidence whether the run was nearly done or already dead.
 * `waiting` events carry elapsed and expected time instead, and the UI shows
 * exactly that.
 */
const STEP_READING = 1;
const STEP_SENT = 2;
const STEP_CHECKING = 3;
const STEP_SAVING = 4;
const TOTAL_STEPS = STEP_SAVING;

/**
 * How often to say "still going", and how long this usually takes.
 *
 * Two purposes, and the second is not cosmetic: nothing between here and the
 * browser may conclude an idle response is a dead one, and a 90-second silence on
 * an open stream invites exactly that. Six seconds of heartbeat is 15 frames on a
 * long run, against the thousands that made streaming the model unaffordable.
 */
const HEARTBEAT_MS = 6_000;
const EXPECTED_MS = 75_000;

// ------------------------------------------------------------------ handler

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") {
    return errorResponse("This endpoint only accepts POST requests.", 405);
  }

  try {
    return await analyze(req);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status);
    }
    console.error("analyze-resume failed unexpectedly", error);
    return errorResponse(
      "The analysis failed unexpectedly. Please try again.",
      500,
    );
  }
});

async function analyze(req: Request): Promise<Response> {
  const { resumeId, force } = await readBody(req);
  const env = readEnvironment("Resume analysis");

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (token === "") {
    throw new HttpError("You need to be signed in to analyze a resume.", 401);
  }

  // Constructed with the publishable key but carrying the caller's token: it is
  // the token PostgREST and Storage authorize on, so every read and write below
  // runs as the user and under their policies.
  const client = createClient(env.supabaseUrl, env.supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Passed explicitly rather than relying on the header: with no stored session
  // the argument-less form depends on the client having noticed the custom
  // header, and this is the one place where being wrong means every caller is
  // anonymous. An unauthenticated invoke arrives here holding the publishable
  // key as its bearer, which fails this the same way an expired token does.
  const { data: auth, error: authError } = await client.auth.getUser(token);
  const user = auth?.user;
  if (authError || !user) {
    throw new HttpError(
      "Your session has expired. Sign in again and retry the analysis.",
      401,
    );
  }

  const resume = await loadResume(client, resumeId);

  // Everything that can refuse, refuses here — before a single token is spent.
  // The two policy guards deliberately leave the row untouched: nothing is
  // wrong with the file, and the user may analyze it tomorrow.
  await assertNotAlreadyAnalyzed(client, resume.id, force);
  assertNotAlreadyRunning(resume);
  await assertUnderAllowance(client, user.id, "resume_analysis");

  let bytes: Uint8Array;
  let pageCount: number | null;
  try {
    bytes = await loadPdf(client, resume);
    pageCount = assertPageCount(bytes);
  } catch (error) {
    // A file this function will never accept is recorded on the row, so the
    // upload card keeps explaining itself instead of relying on a toast the
    // user may already have dismissed. A later successful run clears it.
    await markFailed(client, resume.id, error);
    throw error;
  }

  await setStatus(client, resume.id, "analyzing", pageCount);

  // The allowance is spent here, at the last point where refusing is still free
  // and still expressible: everything above can decline without a model call,
  // and everything below is inside a 200 whose status can no longer be changed.
  //
  // After `setStatus` rather than before, because the two failure modes are not
  // equally bad. Spending first and failing to lock would take a monthly
  // allowance for a run that never happened; locking first and failing to spend
  // costs the user a three-minute wait and nothing else.
  await spendAllowance(client, user.id, "resume_analysis", resume.id);

  return streamAnalysis({ client, env, userId: user.id, resume, bytes, pageCount });
}

// ------------------------------------------------------------------ streaming

/**
 * Everything from the model call onwards, reported line by line as it happens.
 *
 * The response to the browser streams even though the model call no longer does,
 * and that half was never the optional part. The first real call spent 201
 * seconds inside one `await fetch` and the edge runtime terminated the isolate for
 * exceeding its wall clock — from the browser, an analysis that had been paid for
 * simply vanished. An open response with a heartbeat on it cannot vanish
 * silently: every failure past the first byte has a line to arrive on.
 */
function streamAnalysis({
  client,
  env,
  userId,
  resume,
  bytes,
  pageCount,
}: {
  client: SupabaseClient;
  env: Environment;
  userId: string;
  resume: ResumeRow;
  bytes: Uint8Array;
  pageCount: number | null;
}): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let highestStep = 0;
      const send = (event: StreamEvent): void => {
        // Monotonic by construction: a bar that goes backwards reads as a bug
        // even when the underlying numbers are honest.
        if (event.type === "progress") {
          if (event.step <= highestStep) return;
          highestStep = event.step;
        }
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      try {
        send({
          type: "progress",
          step: STEP_READING,
          total: TOTAL_STEPS,
          label: "Reading the document",
        });

        const result = await requestAnalysis(env, bytes, send);

        send({
          type: "progress",
          step: STEP_CHECKING,
          total: TOTAL_STEPS,
          label: "Checking the report over",
        });

        // Throws `AnalysisFormatError`, which the catch below records and
        // reports: past this point the tokens are spent either way, so the
        // failure is worth stating precisely rather than generically.
        const { report, parsed } = normalizeAnalysis(result.raw);

        send({
          type: "progress",
          step: STEP_SAVING,
          total: TOTAL_STEPS,
          label: "Saving the report",
        });

        // The id comes back because a rewrite pass is stored against this exact
        // report: suggestions about one reading of the resume must not survive
        // being replaced by another.
        const { data: saved, error: insertError } = await client
          .from("resume_reports")
          .insert({
            user_id: userId,
            resume_id: resume.id,
            model: env.model,
            overall_score: report.overallScore,
            summary: report.summary || null,
            report,
            parsed,
            input_tokens: result.inputTokens,
            output_tokens: result.outputTokens,
          })
          .select("id")
          .single();

        if (insertError || !saved) {
          console.error("could not save the report", insertError);
          throw new HttpError(
            "The analysis finished but could not be saved. Please try again.",
            500,
          );
        }

        await setStatus(client, resume.id, "analyzed", pageCount);

        // Best effort on purpose. The report is already saved and already paid
        // for, so a profile that fails to point at it is worth a log line, not
        // an error telling the user an analysis they can see failed.
        const { error: profileError } = await client
          .from("profiles")
          .update({ base_resume_id: resume.id })
          .eq("id", userId);
        if (profileError) {
          console.error("could not set profiles.base_resume_id", profileError);
        }

        send({
          type: "done",
          analysis: {
            report,
            parsed,
            reportId: saved.id as string,
            model: env.model,
            sample: false,
          } satisfies ResumeAnalysis,
        });
      } catch (error) {
        await markFailed(client, resume.id, error);
        send({
          type: "error",
          message: error instanceof HttpError
            ? error.message
            : error instanceof AnalysisFormatError
            ? error.message
            : "The analysis failed unexpectedly. Please try again.",
        });
        if (!(error instanceof HttpError) && !(error instanceof AnalysisFormatError)) {
          console.error("analyze-resume failed mid-stream", error);
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      ...corsHeaders,
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
      // Nothing between here and the browser may buffer this into one blob.
      "x-content-type-options": "nosniff",
    },
  });
}

// ------------------------------------------------------------ request setup

async function readBody(
  req: Request,
): Promise<{ resumeId: string; force: boolean }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError("That request could not be read.", 400);
  }

  const record = (typeof body === "object" && body !== null ? body : {}) as
    Record<string, unknown>;
  const resumeId = typeof record.resumeId === "string"
    ? record.resumeId.trim()
    : "";
  if (resumeId === "") {
    throw new HttpError("No resume was named in the request.", 400);
  }
  return { resumeId, force: record.force === true };
}

// ------------------------------------------------------------------- guards

async function loadResume(
  client: SupabaseClient,
  resumeId: string,
): Promise<ResumeRow> {
  const { data, error } = await client
    .from("resumes")
    .select("id, storage_path, byte_size, status, updated_at")
    .eq("id", resumeId)
    .maybeSingle();

  if (error) {
    console.error("could not load the resume row", error);
    throw new HttpError("Could not open that resume. Please try again.", 500);
  }
  // Someone else's row is invisible under RLS rather than forbidden, so this is
  // genuinely "not found" and says nothing about whether it exists.
  if (!data) throw new HttpError("That resume could not be found.", 404);

  return data as ResumeRow;
}

async function assertNotAlreadyAnalyzed(
  client: SupabaseClient,
  resumeId: string,
  force: boolean,
): Promise<void> {
  if (force) return;

  const { data, error } = await client
    .from("resume_reports")
    .select("id")
    .eq("resume_id", resumeId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("could not check for an existing report", error);
    throw new HttpError("Could not open that resume. Please try again.", 500);
  }
  if (data) {
    throw new HttpError(
      "This resume has already been analyzed. Open the existing report, or choose to re-analyze if you have changed the file.",
      409,
    );
  }
}

/**
 * Refuse a second run while one is genuinely in flight.
 *
 * `analyzing` is written by this function alone, immediately before the model
 * call, which is what makes the status trustworthy as a lock — if the client
 * set it too, the very request that set it would then refuse itself. An
 * `analyzing` row older than the window is a run that died without recording
 * an outcome, so it is let through rather than treated as live.
 */
function assertNotAlreadyRunning(resume: ResumeRow): void {
  if (resume.status !== "analyzing") return;

  const startedAt = Date.parse(resume.updated_at);
  const heldFor = Number.isNaN(startedAt) ? Infinity : Date.now() - startedAt;
  if (heldFor >= ANALYSIS_LOCK_MS) return;

  throw new HttpError(
    "This resume is already being analyzed. Give it a moment — the report appears here on its own when it lands.",
    409,
  );
}

async function loadPdf(
  client: SupabaseClient,
  resume: ResumeRow,
): Promise<Uint8Array> {
  // The recorded size refuses an oversized file without transferring it; the
  // real bytes are checked again below, since this column is written by the
  // client.
  if (resume.byte_size > MAX_FILE_BYTES) throw tooLarge();

  const { data, error } = await client.storage
    .from("resumes")
    .download(resume.storage_path);

  if (error || !data) {
    console.error("could not download the resume", error);
    throw new HttpError(
      "The uploaded file could not be read. Try uploading it again.",
      502,
    );
  }

  const bytes = new Uint8Array(await data.arrayBuffer());

  if (bytes.byteLength === 0) {
    throw new HttpError("That file is empty. Upload the resume again.", 422);
  }
  if (bytes.byteLength > MAX_FILE_BYTES) throw tooLarge();
  if (!looksLikePdf(bytes)) {
    throw new HttpError(
      "That file is not a PDF. Export your resume as a PDF and upload it again.",
      415,
    );
  }

  return bytes;
}

/**
 * Returns the estimate to be stored on the row, which is null when the file
 * does not reveal its page count cheaply. Only a confident overage refuses.
 */
function assertPageCount(bytes: Uint8Array): number | null {
  const pageCount = estimatePageCount(bytes);
  if (pageCount !== null && pageCount > MAX_PAGES) {
    throw new HttpError(
      `That document is around ${pageCount} pages. Resume analysis is limited to ${MAX_PAGES} — upload just the resume itself.`,
      413,
    );
  }
  return pageCount;
}

function tooLarge(): HttpError {
  return new HttpError(
    `That file is larger than ${
      MAX_FILE_BYTES / (1024 * 1024)
    } MB. Export a smaller PDF and upload it again.`,
    413,
  );
}

// -------------------------------------------------------------- model call

/**
 * One request, one response, with "still going" on the wire while it is in flight.
 *
 * The heartbeat is cleared in a `finally` because an interval that outlives the
 * response keeps writing to a controller that is about to close, and the error
 * that produces is reported instead of the real one.
 */
async function requestAnalysis(
  env: Environment,
  bytes: Uint8Array,
  send: (event: StreamEvent) => void,
): Promise<ModelResult> {
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    send({
      type: "waiting",
      elapsedMs: Date.now() - startedAt,
      expectedMs: EXPECTED_MS,
    });
  }, HEARTBEAT_MS);

  try {
    return await callModel(env, bytes, send);
  } finally {
    clearInterval(heartbeat);
  }
}

async function callModel(
  env: Environment,
  bytes: Uint8Array,
  send: (event: StreamEvent) => void,
): Promise<ModelResult> {
  send({
    type: "progress",
    step: STEP_SENT,
    total: TOTAL_STEPS,
    label: "Reading your resume",
  });

  const response = await fetch(`${env.anthropicBase}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: env.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: [
        {
          role: "user",
          content: [
            // The document leads: the instructions read better to the model
            // once it already has the file.
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: encodeBase64(bytes),
              },
            },
            { type: "text", text: buildAnalysisPrompt() },
          ],
        },
      ],
      // `effort` and `format` are both `output_config`. Generally available — no
      // `anthropic-beta` header, and no `output_format`, which is the older beta
      // spelling of the format half. `effort` is dropped for models that refuse
      // it (Haiku), which is why this is assembled rather than written inline.
      output_config: outputConfig(env.model, env.effort, {
        type: "json_schema",
        schema: analysisSchema,
      }),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(
      "the model API rejected the request",
      response.status,
      detail.slice(0, 2000),
    );
    throw new HttpError(upstreamMessage(response.status), 502);
  }

  return await readModelResponse(response, "analysis");
}

// -------------------------------------------------------------- row writes

async function setStatus(
  client: SupabaseClient,
  resumeId: string,
  status: "analyzing" | "analyzed",
  pageCount: number | null,
): Promise<void> {
  const { error } = await client
    .from("resumes")
    .update({
      status,
      error: null,
      // Omitted rather than written as null when the file did not reveal its
      // page count, so a re-analysis of a file that did cannot erase it.
      ...(pageCount === null ? {} : { page_count: pageCount }),
    })
    .eq("id", resumeId);
  if (error) console.error(`could not set status ${status}`, error);
}

/**
 * The message written here is the one the upload card shows, so it is the
 * user-facing text of whatever went wrong — never a stack trace.
 */
async function markFailed(
  client: SupabaseClient,
  resumeId: string,
  cause: unknown,
): Promise<void> {
  const message = cause instanceof HttpError || cause instanceof AnalysisFormatError
    ? cause.message
    : "The analysis failed unexpectedly. Please try again.";

  const { error } = await client
    .from("resumes")
    .update({ status: "failed", error: message })
    .eq("id", resumeId);
  if (error) console.error("could not record the failure", error);
}
