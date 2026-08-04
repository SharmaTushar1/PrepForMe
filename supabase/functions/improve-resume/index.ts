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
  ANTHROPIC_VERSION,
  HttpError,
  readEnvironment,
  readModelStream,
  upstreamMessage,
  type Environment,
  type ModelResult,
} from "../_shared/model.ts";
import { buildImprovePrompt } from "../_shared/prompt.ts";
import {
  improvementSchema,
  rewritableLines,
  type AtsReport,
  type ParsedResume,
  type ResumeEditDraft,
  type RewritableLine,
} from "../_shared/schema.ts";
import { ImprovementFormatError, normalizeEdits } from "../_shared/validate.ts";

/**
 * One rewrite pass over a report that already exists.
 *
 * Deliberately not part of `analyze-resume`. Three reasons, in order of how much
 * they matter:
 *
 * 1. **It is a second, separately consented purchase.** Rewrites are worth
 *    paying for only once someone has read their report and decided the writing
 *    is what they want to work on. Bundling them into the analysis would bill
 *    everyone for suggestions most people would never open.
 * 2. **It needs no PDF.** The parse recorded the lines verbatim, and rewriting a
 *    sentence is a text job, so the input is a few thousand tokens instead of a
 *    whole document — which is most of why this costs a fraction of an analysis.
 * 3. **It can be re-run alone.** A better set of rewrites should not require
 *    paying to re-read the file.
 *
 * The response contract is identical to `analyze-resume`: everything that can
 * refuse for free does so as a non-2xx `{ error }`; from the model call onwards
 * it is a 200 streaming NDJSON, where only a `done` event means suggestions
 * exist. `src/lib/ai/edge.ts` is the other half.
 */

// ------------------------------------------------------------------- guards

/**
 * Per user, per UTC day. Lower than the analysis cap because a pass is cheap and
 * because there is no honest reason to want ten sets of rewrites for the same
 * report in one day — that is a stuck client, not a person iterating.
 */
const MAX_PASSES_PER_DAY = 10;

/**
 * How long a `running` pass row is believed before another may start.
 *
 * Matches `ANALYSIS_LOCK_MS` in `analyze-resume` and `IMPROVING_STALE_MS` in
 * `src/data/resumeEdits.ts`. Time-boxed rather than absolute so a run that dies
 * without writing an outcome — a crash, a redeploy mid-call — expires instead of
 * wedging the report forever.
 */
const PASS_LOCK_MS = 3 * 60 * 1000;

/**
 * Well above what fifteen short rewrites need, because the ceiling is shared
 * with the thinking: Sonnet 5 thinks into the same stream and `max_tokens` caps
 * the total. Headroom costs nothing unless it is used, and the failure it
 * prevents — a structured response truncated mid-JSON — is billed in full and
 * unparseable.
 */
const MAX_OUTPUT_TOKENS = 12000;

// -------------------------------------------------------------------- types

interface ReportRow {
  id: string;
  resume_id: string;
  report: AtsReport;
  parsed: ParsedResume;
}

interface PassRow {
  id: string;
  status: string;
  created_at: string;
}

/**
 * What the browser reads, one JSON object per line. `done` is the only success;
 * an `error` can arrive on a 200 because the status line is committed the moment
 * the first byte leaves.
 */
type StreamEvent =
  | { type: "progress"; step: number; total: number; label: string }
  | { type: "done"; edits: StoredEdit[]; model: string }
  | { type: "error"; message: string };

/** A saved suggestion, with the row id the accept button needs. */
interface StoredEdit extends ResumeEditDraft {
  id: string;
  status: "suggested";
}

const STEP_READING = 1;
const STEP_THINKING = 2;
const STEP_WRITING_FROM = 3;

// ------------------------------------------------------------------ handler

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflightResponse();
  if (req.method !== "POST") {
    return errorResponse("This endpoint only accepts POST requests.", 405);
  }

  try {
    return await improve(req);
  } catch (error) {
    if (error instanceof HttpError) {
      return errorResponse(error.message, error.status);
    }
    console.error("improve-resume failed unexpectedly", error);
    return errorResponse(
      "The rewrites failed unexpectedly. Please try again.",
      500,
    );
  }
});

async function improve(req: Request): Promise<Response> {
  const { resumeId, force } = await readBody(req);
  const env = readEnvironment("Resume rewriting");

  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (token === "") {
    throw new HttpError("You need to be signed in to rewrite a resume.", 401);
  }

  // Constructed with the publishable key but carrying the caller's token: it is
  // the token PostgREST authorizes on, so every read and write below runs as the
  // user and under their own policies.
  const client = createClient(env.supabaseUrl, env.supabaseKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await client.auth.getUser(token);
  const user = auth?.user;
  if (authError || !user) {
    throw new HttpError(
      "Your session has expired. Sign in again and retry.",
      401,
    );
  }

  const report = await loadReport(client, resumeId);

  // A resume with nothing to rewrite is refused here rather than sent to a model
  // that would correctly return an empty array and charge for it.
  const lines = rewritableLines(report.parsed);
  if (lines.length === 0) {
    throw new HttpError(
      "There is no writing in this resume to rewrite — the parse found no summary, bullets or supporting lines. The report's parse section says what got in the way.",
      422,
    );
  }

  await assertNotAlreadyImproved(client, report.id, force);
  await assertNotAlreadyRunning(client, report.id);
  await assertUnderDailyCap(client, user.id);

  // Inserted before the model call, because this row *is* the lock. A second
  // press between here and the response finds it and is refused.
  const pass = await openPass(client, {
    userId: user.id,
    resumeId: report.resume_id,
    reportId: report.id,
    model: env.model,
  });

  return streamImprovement({ client, env, userId: user.id, report, lines, passId: pass });
}

// ---------------------------------------------------------------- streaming

function streamImprovement({
  client,
  env,
  userId,
  report,
  lines,
  passId,
}: {
  client: SupabaseClient;
  env: Environment;
  userId: string;
  report: ReportRow;
  lines: RewritableLine[];
  passId: string;
}): Response {
  const encoder = new TextEncoder();

  // One step per line the model was asked about, plus the two that precede the
  // first byte of the answer. The total is knowable in advance here — unlike the
  // analysis, where the sections are fixed — because it is the size of the
  // question, so the bar is measuring the actual work rather than guessing.
  const total = STEP_WRITING_FROM + lines.length;

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let highestStep = 0;
      const send = (event: StreamEvent): void => {
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
          total,
          label: "Reading your report",
        });

        const result = await requestImprovement(env, report.report, lines, total, send);
        const drafts = normalizeEdits(result.raw, {
          report: report.report,
          lines,
        });

        send({
          type: "progress",
          step: total,
          total,
          label: "Saving the rewrites",
        });

        const edits = await saveEdits(client, {
          userId,
          resumeId: report.resume_id,
          reportId: report.id,
          passId,
          drafts,
        });

        await closePass(client, passId, "done", result);
        send({ type: "done", edits, model: env.model });
      } catch (error) {
        const message = error instanceof HttpError ||
            error instanceof ImprovementFormatError
          ? error.message
          : "The rewrites failed unexpectedly. Please try again.";
        // Recorded on the pass row so the lock is released immediately rather
        // than in three minutes: the run is over, and the user should be able to
        // press the button again as soon as they have read why.
        await closePass(client, passId, "failed", null, message);
        send({ type: "error", message });
        if (
          !(error instanceof HttpError) &&
          !(error instanceof ImprovementFormatError)
        ) {
          console.error("improve-resume failed mid-stream", error);
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

  const record = (typeof body === "object" && body !== null ? body : {}) as Record<
    string,
    unknown
  >;
  const resumeId = typeof record.resumeId === "string"
    ? record.resumeId.trim()
    : "";
  if (resumeId === "") {
    throw new HttpError("No resume was named in the request.", 400);
  }
  return { resumeId, force: record.force === true };
}

// ------------------------------------------------------------------- guards

/**
 * The newest report for this resume, which is the only one worth rewriting.
 *
 * Resolved server-side from the resume id rather than taken from the client, so
 * a stale tab cannot ask for rewrites of a report that has since been replaced.
 */
async function loadReport(
  client: SupabaseClient,
  resumeId: string,
): Promise<ReportRow> {
  const { data, error } = await client
    .from("resume_reports")
    .select("id, resume_id, report, parsed")
    .eq("resume_id", resumeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("could not load the report", error);
    throw new HttpError("Could not open that report. Please try again.", 500);
  }
  if (!data) {
    throw new HttpError(
      "This resume hasn't been analyzed yet, so there are no findings to rewrite against. Run the analysis first.",
      409,
    );
  }
  return data as ReportRow;
}

async function assertNotAlreadyImproved(
  client: SupabaseClient,
  reportId: string,
  force: boolean,
): Promise<void> {
  if (force) return;

  const { data, error } = await client
    .from("resume_improvements")
    .select("id")
    .eq("report_id", reportId)
    .eq("status", "done")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("could not check for an existing pass", error);
    throw new HttpError("Could not start the rewrites. Please try again.", 500);
  }
  if (data) {
    throw new HttpError(
      "This report already has rewrites. They're on the report screen — or ask for a fresh set, which costs another model call.",
      409,
    );
  }
}

/**
 * Refuse a second pass while one is genuinely in flight.
 *
 * The `running` row is written by this function immediately before the model
 * call, which is what makes it trustworthy as a lock. A `running` row older than
 * the window is a run that died without recording an outcome, so it is let
 * through rather than treated as live.
 */
async function assertNotAlreadyRunning(
  client: SupabaseClient,
  reportId: string,
): Promise<void> {
  const { data, error } = await client
    .from("resume_improvements")
    .select("id, status, created_at")
    .eq("report_id", reportId)
    .eq("status", "running")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("could not check for a running pass", error);
    throw new HttpError("Could not start the rewrites. Please try again.", 500);
  }
  if (!data) return;

  const startedAt = Date.parse((data as PassRow).created_at);
  const heldFor = Number.isNaN(startedAt) ? Infinity : Date.now() - startedAt;
  if (heldFor >= PASS_LOCK_MS) return;

  throw new HttpError(
    "Rewrites are already being written for this report. Give it a moment — they appear on their own when they land.",
    409,
  );
}

async function assertUnderDailyCap(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  const midnightUtc = new Date();
  midnightUtc.setUTCHours(0, 0, 0, 0);

  const { count, error } = await client
    .from("resume_improvements")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", midnightUtc.toISOString());

  if (error) {
    console.error("could not count today's passes", error);
    throw new HttpError("Could not start the rewrites. Please try again.", 500);
  }
  if ((count ?? 0) >= MAX_PASSES_PER_DAY) {
    throw new HttpError(
      `You have used all ${MAX_PASSES_PER_DAY} rewrite passes for today. The limit resets at midnight UTC.`,
      429,
    );
  }
}

// -------------------------------------------------------------- model call

async function requestImprovement(
  env: Environment,
  report: AtsReport,
  lines: readonly RewritableLine[],
  total: number,
  send: (event: StreamEvent) => void,
): Promise<ModelResult> {
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
      stream: true,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildImprovePrompt(report, lines) },
          ],
        },
      ],
      output_config: {
        effort: env.effort,
        format: { type: "json_schema", schema: improvementSchema },
      },
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
  if (!response.body) {
    throw new HttpError("The rewrites returned no response. Please try again.", 502);
  }

  // Each completed rewrite is one `suggested` key, so counting them is counting
  // finished work rather than elapsed time. Counted forward from a cursor rather
  // than by re-matching the whole buffer on every delta, which is quadratic for
  // no gain. A `lastIndex`-seeded exec also cannot count the same key twice,
  // which a sliding window could.
  // `cursor` is kept by hand because a failed `exec` resets `lastIndex` to 0, and
  // letting that happen would recount every key from the start on the next delta.
  const written = /"suggested"\s*:/g;
  let cursor = 0;
  let count = 0;

  return await readModelStream(response.body, {
    noun: "rewrite",
    onThinking: () =>
      send({
        type: "progress",
        step: STEP_THINKING,
        total,
        label: "Working out what to change",
      }),
    onText: (json) => {
      written.lastIndex = cursor;
      let found = false;
      while (written.exec(json) !== null) {
        cursor = written.lastIndex;
        count++;
        found = true;
      }
      if (!found) return;
      send({
        type: "progress",
        step: Math.min(STEP_WRITING_FROM + count - 1, total - 1),
        total,
        label: count === 1 ? "Rewrote a line" : `Rewrote ${count} lines`,
      });
    },
  });
}

// --------------------------------------------------------------- row writes

async function openPass(
  client: SupabaseClient,
  {
    userId,
    resumeId,
    reportId,
    model,
  }: { userId: string; resumeId: string; reportId: string; model: string },
): Promise<string> {
  const { data, error } = await client
    .from("resume_improvements")
    .insert({
      user_id: userId,
      resume_id: resumeId,
      report_id: reportId,
      model,
      status: "running",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("could not open the pass", error);
    throw new HttpError("Could not start the rewrites. Please try again.", 500);
  }
  return data.id as string;
}

async function closePass(
  client: SupabaseClient,
  passId: string,
  status: "done" | "failed",
  result: ModelResult | null,
  error?: string,
): Promise<void> {
  const { error: updateError } = await client
    .from("resume_improvements")
    .update({
      status,
      error: error ?? null,
      // Written even on failure when they are known: a run that failed after the
      // model answered was still billed, and a spend figure that omits the
      // failures is the one that misleads.
      input_tokens: result?.inputTokens ?? null,
      output_tokens: result?.outputTokens ?? null,
    })
    .eq("id", passId);
  if (updateError) console.error(`could not close the pass as ${status}`, updateError);
}

/**
 * Store the suggestions and hand back the rows, ids included.
 *
 * The ids matter: accepting one is a single-row update from the browser, so the
 * client has to receive real primary keys rather than re-fetching and matching
 * on text it would have to normalise identically.
 */
async function saveEdits(
  client: SupabaseClient,
  {
    userId,
    resumeId,
    reportId,
    passId,
    drafts,
  }: {
    userId: string;
    resumeId: string;
    reportId: string;
    passId: string;
    drafts: ResumeEditDraft[];
  },
): Promise<StoredEdit[]> {
  // Nothing to save means nothing to replace: an empty second pass leaves the
  // first pass's suggestions, and whatever was accepted from them, alone.
  if (drafts.length === 0) return [];

  // A fresh set replaces the old one rather than piling on beside it, otherwise
  // the report would show two rewrites per finding and the rebuilt document
  // would still be carrying acceptances from a set the user discarded. Done
  // here, after the model answered, so a failed retry costs them nothing.
  const { error: clearError } = await client
    .from("resume_edits")
    .delete()
    .eq("report_id", reportId)
    .neq("improvement_id", passId);
  if (clearError) {
    console.error("could not clear the previous rewrites", clearError);
    throw new HttpError(
      "The rewrites were written but the previous set could not be cleared. Please try again.",
      500,
    );
  }

  const { data, error } = await client
    .from("resume_edits")
    .insert(
      drafts.map((draft) => ({
        user_id: userId,
        improvement_id: passId,
        resume_id: resumeId,
        report_id: reportId,
        category: draft.category,
        finding_title: draft.findingTitle,
        original: draft.original,
        suggested: draft.suggested,
        note: draft.note,
        has_blank: draft.hasBlank,
        flag: draft.flag,
        sort_order: draft.sortOrder,
      })),
    )
    .select("id, sort_order");

  if (error || !data) {
    console.error("could not save the rewrites", error);
    throw new HttpError(
      "The rewrites were written but could not be saved. Please try again.",
      500,
    );
  }

  // Paired on `sort_order` rather than on insert order, which PostgREST does not
  // promise to preserve in its response.
  const idBySort = new Map<number, string>(
    data.map((row) => [row.sort_order as number, row.id as string]),
  );

  return drafts
    .map((draft): StoredEdit | null => {
      const id = idBySort.get(draft.sortOrder);
      return id ? { ...draft, id, status: "suggested" } : null;
    })
    .filter((edit): edit is StoredEdit => edit !== null);
}
