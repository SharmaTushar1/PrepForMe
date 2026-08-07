import { functionsUrl, supabase, supabaseKey } from "../supabase";
import type { ResumeFields } from "../../types";
import { mockAiProvider } from "./mock";
import type {
  AiProvider,
  AnalysisProgress,
  AnalyzeResumeOptions,
  EditTailoredResumeInput,
  EditTailoredResumeResult,
  EnrichSkillGapsInput,
  ImproveResumeOptions,
  ParsedResume,
  PrepAnswer,
  ResumeAnalysis,
  ResumeEdit,
  ResumeImprovement,
  TailorInput,
  TailoringResult,
} from "./types";

/**
 * The hosted provider, selected by `VITE_AI_PROVIDER=edge`.
 *
 * Resume: `analyze-resume`, `improve-resume`, `tailor-resume`. Prep: `prep-chat` (multi-turn —
 * client sends recent history; claims are re-retrieved each turn), plus ingest /
 * save via `src/data/prep.ts`. Remaining surfaces still delegate to the mock,
 * method by method rather than by spreading, so adding a capability to
 * `AiProvider` fails to compile until someone decides which side of the seam it
 * belongs on.
 *
 * ---------------------------------------------------------------------------
 * Wire contract with `supabase/functions/analyze-resume` and `improve-resume` —
 * both sides of this are built independently, so it is stated here in full. The
 * two functions share it exactly, differing only in the `done` payload:
 *
 *   request   POST, JSON body `{ resumeId: string, force?: boolean }`
 *   non-2xx   JSON `{ error: string }`, written for the user and shown verbatim.
 *             Everything that can refuse without spending anything comes back
 *             this way: already done, already running, daily cap, page cap,
 *             file too large, nothing to rewrite.
 *   200       NDJSON — one JSON object per line, streamed as the work happens:
 *               { type: "progress", step, total, label }
 *               { type: "waiting", elapsedMs, expectedMs }   // analyze-resume
 *               { type: "done", analysis }        // analyze-resume
 *               { type: "done", edits, model }    // improve-resume
 *               { type: "error", message }
 *
 * The 200 is the part worth being careful about. A status line cannot be
 * revised once sent, so a failure during the model call arrives as an `error`
 * event on an otherwise successful response. **Only `done` means the work
 * exists**; a stream that ends without either event was cut off, which is a
 * distinct outcome and gets its own message.
 *
 * `functions.invoke` is deliberately not used: it resolves with the whole body,
 * which would collapse the stream back into one long wait.
 * ---------------------------------------------------------------------------
 */
export const edgeAiProvider: AiProvider = {
  name: "edge",
  supportsResumeParsing: true,

  async tailorResume(input: TailorInput): Promise<TailoringResult> {
    const response = await fetch(`${functionsUrl}/tailor-resume`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${await accessToken()}`,
      },
      body: JSON.stringify({
        mode: "tailor",
        applicationId: input.application.id,
      }),
    });
    if (!response.ok) {
      throw new Error(await refusalMessage(response, "resume tailor"));
    }
    const payload = (await response.json()) as TailoringResult;
    if (!payload.fields || !Array.isArray(payload.missingSkills)) {
      throw new Error("The tailor response was incomplete.");
    }
    return payload;
  },

  async enrichSkillGaps(input: EnrichSkillGapsInput): Promise<ResumeFields> {
    const response = await fetch(`${functionsUrl}/tailor-resume`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${await accessToken()}`,
      },
      body: JSON.stringify({
        mode: "enrich",
        applicationId: input.application.id,
        fields: input.fields,
        briefs: input.briefs,
      }),
    });
    if (!response.ok) {
      throw new Error(await refusalMessage(response, "skill-gap enrich"));
    }
    const payload = (await response.json()) as { fields?: ResumeFields };
    if (!payload.fields) {
      throw new Error("The skill-gap response was incomplete.");
    }
    return payload.fields;
  },

  async editTailoredResume(input: EditTailoredResumeInput) {
    const response = await fetch(`${functionsUrl}/tailor-resume`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${await accessToken()}`,
      },
      body: JSON.stringify({
        mode: "edit",
        applicationId: input.application.id,
        fields: input.fields,
        instruction: input.instruction,
      }),
    });
    if (!response.ok) {
      throw new Error(await refusalMessage(response, "resume edit"));
    }
    const payload = (await response.json()) as EditTailoredResumeResult;
    if (!payload.fields) {
      throw new Error("The edit response was incomplete.");
    }
    return payload;
  },

  atsGap: (input) => mockAiProvider.atsGap(input),
  draftReferralNote: (input) => mockAiProvider.draftReferralNote(input),
  suggestReferrals: (input) => mockAiProvider.suggestReferrals(input),
  answerPrepQuestion: async (input) => {
    const response = await fetch(`${functionsUrl}/prep-chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${await accessToken()}`,
      },
      body: JSON.stringify({
        applicationId: input.application.id,
        question: input.question,
        history: (input.history ?? []).slice(-8).map((turn) => ({
          role: turn.role,
          content: turn.content,
        })),
      }),
    });

    if (!response.ok) {
      throw new Error(await refusalMessage(response, "prep chat"));
    }

    const payload = (await response.json()) as {
      content?: string;
      citations?: unknown;
      suggestedClaims?: {
        content: string;
        claimKind: "company_fact" | "interview_process";
        provenance?: string;
        fromExperience?: boolean;
      }[];
    };

    if (typeof payload.content !== "string" || payload.content === "") {
      throw new Error("The prep answer came back empty.");
    }

    return {
      content: payload.content,
      citations: Array.isArray(payload.citations)
        ? (payload.citations as PrepAnswer["citations"])
        : [],
      suggestedClaims: payload.suggestedClaims,
    };
  },

  async analyzeResume(
    resumeId: string,
    { force = false, onProgress }: AnalyzeResumeOptions = {},
  ): Promise<ResumeAnalysis> {
    const body = await post("analyze-resume", "analysis", resumeId, force);
    return await readEventStream(body, onProgress, {
      noun: "analysis",
      // `analysis` is the whole payload, so anything shaped like an object is
      // taken as it stands — the function is the one authority on its contents.
      pick: (record) =>
        record.analysis ? (record.analysis as ResumeAnalysis) : null,
    });
  },

  async improveResume(
    resumeId: string,
    { force = false, onProgress }: ImproveResumeOptions = {},
  ): Promise<ResumeImprovement> {
    const body = await post("improve-resume", "rewrites", resumeId, force);
    return await readEventStream(body, onProgress, {
      noun: "rewrites",
      // An empty array is a real answer — "nothing here is worth rewriting" —
      // so the check is on the array existing, not on it having entries.
      pick: (record) =>
        Array.isArray(record.edits)
          ? {
              edits: record.edits as ResumeEdit[],
              model: typeof record.model === "string" ? record.model : "unknown",
              sample: false,
            }
          : null,
    });
  },

  async parseResume(): Promise<ParsedResume> {
    // There is no endpoint that takes a File: the PDF goes to storage first so
    // the model reads it server-side. Callers want analyzeResume.
    throw new Error(
      "Upload the resume first — analysis reads it from storage, not from the browser.",
    );
  },
};

/** Both functions take the same request, so they are called the same way. */
async function post(
  fn: string,
  noun: string,
  resumeId: string,
  force: boolean,
): Promise<ReadableStream<Uint8Array>> {
  const request = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${await accessToken()}`,
    },
    body: JSON.stringify({ resumeId, force }),
  };

  let response: Response;
  try {
    response = await fetch(`${functionsUrl}/${fn}`, request);
  } catch {
    // No status to go on: the browser never got a reply. A stopped function
    // server reaches the UI both ways — Kong answered a 503 in one attempt and
    // hung until the socket gave up in the next — so the same absence has to be
    // described the same way whichever path it takes. `fetch` only rejects on
    // transport, never on a status, so nothing the server chose to say lands here.
    throw new Error(unreachableMessage(noun));
  }

  if (!response.ok) throw new Error(await refusalMessage(response, noun));
  if (!response.body) throw new Error("The server returned an empty response.");
  return response.body;
}

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error("You need to be signed in for this.");
  }
  return token;
}

/**
 * The message to show for a non-2xx, in the user's terms.
 *
 * Our own refusals are the only ones worth repeating verbatim, and `errorResponse`
 * in `functions/_shared/cors.ts` puts every one of them in an `error` field. So
 * `error` is trusted and nothing else is: a body with only `message` came from
 * the gateway, which never reached the function and describes its own plumbing.
 * Kong answers a stopped container with `{"message":"name resolution failed"}`,
 * which is accurate and tells the user nothing they can act on.
 */
async function refusalMessage(
  response: Response,
  noun: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body?.error === "string" && body.error !== "") return body.error;
  } catch {
    // Not JSON, so certainly not ours.
  }

  switch (response.status) {
    case 401:
    case 403:
      return "Your session has expired. Sign in again and try that once more.";
    case 404:
      // The URL is built from the project's own config, so a missing route means
      // the function was never deployed to whatever environment this is.
      return `The ${noun} isn't available in this environment yet — the server function hasn't been deployed.`;
    case 502:
    case 503:
    case 504:
      // 503 is the one a developer hits daily: `supabase functions serve` is not
      // running, so the gateway cannot resolve the container's hostname.
      return unreachableMessage(noun);
    case 546:
      // Supabase's own status for a worker that exceeded its memory or CPU
      // budget. It dies without writing a body, so this is the only clue.
      return `The ${noun} ran out of resources before it finished. Nothing was saved.`;
    default:
      return `The ${noun} could not be started (${response.status}).`;
  }
}

/** Nothing answered. Said the same way whether that arrived as a status or as no reply at all. */
function unreachableMessage(noun: string): string {
  const message = `The ${noun} could not be started: the server isn't reachable. Nothing was charged.`;
  return import.meta.env.DEV
    ? `${message} Is \`supabase functions serve\` still running?`
    : message;
}

interface DoneReader<T> {
  /** What this run is, for the message a cut-off connection produces. */
  noun: string;
  /** Pull the payload out of a `done` event, or null if it isn't there. */
  pick: (record: Record<string, unknown>) => T | null;
}

/** Read the NDJSON stream to its end, reporting progress as it arrives. */
async function readEventStream<T>(
  body: ReadableStream<Uint8Array>,
  onProgress: ((progress: AnalysisProgress) => void) | undefined,
  { noun, pick }: DoneReader<T>,
): Promise<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let pending = "";
  let result: T | null = null;
  let failure: string | null = null;
  /** The step a `waiting` heartbeat belongs to. */
  let last: AnalysisProgress | null = null;

  const handle = (line: string): void => {
    const trimmed = line.trim();
    if (trimmed === "") return;

    let event: unknown;
    try {
      event = JSON.parse(trimmed);
    } catch {
      // A half-written line is impossible here — lines are only handed over
      // once their newline has arrived — so this is a frame this version does
      // not understand, and ignoring it is better than failing a paid run.
      return;
    }

    if (typeof event !== "object" || event === null) return;
    const record = event as Record<string, unknown>;

    if (record.type === "progress" && typeof record.label === "string") {
      last = {
        step: Number(record.step) || 0,
        total: Number(record.total) || 0,
        label: record.label,
      };
      onProgress?.(last);
      return;
    }
    // A heartbeat during a step with nothing observable inside it. It repeats the
    // step it belongs to rather than advancing one, so the bar holds still and
    // only the elapsed time moves — which is exactly what is happening.
    if (record.type === "waiting" && last) {
      onProgress?.({
        ...last,
        waiting: {
          elapsedMs: Number(record.elapsedMs) || 0,
          expectedMs: Number(record.expectedMs) || 0,
        },
      });
      return;
    }
    if (record.type === "done") {
      result = pick(record);
      return;
    }
    if (record.type === "error" && typeof record.message === "string") {
      failure = record.message;
    }
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      pending += decoder.decode(value, { stream: true });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) handle(line);
    }
    handle(pending);
  } finally {
    reader.releaseLock();
  }

  if (failure) throw new Error(failure);
  if (result === null) {
    // Neither outcome arrived: the connection dropped, or the server was cut
    // off mid-run. Saying so is more useful than a generic failure, because the
    // model call may well have been billed.
    throw new Error(
      `The ${noun} was cut off before it finished. Nothing was saved — try it again.`,
    );
  }
  return result;
}
