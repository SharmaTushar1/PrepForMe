/**
 * A stand-in for the Messages API, for exercising the streaming path for free.
 *
 * Every failure past the first byte of a real call is billed whether or not the
 * result is usable — the first live run of this analyzer proved that by spending
 * a full budget on a truncated report. So the stream assembly, the milestone
 * detection, the validator and the database write are proven here first, against
 * a response shaped exactly like Anthropic's: SSE frames, a thinking block, then
 * the JSON in `text_delta` pieces small enough to split tokens across frames.
 *
 * Not wired into anything. Run it by hand:
 *
 *   deno run --allow-net --allow-env supabase/functions/_stub/anthropic.ts
 *   supabase functions serve --env-file supabase/.env.stub
 *
 * It answers both shapes, chosen the way the real API chooses: a request with
 * `stream: true` gets SSE frames, and one without gets a single JSON body. The
 * analyzer asks for the second and the rewrite pass for the first.
 *
 * `host.docker.internal` because the function runs inside the CLI's container
 * and `localhost` there is the container, not this machine.
 */

import { ATS_CATEGORY_IDS, CATEGORY_SPECS } from "../_shared/schema.ts";

const PORT = 8787;

function sampleAnalysis(): unknown {
  return {
    report: {
      overallScore: 71,
      summary:
        "A stub response. If you are reading this in the app, the analyzer is pointed at the local stub rather than at Anthropic.",
      // Not the conventional layout, so the stub also exercises the rebuild
      // offer — the branch that would otherwise only be reachable by paying for
      // an analysis of a genuinely two-column file.
      layout: "multi_column",
      categories: CATEGORY_SPECS.map((spec) => ({
        id: spec.id,
        score: 70,
        summary: `Stub summary for ${spec.label}.`,
        findings: [
          {
            severity: "warning",
            title: `Stub finding for ${spec.label}`,
            detail: "This finding came from the local stub, not from a model.",
            fix: "Point ANTHROPIC_BASE_URL back at Anthropic to get a real one.",
            evidence: "",
          },
        ],
      })),
      topFixes: ATS_CATEGORY_IDS.slice(0, 3).map((id) => ({
        category: id,
        severity: "warning",
        title: `Stub finding for ${id}`,
        fix: "Point ANTHROPIC_BASE_URL back at Anthropic to get a real one.",
      })),
    },
    parsed: {
      fullName: "Stub Candidate",
      headline: "Stub headline",
      email: null,
      location: null,
      summary: "A stub summary paragraph.",
      links: [{ label: "GitHub", url: "https://example.invalid" }],
      experiences: [
        {
          title: "Stub role",
          company: "Stub company",
          startDate: "2021-03-01",
          endDate: null,
          bullets: ["A bullet copied verbatim from nothing at all."],
        },
      ],
      education: [
        {
          title: "Stub degree",
          organization: "Stub university",
          dateRange: "Aug 2015 – Jun 2019",
          lines: ["A stub honour."],
        },
      ],
      projects: [
        { title: "Stub project", organization: "", dateRange: "2023", lines: [] },
      ],
      certifications: [
        {
          title: "Stub certification",
          organization: "Stub issuer",
          dateRange: "",
          lines: [],
        },
      ],
      skills: ["stubbing", "streaming"],
    },
  };
}

/**
 * Rewrites that quote the lines they were actually given.
 *
 * The validator discards any rewrite whose `original` does not match a line in
 * the parse, so a stub returning fixed text would test nothing but the discard
 * path. Instead the quoted lines and finding titles are read back out of the
 * prompt, which also makes this a live check that the prompt still renders them
 * in the shape the parser here expects.
 *
 * Three deliberate shapes: an ordinary rewrite, one that leaves a blank, and one
 * that introduces a figure the original never had — the last so the flagged path
 * and its exclusion from "accept all" are exercisable without paying for a model
 * that misbehaves on cue.
 */
function sampleImprovement(prompt: string): unknown {
  const lines = prompt
    .split("\n")
    .filter((line) => line.startsWith('"') && line.endsWith('"') && line.length > 2)
    .map((line) => line.slice(1, -1));

  const findings = [...prompt.matchAll(/^- `(\w+)` · "(.+?)" \(/gm)].map((
    match,
  ) => ({ category: match[1], title: match[2] }));

  const shapes = [
    {
      suggested: (line: string) => `Stubbed rewrite: ${line}`,
      note: "A stub rewrite. Point ANTHROPIC_BASE_URL back at Anthropic for a real one.",
      leftBlank: false,
    },
    {
      suggested: (line: string) => `Stubbed rewrite with a gap: ${line} — cut it by ___%.`,
      note: "Fill in the percentage you actually achieved.",
      leftBlank: true,
    },
    {
      // 47 appears nowhere in any original, so the validator's figure check must
      // catch this one.
      suggested: (line: string) => `Stubbed rewrite claiming a number: ${line} — 47% faster.`,
      note: "This one exists to prove invented figures get flagged.",
      leftBlank: false,
    },
  ];

  return {
    edits: lines.slice(0, shapes.length).map((line, i) => ({
      category: findings[i]?.category ?? "impact",
      findingTitle: findings[i]?.title ?? "Stub finding",
      original: line,
      suggested: shapes[i].suggested(line),
      note: shapes[i].note,
      leftBlank: shapes[i].leftBlank,
    })),
  };
}

function frame(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** The one text block in the request, which is the prompt. */
function promptOf(body: unknown): string {
  const message = (body as {
    messages?: { content?: { type?: string; text?: string }[] }[];
  })?.messages?.[0];
  const text = message?.content?.find((block) => block.type === "text");
  return text?.text ?? "";
}

/** Analysis requests carry the PDF; rewrite requests are text only. */
function wantsAnalysis(body: unknown): boolean {
  const message = (body as {
    messages?: { content?: { type?: string }[] }[];
  })?.messages?.[0];
  return !!message?.content?.some((block) => block.type === "document");
}

Deno.serve({ port: PORT }, async (req) => {
  if (!new URL(req.url).pathname.endsWith("/v1/messages")) {
    return new Response("not found", { status: 404 });
  }

  const request = await req.json().catch(() => ({}));
  const encoder = new TextEncoder();
  const json = JSON.stringify(
    wantsAnalysis(request)
      ? sampleAnalysis()
      : sampleImprovement(promptOf(request)),
  );

  // The analyzer stopped asking for a stream once the per-frame CPU toll proved
  // fatal on a long answer, so both shapes have to be answerable here. Which one
  // is decided the way the real API decides it: by `stream` on the request.
  if ((request as { stream?: boolean }).stream !== true) {
    // `STUB_WAIT_MS` holds the response back, which is the only way to see the
    // waiting caption and the bar's paler fill without paying for a real minute.
    const waitMs = Number(Deno.env.get("STUB_WAIT_MS") ?? "");
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));

    return Response.json({
      id: "msg_stub",
      type: "message",
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Considering the layout…" },
        { type: "text", text: json },
      ],
      stop_reason: "end_turn",
      usage: { input_tokens: 2500, output_tokens: 3200 },
    });
  }

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: unknown) =>
        controller.enqueue(encoder.encode(frame(event)));

      send({
        type: "message_start",
        message: { usage: { input_tokens: 2500, output_tokens: 0 } },
      });

      // Knobs, all off by default, for reproducing what a real call does that a
      // fast one cannot. A real answer arrives in thousands of frames, most of
      // them thinking nobody reads, and the edge runtime charges CPU for every
      // one: an analysis was killed on that limit at 84 seconds, after it was
      // billed. `STUB_THINK_FRAMES=4000 STUB_CHUNK=5 STUB_SPREAD_MS=85000`
      // reproduces that kill exactly, for nothing, which is how the analyzer's
      // streaming was shown to be unaffordable rather than merely slow.
      //
      //   STUB_SPREAD_MS   stretch the whole answer over this many milliseconds
      //   STUB_THINK_FRAMES  how many thinking deltas to emit first
      //   STUB_CHUNK       characters per text delta — real ones are a few
      const chunk = Number(Deno.env.get("STUB_CHUNK") ?? "") || 37;
      const thinkFrames = Number(Deno.env.get("STUB_THINK_FRAMES") ?? "") || 1;
      const textFrames = Math.ceil(json.length / chunk);
      const spread = Number(Deno.env.get("STUB_SPREAD_MS") ?? "");
      const gap = spread > 0
        ? Math.max(Math.round(spread / (textFrames + thinkFrames)), 0)
        : 15;

      send({ type: "content_block_start", index: 0, content_block: { type: "thinking" } });
      for (let i = 0; i < thinkFrames; i++) {
        send({
          type: "content_block_delta",
          index: 0,
          delta: {
            type: "thinking_delta",
            thinking: "Considering the layout and what it costs the reader. ",
          },
        });
        if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap));
      }
      send({ type: "content_block_stop", index: 0 });

      send({ type: "content_block_start", index: 1, content_block: { type: "text" } });
      // Deliberately ragged: a real stream does not break on JSON boundaries,
      // and neither should the parser being tested.
      for (let i = 0; i < json.length; i += chunk) {
        send({
          type: "content_block_delta",
          index: 1,
          delta: { type: "text_delta", text: json.slice(i, i + chunk) },
        });
        if (gap > 0) await new Promise((resolve) => setTimeout(resolve, gap));
      }
      send({ type: "content_block_stop", index: 1 });

      send({
        type: "message_delta",
        delta: { stop_reason: "end_turn" },
        usage: { output_tokens: 3200 },
      });
      send({ type: "message_stop" });
      controller.close();
    },
  });

  return new Response(body, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
  });
});

console.error(`anthropic stub listening on http://localhost:${PORT}`);
