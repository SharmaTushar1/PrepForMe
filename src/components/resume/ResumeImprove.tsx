import { createContext, useContext, useMemo, type ReactNode } from "react";
import { css } from "../../css";
import type {
  AnalysisProgress,
  AtsCategoryId,
  ResumeAnalysis,
  ResumeEdit,
  ResumeEditStatus,
} from "../../lib/ai";
import {
  useAcceptAllEdits,
  useImproveResume,
  useResumeEdits,
  useSetEditStatus,
} from "../../data/resumeEdits";
import { useAiUsage } from "../../data/usage";
import { AllowanceNote } from "../AllowanceNote";
import {
  ErrorNote,
  Eyebrow,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
} from "../ui";

/**
 * "Improve my resume": one pass that answers every fixable finding with the line
 * to use instead, accepted or dismissed one at a time.
 *
 * Three decisions worth keeping:
 *
 * - **One call, not one per point.** Every per-finding button after the first
 *   press is free, because the pass rewrites everything it can in one go. Calling
 *   the model per finding would re-send the same context each time and cost more
 *   for less.
 * - **Nothing is applied on its own.** An accepted rewrite changes what a rebuilt
 *   document contains and nothing else — not the profile, not the uploaded PDF.
 *   The user asked for it that way, and it is also the only version that can't
 *   surprise someone.
 * - **A missing number stays a blank.** The model is instructed never to invent a
 *   figure, the server flags any rewrite that introduces one anyway, and those
 *   are excluded from "accept all" so agreeing in bulk can never accept a number
 *   nobody checked.
 */

// ------------------------------------------------------------------- context

interface ImproveState {
  edits: ResumeEdit[];
  /** Suggestions that named a finding this report doesn't have. */
  orphans: ResumeEdit[];
  ran: boolean;
  running: boolean;
  progress: AnalysisProgress | null;
  failure: string | null;
  error: unknown;
  sample: boolean;
  /** False when there is no stored report to hang suggestions off. */
  available: boolean;
  run: (force: boolean) => void;
  setStatus: (edit: ResumeEdit, status: ResumeEditStatus) => void;
  acceptAll: () => void;
  find: (category: AtsCategoryId, findingTitle: string) => ResumeEdit | null;
}

const ImproveContext = createContext<ImproveState | null>(null);

/**
 * Everything the rewrite UI needs, gathered once.
 *
 * A context rather than props threaded through the report: the per-finding row
 * sits three components deep inside the category cards, and passing a lookup
 * function through `AtsReportView` and `CategoryCard` would put a parameter on
 * both that neither has any other use for.
 */
export function useResumeImprovement(
  resumeId: string,
  analysis: ResumeAnalysis,
): ImproveState {
  const reportId = analysis.reportId;
  const stored = useResumeEdits(reportId);
  const improve = useImproveResume();
  const setStatus = useSetEditStatus();
  const acceptAll = useAcceptAllEdits();

  const titles = useMemo(() => {
    const set = new Set<string>();
    for (const category of Object.values(analysis.report.categories)) {
      for (const finding of category.findings) {
        set.add(`${category.id}:${key(finding.title)}`);
      }
    }
    return set;
  }, [analysis.report.categories]);

  const byFinding = useMemo(() => {
    const map = new Map<string, ResumeEdit>();
    for (const edit of stored.edits) {
      map.set(`${edit.category}:${key(edit.findingTitle)}`, edit);
    }
    return map;
  }, [stored.edits]);

  // A rewrite whose finding title matches nothing is still a valid rewrite of a
  // real line — the model just referred to the finding loosely. It goes in the
  // summary card rather than being thrown away, since it was paid for.
  const orphans = useMemo(
    () =>
      stored.edits.filter(
        (edit) => !titles.has(`${edit.category}:${key(edit.findingTitle)}`),
      ),
    [stored.edits, titles],
  );

  return {
    edits: stored.edits,
    orphans,
    ran: stored.completed || stored.edits.length > 0,
    running: stored.running || improve.isPending,
    progress: improve.progress,
    failure: stored.failure,
    error: improve.isError ? improve.error : null,
    sample: analysis.sample,
    // In local mode there is no report row, so suggestions live in this tab's
    // cache. That is allowed — it is how the screen stays buildable offline —
    // but it is `sample`, and every surface says so.
    available: reportId !== null || analysis.sample,
    run: (force: boolean) => improve.mutate({ resumeId, reportId, force }),
    setStatus: (edit, status) => setStatus.mutate({ edit, status, reportId }),
    acceptAll: () => acceptAll.mutate({ edits: stored.edits, reportId }),
    find: (category, findingTitle) =>
      byFinding.get(`${category}:${key(findingTitle)}`) ?? null,
  };
}

/** Same normalisation the server matches finding titles with. */
function key(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function ImproveProvider({
  value,
  children,
}: {
  value: ImproveState;
  children: ReactNode;
}) {
  return <ImproveContext.Provider value={value}>{children}</ImproveContext.Provider>;
}

/**
 * The rewrite for one finding, or null.
 *
 * Returns null rather than throwing outside a provider, so the report renders
 * unchanged anywhere rewrites don't apply.
 */
export function useFindingRewrite(
  category: AtsCategoryId,
  findingTitle: string,
): { edit: ResumeEdit | null; state: ImproveState | null } {
  const state = useContext(ImproveContext);
  return {
    edit: state ? state.find(category, findingTitle) : null,
    state,
  };
}

// ---------------------------------------------------------------- the card

/** Counts the card reports, so the numbers on screen come from one place. */
function tally(edits: readonly ResumeEdit[]) {
  return {
    total: edits.length,
    open: edits.filter((e) => e.status === "suggested").length,
    accepted: edits.filter((e) => e.status === "accepted").length,
    dismissed: edits.filter((e) => e.status === "dismissed").length,
    /** Held back from "accept all" because they introduced a figure. */
    flagged: edits.filter((e) => e.status === "suggested" && e.flag !== "").length,
    blanks: edits.filter((e) => e.status === "accepted" && e.hasBlank).length,
  };
}

export function ImproveCard({ state }: { state: ImproveState }) {
  const counts = tally(state.edits);
  const acceptable = counts.open - counts.flagged;

  return (
    <section>
      <Eyebrow style={{ marginBottom: "12px" }}>Rewrite the lines it flagged</Eyebrow>

      <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:14px; background:#fff; padding:20px 22px;")}>
        {state.running ? (
          <Running progress={state.progress} />
        ) : counts.total > 0 ? (
          <>
            <div style={css("display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:7px;")}>
              <h3 style={css("font-family:'Space Grotesk'; font-size:17px; font-weight:600; margin:0;")}>
                {counts.total} rewrite{counts.total === 1 ? "" : "s"} ready
              </h3>
              <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.55 0.015 260);")}>
                {counts.accepted} accepted · {counts.open} open
                {counts.dismissed > 0 ? ` · ${counts.dismissed} dismissed` : ""}
              </span>
            </div>
            <p style={css("font-size:13px; line-height:1.65; color:oklch(0.42 0.015 260); margin:0 0 16px; max-width:620px;")}>
              Each one sits under the finding it answers, below. Accepting a rewrite changes what the
              rebuilt document contains — it doesn't touch your uploaded file or your profile, and
              nothing is sent anywhere.
            </p>

            <div style={css("display:flex; align-items:center; gap:10px; flex-wrap:wrap;")}>
              <PrimaryButton onClick={state.acceptAll} disabled={acceptable <= 0}>
                {acceptable > 0
                  ? `Accept all ${acceptable}`
                  : counts.open > 0
                    ? "Nothing left to accept in bulk"
                    : "All decided"}
              </PrimaryButton>
              <SecondaryButton onClick={() => state.run(true)}>
                Write a fresh set
              </SecondaryButton>
              <span style={css("font-size:12px; color:oklch(0.55 0.015 260);")}>
                A fresh set replaces these and costs another model call.
              </span>
            </div>

            {counts.flagged > 0 && (
              <div style={css("border:1px solid oklch(0.65 0.14 60 / 0.4); background:oklch(0.7 0.15 60 / 0.08); border-radius:11px; padding:12px 14px; font-size:12.5px; line-height:1.6; color:oklch(0.4 0.09 55); margin-top:14px;")}>
                <strong>
                  {counts.flagged} {counts.flagged === 1 ? "rewrite is" : "rewrites are"} held back
                  from “accept all”.
                </strong>{" "}
                {counts.flagged === 1 ? "It states a figure" : "They state figures"} your original
                line didn't. Only you know whether {counts.flagged === 1 ? "it is" : "they are"} true,
                so {counts.flagged === 1 ? "it has" : "they have"} to be accepted individually.
              </div>
            )}

            {counts.blanks > 0 && (
              <div style={css("font-size:12.5px; line-height:1.6; color:oklch(0.42 0.015 260); margin-top:12px;")}>
                {counts.blanks === 1 ? "One accepted rewrite has" : `${counts.blanks} accepted rewrites have`}
                {" "}a <code style={css("font-family:'IBM Plex Mono'; font-size:12px;")}>___</code> in
                {" "}{counts.blanks === 1 ? "it" : "them"} where a number belongs. That's deliberate —
                the resume never said what it was — but fill {counts.blanks === 1 ? "it" : "them"} in
                before you send the file.
              </div>
            )}

            <OrphanEdits state={state} />
          </>
        ) : state.ran ? (
          <>
            <h3 style={css("font-family:'Space Grotesk'; font-size:17px; font-weight:600; margin:0 0 7px;")}>
              Nothing came back worth rewriting
            </h3>
            <p style={css("font-size:13px; line-height:1.65; color:oklch(0.42 0.015 260); margin:0 0 16px; max-width:620px;")}>
              The pass ran and proposed no replacements. That usually means the findings above are
              about the document rather than the writing — a layout, a page count, a detail the resume
              never states — and none of those are fixed by rewording a line.
            </p>
            <SecondaryButton onClick={() => state.run(true)}>Try again</SecondaryButton>
          </>
        ) : (
          <Offer state={state} />
        )}

        {state.sample && counts.total > 0 && (
          <div style={css("border:1px solid oklch(0.65 0.14 60 / 0.45); background:oklch(0.7 0.15 60 / 0.12); border-radius:11px; padding:12px 14px; font-size:12.5px; line-height:1.6; color:oklch(0.4 0.1 55); margin-top:14px;")}>
            <strong>Sample rewrites — no model was called.</strong> These are fixtures of the sample
            resume's own lines, and they aren't saved to your account. Accepting one only changes what
            this tab shows.
          </div>
        )}

        {state.failure && (
          <div style={css("margin-top:14px;")}>
            <ErrorNote error={new Error(state.failure)} />
          </div>
        )}
        {state.error ? (
          <div style={css("margin-top:14px;")}>
            <ErrorNote error={state.error} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** The first press: what it does, what it costs, what it will never do. */
function Offer({ state }: { state: ImproveState }) {
  const { exhausted } = useAiUsage("resume_rewrite");

  return (
    <>
      <h3 style={css("font-family:'Space Grotesk'; font-size:17px; font-weight:600; margin:0 0 7px;")}>
        Improve my resume
      </h3>
      <p style={css("font-size:13.5px; line-height:1.65; color:oklch(0.4 0.015 260); margin:0 0 14px; max-width:620px;")}>
        One pass writes the replacement line for every finding above that rewording can actually fix.
        Each one appears under its finding with an <strong>Accept</strong> button, so you can take them
        one at a time or all at once. Nothing is applied until you say so.
      </p>

      <ul style={css("list-style:none; padding:0; margin:0 0 18px; display:flex; flex-direction:column; gap:7px; max-width:620px;")}>
        {[
          "It never invents a number. Where a bullet needs one the resume doesn't state, the rewrite leaves a blank for you to fill.",
          "It only rewrites your summary, your bullets, and the lines under education and projects — never a title, employer, date or skill.",
          "Layout findings get no rewrite. Those are what the rebuild below is for.",
          "One model call, a few cents. Accepting, dismissing and undoing afterwards are free.",
        ].map((line) => (
          <li key={line} style={css("display:flex; gap:9px; font-size:12.5px; line-height:1.55; color:oklch(0.35 0.015 260);")}>
            <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.55 0.15 255); flex:0 0 auto; margin-top:1px;")}>
              →
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <PrimaryButton
        onClick={() => state.run(false)}
        disabled={!state.available || exhausted}
      >
        Improve my resume
      </PrimaryButton>

      <AllowanceNote feature="resume_rewrite" noun="rewrite pass" />

      {state.sample && (
        <div style={css("font-size:12px; color:oklch(0.45 0.09 55); line-height:1.55; margin-top:12px;")}>
          Local mode — this returns labelled sample rewrites rather than reading your report, and
          nothing gets saved.
        </div>
      )}
    </>
  );
}

function Running({ progress }: { progress: AnalysisProgress | null }) {
  return (
    <div style={css("padding:8px 0;")}>
      {progress ? (
        <ProgressBar
          step={progress.step}
          total={progress.total}
          label={progress.label}
          waiting={progress.waiting}
          note="After the first two steps, the bar advances once per rewrite the model finishes."
        />
      ) : (
        <div style={css("text-align:center;")}>
          <div style={css("font-size:14px; font-weight:600;")}>Writing rewrites…</div>
          <p style={css("font-size:12.5px; color:oklch(0.5 0.015 260); line-height:1.6; margin:6px auto 0; max-width:420px;")}>
            {/* No bar: this run was started somewhere else, so its progress isn't
                being reported to this tab. */}
            Started in another tab or before a reload. This page updates itself when they land.
          </p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ one row

/**
 * One suggestion: the line now, the line proposed, and the decision.
 *
 * Rendered under its finding, which is why the original is shown again here even
 * though the finding's own evidence block above usually quotes it — the two can
 * differ (evidence quotes the smallest telling span, a rewrite replaces the whole
 * line), and the thing being replaced has to be unambiguous at the moment someone
 * presses Accept.
 */
export function EditRow({
  edit,
  state,
}: {
  edit: ResumeEdit;
  state: ImproveState;
}) {
  const accepted = edit.status === "accepted";
  const dismissed = edit.status === "dismissed";

  return (
    <div
      style={{
        ...css("border-radius:11px; padding:13px 15px; margin-top:11px;"),
        border: accepted
          ? "1px solid oklch(0.55 0.13 145 / 0.4)"
          : "1px solid oklch(0.88 0.008 260)",
        background: accepted
          ? "oklch(0.6 0.14 145 / 0.05)"
          : dismissed
            ? "oklch(0.97 0.004 260)"
            : "#fff",
        opacity: dismissed ? 0.72 : 1,
      }}
    >
      <div style={css("display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:9px;")}>
        <span style={css("font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:0.09em; text-transform:uppercase; color:oklch(0.5 0.015 260);")}>
          {accepted ? "Accepted rewrite" : dismissed ? "Dismissed rewrite" : "Suggested rewrite"}
        </span>
        {edit.hasBlank && (
          <span style={css("font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; padding:2px 8px; border-radius:100px; color:oklch(0.42 0.1 55); background:oklch(0.65 0.14 60 / 0.1); border:1px solid oklch(0.65 0.14 60 / 0.3);")}>
            needs a number
          </span>
        )}
      </div>

      <Line label="Now" text={edit.original} muted />
      <div style={css("margin-top:8px;")}>
        <Line label="Instead" text={edit.suggested} />
      </div>

      {edit.note && (
        <p style={css("font-size:12.5px; line-height:1.6; color:oklch(0.42 0.015 260); margin:10px 0 0;")}>
          {edit.note}
        </p>
      )}

      {edit.flag && (
        // Rendered verbatim from the server, which is the only place that knows
        // which figures were added.
        <div style={css("border:1px solid oklch(0.6 0.16 25 / 0.3); background:oklch(0.6 0.16 25 / 0.05); border-radius:9px; padding:10px 12px; font-size:12.5px; line-height:1.6; color:oklch(0.45 0.12 25); margin-top:10px;")}>
          {edit.flag}
        </div>
      )}

      <div style={css("display:flex; align-items:center; gap:9px; flex-wrap:wrap; margin-top:12px;")}>
        {accepted ? (
          <>
            <span style={css("font-size:12.5px; font-weight:600; color:oklch(0.36 0.1 150);")}>
              In your rebuilt resume
            </span>
            <SecondaryButton onClick={() => state.setStatus(edit, "suggested")}>
              Undo
            </SecondaryButton>
          </>
        ) : dismissed ? (
          <SecondaryButton onClick={() => state.setStatus(edit, "suggested")}>
            Bring it back
          </SecondaryButton>
        ) : (
          <>
            <PrimaryButton onClick={() => state.setStatus(edit, "accepted")}>
              Accept this
            </PrimaryButton>
            <SecondaryButton onClick={() => state.setStatus(edit, "dismissed")}>
              Not this one
            </SecondaryButton>
          </>
        )}
        <CopyButton text={edit.suggested} />
      </div>
    </div>
  );
}

function Line({
  label,
  text,
  muted,
}: {
  label: string;
  text: string;
  muted?: boolean;
}) {
  return (
    <div>
      <div style={css("font-family:'IBM Plex Mono'; font-size:9.5px; letter-spacing:0.09em; text-transform:uppercase; color:oklch(0.6 0.015 260); margin-bottom:4px;")}>
        {label}
      </div>
      <div
        style={{
          ...css("font-family:'IBM Plex Mono'; font-size:12px; line-height:1.65; border-radius:0 8px 8px 0; padding:9px 12px;"),
          color: muted ? "oklch(0.5 0.015 260)" : "oklch(0.25 0.02 260)",
          background: muted ? "oklch(0.975 0.004 260)" : "oklch(0.55 0.15 255 / 0.05)",
          borderLeft: muted
            ? "3px solid oklch(0.85 0.01 260)"
            : "3px solid oklch(0.55 0.15 255 / 0.5)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

/**
 * Because the rebuild is not the only way someone uses one of these: plenty of
 * people will paste the line straight into the file they already have.
 */
function CopyButton({ text }: { text: string }) {
  return (
    <SecondaryButton
      onClick={() => {
        void navigator.clipboard?.writeText(text);
      }}
      style={{ marginLeft: "auto" }}
    >
      Copy
    </SecondaryButton>
  );
}

/**
 * Rewrites that named a finding this report doesn't have, listed on their own.
 *
 * Rare, and kept rather than hidden: the rewrite is of a real line either way, so
 * discarding it would be throwing away something the user paid for because the
 * model was imprecise about which finding it was answering.
 */
function OrphanEdits({ state }: { state: ImproveState }) {
  if (state.orphans.length === 0) return null;

  return (
    <div style={css("margin-top:16px; border-top:1px solid oklch(0.94 0.006 260); padding-top:14px;")}>
      <div style={css("font-size:13px; font-weight:600; margin-bottom:4px;")}>
        {state.orphans.length} rewrite{state.orphans.length === 1 ? "" : "s"} without a matching
        finding
      </div>
      <p style={css("font-size:12.5px; line-height:1.6; color:oklch(0.5 0.015 260); margin:0 0 4px; max-width:620px;")}>
        {state.orphans.length === 1 ? "This one refers" : "These refer"} to a finding by a name the
        report doesn't use, so {state.orphans.length === 1 ? "it" : "they"} couldn't be filed under a
        card. The rewrite{state.orphans.length === 1 ? "" : "s"} still {state.orphans.length === 1 ? "replaces" : "replace"}
        {" "}a real line of yours.
      </p>
      {state.orphans.map((edit) => (
        <EditRow key={edit.id} edit={edit} state={state} />
      ))}
    </div>
  );
}
