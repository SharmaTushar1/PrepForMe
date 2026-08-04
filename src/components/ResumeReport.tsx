import { useState } from "react";
import { css } from "../css";
import { ai } from "../lib/ai";
import { fileSize, shortDate } from "../lib/format";
import {
  isAnalysisStale,
  useAnalyzeResume,
  useBaseResume,
  useDeleteResume,
  useResumeFileUrl,
  useResumeReport,
  type AnalysisProgressState,
} from "../data/resumes";
import type { ResumeAnalysis } from "../lib/ai";
import type { Resume } from "../types";
import { AtsReportView } from "./resume/AtsReportView";
import { ParsedResumeReview } from "./resume/ParsedResumeReview";
import {
  ImproveCard,
  ImproveProvider,
  useResumeImprovement,
} from "./resume/ResumeImprove";
import { ResumeRebuild } from "./resume/ResumeRebuild";
import { ResumeUploadCard } from "./resume/ResumeUploadCard";
import {
  EmptyState,
  ErrorNote,
  Loading,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
  Spinner,
} from "./ui";

const PAGE = "padding:30px 40px 60px; max-width:900px; width:100%; animation:fadeIn .3s ease both;";

/**
 * The full ATS review for the base resume, reached from the profile card.
 * Everything on it is read back from the stored analysis; the only thing that
 * spends anything is the explicit "run the analysis" button.
 */
export function ResumeReport() {
  const base = useBaseResume();
  const report = useResumeReport(base.resume?.id);
  const analyze = useAnalyzeResume();
  const [replacing, setReplacing] = useState(false);

  if (base.isLoading) return <Loading label="Loading your resume…" />;

  if (base.error) {
    return (
      <div style={css(PAGE)}>
        <Header />
        <ErrorNote error={base.error} />
      </div>
    );
  }

  const resume = base.resume;

  if (!resume || replacing) {
    return (
      <div style={css(PAGE)}>
        <Header />
        {resume ? (
          <div style={css("margin-bottom:16px;")}>
            <ResumeUploadCard
              onUploaded={() => setReplacing(false)}
              footer={
                <div>
                  <SecondaryButton onClick={() => setReplacing(false)}>
                    Keep {resume.fileName}
                  </SecondaryButton>
                </div>
              }
            />
          </div>
        ) : (
          <div style={css("display:flex; flex-direction:column; gap:18px;")}>
            <EmptyState
              title="No resume uploaded yet"
              body="Upload the PDF you actually send out. You'll get a review of what a parser can pull out of it, and a structured read of your roles you can push onto your profile."
            />
            <ResumeUploadCard />
          </div>
        )}
      </div>
    );
  }

  const analysis = report.data;

  return (
    <div style={css(PAGE)}>
      <Header />

      <FileBar resume={resume} onReplace={() => setReplacing(true)} />

      {report.isPending && <Loading label="Loading the report…" />}
      {report.error && <ErrorNote error={report.error} retry={() => report.refetch()} />}

      {!report.isPending && !report.error && !analysis && (
        <NoReportYet
          resume={resume}
          onAnalyze={() => analyze.mutate({ resumeId: resume.id })}
          pending={analyze.isPending}
          progress={analyze.progress}
        />
      )}

      {analyze.isError && (
        <div style={css("margin-bottom:20px;")}>
          <ErrorNote error={analyze.error} />
        </div>
      )}

      {analysis && <Analyzed resume={resume} analysis={analysis} />}
    </div>
  );
}

/**
 * Everything downstream of an analysis existing.
 *
 * Its own component because the rewrite state is a hook, and the page above it
 * returns early for a missing resume, a loading report and a failed one — so
 * calling it up there would be a conditional hook.
 */
function Analyzed({
  resume,
  analysis,
}: {
  resume: Resume;
  analysis: ResumeAnalysis;
}) {
  const improve = useResumeImprovement(resume.id, analysis);

  return (
    <ImproveProvider value={improve}>
      <AtsReportView
        analysis={analysis}
        fileName={resume.fileName}
        improve={<ImproveCard state={improve} />}
      />

      {/* After the findings, because it is the answer to one of them, and before
          the profile review, because it needs nothing from it. Accepted rewrites
          are handed in here: this is where they become a file. */}
      <div style={css("margin-top:34px; padding-top:28px; border-top:1px solid oklch(0.92 0.006 260);")}>
        <ResumeRebuild analysis={analysis} edits={improve.edits} />
      </div>

      <div style={css("margin-top:34px; padding-top:28px; border-top:1px solid oklch(0.92 0.006 260);")}>
        <ParsedResumeReview parsed={analysis.parsed} sample={analysis.sample} />
      </div>
    </ImproveProvider>
  );
}

function Header() {
  return (
    <>
      <h1 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0 0 8px;")}>
        Base resume
      </h1>
      <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 24px; max-width:640px;")}>
        One file, reviewed the way an applicant tracking system reads it — parse first, then the
        writing. Per-role keyword matching happens on each application, not here.
      </p>
    </>
  );
}

/** File identity, a link to the actual PDF, and the two destructive actions. */
function FileBar({ resume, onReplace }: { resume: Resume; onReplace: () => void }) {
  const fileUrl = useResumeFileUrl(resume);
  const remove = useDeleteResume();
  const [confirming, setConfirming] = useState(false);

  return (
    <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; background:#fff; padding:15px 18px; margin-bottom:22px; display:flex; align-items:center; gap:14px; flex-wrap:wrap;")}>
      <div style={css("flex:1; min-width:220px;")}>
        <div style={css("font-size:14px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;")}>
          {resume.fileName}
        </div>
        <div style={css("font-family:'IBM Plex Mono'; font-size:11.5px; color:oklch(0.55 0.015 260); margin-top:3px;")}>
          {fileSize(resume.byteSize)} · uploaded {shortDate(resume.createdAt)}
          {resume.pageCount !== null ? ` · ${resume.pageCount} page${resume.pageCount === 1 ? "" : "s"}` : ""}
        </div>
      </div>

      {fileUrl.data && (
        <a
          href={fileUrl.data}
          target="_blank"
          rel="noreferrer"
          style={css("font-size:13px; font-weight:600;")}
        >
          Open the PDF
        </a>
      )}
      <SecondaryButton onClick={onReplace}>Replace</SecondaryButton>
      <SecondaryButton
        onClick={() => (confirming ? remove.mutate(resume) : setConfirming(true))}
        disabled={remove.isPending}
        style={confirming ? { color: "oklch(0.5 0.14 25)" } : undefined}
      >
        {remove.isPending ? "Removing…" : confirming ? "Really remove it?" : "Remove"}
      </SecondaryButton>

      {remove.isError && (
        <div style={css("flex-basis:100%;")}>
          <ErrorNote error={remove.error} />
        </div>
      )}
    </div>
  );
}

/**
 * A stored file with no analysis behind it. Which of the three reasons applies
 * is on the row itself, so the screen says the true one rather than a generic
 * "not ready".
 */
function NoReportYet({
  resume,
  onAnalyze,
  pending,
  progress,
}: {
  resume: Resume;
  onAnalyze: () => void;
  pending: boolean;
  progress: AnalysisProgressState;
}) {
  const stalled = isAnalysisStale(resume);

  if (pending || (resume.status === "analyzing" && !stalled)) {
    return (
      <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; background:#fff; padding:34px; text-align:center;")}>
        {progress ? (
          <ProgressBar
            step={progress.step}
            total={progress.total}
            label={progress.label}
            waiting={progress.waiting}
            note="Reading a resume properly takes about a minute."
          />
        ) : (
          <>
            <div style={css("display:flex; justify-content:center; margin-bottom:14px;")}>
              <Spinner />
            </div>
            <div style={css("font-size:15px; font-weight:600;")}>Reading your resume…</div>
            <p style={css("font-size:13px; color:oklch(0.5 0.015 260); line-height:1.6; margin:6px auto 0; max-width:420px;")}>
              {/* No bar: this is a run started somewhere else, so its progress
                  isn't being reported to this tab. */}
              Started in another tab or before a reload. This page updates itself when it lands.
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={css("display:flex; flex-direction:column; gap:14px;")}>
      {resume.status === "failed" && resume.error && (
        // Verbatim: a refusal ("that's your third analysis today") is the only
        // way the user learns which limit they hit.
        <ErrorNote error={new Error(resume.error)} />
      )}

      <div style={css("border:1px dashed oklch(0.85 0.008 260); border-radius:13px; background:#fff; padding:26px; text-align:center;")}>
        <div style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600; margin-bottom:6px;")}>
          {resume.status === "failed" && "The last analysis didn't finish"}
          {stalled && "The last analysis stopped partway"}
          {resume.status === "uploaded" && "Stored, not analyzed yet"}
        </div>
        <p style={css("font-size:13px; color:oklch(0.5 0.015 260); line-height:1.6; margin:0 auto 18px; max-width:440px;")}>
          {stalled
            ? "It started but never reported back, and nothing is running now. The file is untouched, so it's safe to start again."
            : "The file is in your account. Running the analysis reads it end to end and produces both the report and the structured parse."}
        </p>
        <PrimaryButton onClick={onAnalyze} disabled={pending}>
          {resume.status === "uploaded" ? "Analyze this resume" : "Try the analysis again"}
        </PrimaryButton>
        {!ai.supportsResumeParsing && (
          <div style={css("font-size:12px; color:oklch(0.45 0.09 55); line-height:1.55; margin-top:12px;")}>
            Local mode — this returns a labelled sample rather than reading your file, and nothing
            gets saved.
          </div>
        )}
      </div>
    </div>
  );
}
