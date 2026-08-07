import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { css } from "../../css";
import { ai } from "../../lib/ai";
import {
  resumeFileProblem,
  useAnalyzeResume,
  useUploadResume,
  type AnalysisProgressState,
  type UploadPhase,
} from "../../data/resumes";
import type { ResumeAnalysis } from "../../lib/ai";
import { ErrorNote, PrimaryButton, ProgressBar, SecondaryButton, Spinner } from "../ui";

/**
 * The way a PDF gets into the product: validated in the browser, then put in
 * the private bucket. Storing and analyzing are two presses, not one — the
 * analysis is the only part that calls a model, so it is never triggered by
 * choosing a file.
 */
export function ResumeUploadCard({
  onUploaded,
  onAnalyzed,
  footer,
}: {
  /** Fired once the file is stored. Nothing has read it at this point. */
  onUploaded?: (resumeId: string) => void;
  /** Fired when an analysis started from this card completes. */
  onAnalyzed?: (analysis: ResumeAnalysis) => void;
  /** Alternatives to uploading, rendered under the drop zone by the caller. */
  footer?: ReactNode;
}) {
  const upload = useUploadResume();
  const analyze = useAnalyzeResume();
  const fileInput = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ name: string; size: number } | null>(null);

  async function accept(file: File | undefined | null) {
    if (!file || upload.isPending) return;
    const problem = resumeFileProblem(file);
    setRejected(problem);
    if (problem) return;

    setPicked({ name: file.name, size: file.size });
    upload.reset();
    try {
      const result = await upload.mutateAsync({ file, onPhase: setPhase });
      onUploaded?.(result.resumeId);
    } catch {
      // The message the user needs is on the mutation, rendered below.
    } finally {
      setPhase("idle");
    }
  }

  async function startAnalysis(resumeId: string) {
    analyze.reset();
    try {
      onAnalyzed?.(await analyze.mutateAsync({ resumeId }));
    } catch {
      // Same: the refusal or failure is rendered from the mutation.
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    accept(e.dataTransfer.files?.[0]);
  }

  if (upload.isPending) {
    return <UploadProgress phase={phase} fileName={picked?.name} />;
  }

  if (upload.isSuccess && upload.data) {
    return (
      <Stored
        fileName={picked?.name}
        analyzing={analyze.isPending}
        progress={analyze.progress}
        error={analyze.isError ? analyze.error : null}
        onAnalyze={() => startAnalysis(upload.data.resumeId)}
        onReplace={() => {
          upload.reset();
          analyze.reset();
          setPicked(null);
        }}
      />
    );
  }

  return (
    <div style={css("display:flex; flex-direction:column; gap:12px;")}>
      {upload.isError && <ErrorNote error={upload.error} />}
      {rejected && (
        <div style={css("border:1px solid oklch(0.65 0.14 60 / 0.4); background:oklch(0.7 0.15 60 / 0.1); border-radius:11px; padding:13px 15px; font-size:13px; line-height:1.6; color:oklch(0.4 0.1 55);")}>
          {rejected}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf,.pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          accept(e.target.files?.[0]);
          // Cleared so re-picking the same file after a rejection still fires.
          e.target.value = "";
        }}
      />

      <div
        onClick={() => fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{
          ...css("border-radius:14px; padding:28px 24px; text-align:center; cursor:pointer; transition:background .15s, border-color .15s;"),
          border: `2px dashed ${dragging ? "oklch(0.55 0.15 255 / 0.7)" : "oklch(0.85 0.01 260)"}`,
          background: dragging ? "oklch(0.55 0.15 255 / 0.06)" : "oklch(0.99 0.003 260)",
        }}
      >
        <div style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600; margin-bottom:5px;")}>
          {dragging ? "Drop it here" : "Drop your resume here"}
        </div>
        <p style={css("font-size:13px; color:oklch(0.5 0.015 260); line-height:1.6; margin:0 auto 16px; max-width:400px;")}>
          PDF only, up to 10 MB. We'll pull your info from this, then you'll generate a clean
          resume from a template — we don't restyle your original file.
        </p>
        {/*
          No onClick: this sits inside the drop zone, whose own handler opens the
          picker when the click bubbles up. Opening it here too queues a second
          dialog that replaces the first before its selection can be read, which
          looks like the file explorer reopening on every pick.
        */}
        <PrimaryButton>Choose a file</PrimaryButton>
        <div style={css("font-size:12px; color:oklch(0.55 0.015 260); line-height:1.55; margin-top:14px; max-width:420px; margin-left:auto; margin-right:auto;")}>
          Storing it reads nothing. You choose when to run the analysis, and nothing reaches your
          profile until you've reviewed what came back.
        </div>
      </div>

      {!ai.supportsResumeParsing && (
        <div style={css("border:1px solid oklch(0.65 0.14 60 / 0.35); background:oklch(0.7 0.15 60 / 0.08); border-radius:11px; padding:12px 14px; font-size:12.5px; line-height:1.6; color:oklch(0.42 0.09 55);")}>
          <strong>Local mode.</strong> No model is configured, so an analysis returns a labelled
          sample rather than a reading of your file, and nothing gets saved.
        </div>
      )}

      {footer}
    </div>
  );
}

const STEPS: { phase: UploadPhase; label: string; detail: string }[] = [
  { phase: "uploading", label: "Uploading the file", detail: "Straight into your own folder in a private bucket." },
  { phase: "saving", label: "Saving it to your account", detail: "So the analysis can read it server-side." },
];

function UploadProgress({ phase, fileName }: { phase: UploadPhase; fileName?: string }) {
  const current = STEPS.findIndex((s) => s.phase === phase);
  const index = current === -1 ? 0 : current;

  return (
    <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:14px; background:#fff; padding:24px;")}>
      <div style={css("display:flex; align-items:center; gap:14px; margin-bottom:18px;")}>
        <Spinner size={22} />
        <div style={css("min-width:0;")}>
          <div style={css("font-size:14.5px; font-weight:600;")}>{STEPS[index].label}…</div>
          {fileName && (
            <div style={css("font-family:'IBM Plex Mono'; font-size:11.5px; color:oklch(0.55 0.015 260); margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;")}>
              {fileName}
            </div>
          )}
        </div>
      </div>

      <div style={css("height:5px; border-radius:3px; background:oklch(0.94 0.006 260); overflow:hidden; margin-bottom:16px;")}>
        <div
          style={{
            ...css("height:100%; border-radius:3px; background:oklch(0.55 0.15 255); transition:width .4s ease;"),
            width: `${((index + 1) / STEPS.length) * 100}%`,
          }}
        ></div>
      </div>

      <div style={css("display:flex; flex-direction:column; gap:9px;")}>
        {STEPS.map((step, i) => (
          <div key={step.phase} style={css("display:flex; gap:10px; align-items:flex-start;")}>
            <span
              style={{
                ...css("font-family:'IBM Plex Mono'; font-size:11px; flex:0 0 auto; width:14px; text-align:center; line-height:1.5;"),
                color: i < index ? "oklch(0.5 0.13 145)" : i === index ? "oklch(0.5 0.15 255)" : "oklch(0.78 0.01 260)",
              }}
            >
              {i < index ? "✓" : "•"}
            </span>
            <div>
              <div
                style={{
                  ...css("font-size:12.5px; line-height:1.5;"),
                  color: i <= index ? "oklch(0.3 0.02 260)" : "oklch(0.65 0.015 260)",
                  fontWeight: i === index ? 600 : 400,
                }}
              >
                {step.label}
              </div>
              {i === index && (
                <div style={css("font-size:12px; color:oklch(0.55 0.015 260); line-height:1.5; margin-top:2px;")}>
                  {step.detail}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Stored, waiting to be read. The second press lives here rather than in the
 * upload, so the model call is always something the user asked for.
 */
function Stored({
  fileName,
  analyzing,
  progress,
  error,
  onAnalyze,
  onReplace,
}: {
  fileName?: string;
  analyzing: boolean;
  progress: AnalysisProgressState;
  error: unknown;
  onAnalyze: () => void;
  onReplace: () => void;
}) {
  if (analyzing) {
    return (
      <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:14px; background:#fff; padding:26px; text-align:center;")}>
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
            <div style={css("display:flex; justify-content:center; margin-bottom:13px;")}>
              <Spinner size={22} />
            </div>
            <div style={css("font-size:15px; font-weight:600;")}>Starting the analysis…</div>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={css("display:flex; flex-direction:column; gap:12px;")}>
      {error ? <ErrorNote error={error} /> : null}

      <div style={css("border:1px solid oklch(0.55 0.13 145 / 0.3); background:oklch(0.55 0.13 145 / 0.05); border-radius:14px; padding:20px;")}>
        <div style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600; margin-bottom:4px;")}>
          Stored{fileName ? ` — ${fileName}` : ""}
        </div>
        <p style={css("font-size:13px; line-height:1.6; color:oklch(0.42 0.015 260); margin:0 0 16px;")}>
          Nothing has read it yet. The analysis reads the file end to end and returns the report
          plus a structured parse of your roles for you to review.
        </p>
        <div style={css("display:flex; gap:10px; flex-wrap:wrap;")}>
          <PrimaryButton onClick={onAnalyze}>Analyze resume</PrimaryButton>
          <SecondaryButton onClick={onReplace}>Upload a different file</SecondaryButton>
        </div>
      </div>
    </div>
  );
}
