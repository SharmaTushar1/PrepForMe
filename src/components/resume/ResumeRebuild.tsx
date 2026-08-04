import { useMemo, useState } from "react";
import { css } from "../../css";
import type { AtsLayout, ResumeAnalysis, ResumeEdit } from "../../lib/ai";
import {
  buildResumeDocument,
  REBUILD_EFFECTS,
  SECTION_ORDER,
} from "../../lib/resume/document";
import { renderDocx } from "../../lib/resume/docx";
import { applyAcceptedEdits } from "../../lib/resume/edits";
import { pdfUnsupportedCharacters, renderPdf } from "../../lib/resume/pdf";
import { ErrorNote, Eyebrow, PrimaryButton, SecondaryButton } from "../ui";

/**
 * The offer to rebuild the resume in a layout a parser can read.
 *
 * Framed throughout as producing a *new document*, never as fixing the user's
 * file, because the second is not something anyone can honestly promise: PDF
 * records where marks sit on a page rather than a flow of text, so turning a
 * two-column export into one column means re-flowing a document that has no
 * flow to re-flow. What is achievable — and what this does — is writing a fresh
 * file from the parse, with their words carried across untouched.
 *
 * Nothing here calls a model. The rebuild reads the parse that was already paid
 * for, so it is free, instant, and repeatable.
 */

interface LayoutCopy {
  /** The heading, which is the finding stated plainly. */
  title: string;
  detail: string;
  /** Whether the rebuild is the recommended action or merely available. */
  urgent: boolean;
}

const LAYOUT_COPY: Record<AtsLayout, LayoutCopy> = {
  single_column_text: {
    title: "Your layout is already the kind parsers handle",
    detail:
      "One column of real text, so there is no reading order to get wrong. A rebuilt copy is here if you want a plainer version, but nothing about your current file's structure is costing you anything.",
    urgent: false,
  },
  multi_column: {
    title: "This resume is laid out in columns",
    detail:
      "Which column a parser reads first is up to the parser. Some interleave the two into a single run of nonsense, which is how a job title ends up recorded as an employer. A single-column version removes the question entirely.",
    urgent: true,
  },
  graphical: {
    title: "This resume is built from a design template",
    detail:
      "Text boxes, tables, icons and bars look deliberate on the page and arrive at a parser as either nothing at all or as text in an order nobody intended. A plain version carries the same words in a structure that survives extraction.",
    urgent: true,
  },
  scanned: {
    title: "This resume is an image of text",
    detail:
      "There is no text layer to extract, so a parser gets an empty document and a keyword search will never surface you. Anything read out of it here came from looking at the page. A rebuilt version is real text.",
    urgent: true,
  },
};

export function ResumeRebuild({
  analysis,
  edits = [],
}: {
  analysis: ResumeAnalysis;
  /** Suggestions for this report. Only the accepted ones reach the file. */
  edits?: readonly ResumeEdit[];
}) {
  const copy = LAYOUT_COPY[analysis.report.layout];
  const [failure, setFailure] = useState<unknown>(null);

  // Built once per analysis, and again whenever a suggestion is accepted or
  // undone: this is the same content both files render from, and `unsupported` is
  // what decides whether the PDF can be offered at all.
  const { document, unsupported, applied } = useMemo(() => {
    const substituted = applyAcceptedEdits(analysis.parsed, edits);
    const built = buildResumeDocument(substituted.parsed);
    return {
      document: built,
      unsupported: pdfUnsupportedCharacters(built),
      applied: substituted,
    };
  }, [analysis.parsed, edits]);

  const empty = document.blocks.length === 0;

  function download(kind: "docx" | "pdf") {
    setFailure(null);
    try {
      const blob = kind === "docx" ? renderDocx(document) : renderPdf(document);
      save(blob, `${document.fileStem}.${kind}`);
    } catch (error) {
      // A renderer throwing means a malformed file, and a malformed resume sent
      // to an employer is far worse than a download that refused.
      setFailure(error);
    }
  }

  return (
    <section>
      <Eyebrow style={{ marginBottom: "12px" }}>Rebuild it in a parser-safe layout</Eyebrow>

      <div
        style={{
          ...css("border-radius:14px; background:#fff; padding:22px;"),
          border: copy.urgent
            ? "1px solid oklch(0.65 0.14 60 / 0.4)"
            : "1px solid oklch(0.9 0.006 260)",
        }}
      >
        <h3 style={css("font-family:'Space Grotesk'; font-size:17px; font-weight:600; margin:0 0 7px;")}>
          {copy.title}
        </h3>
        <p style={css("font-size:13.5px; line-height:1.65; color:oklch(0.4 0.015 260); margin:0 0 18px; max-width:640px;")}>
          {copy.detail}
        </p>

        {analysis.sample && (
          <div style={css("border:1px solid oklch(0.65 0.14 60 / 0.45); background:oklch(0.7 0.15 60 / 0.12); border-radius:11px; padding:12px 14px; font-size:12.5px; line-height:1.6; color:oklch(0.4 0.1 55); margin-bottom:18px;")}>
            <strong>This would rebuild sample data, not your resume.</strong> No model has read your
            file, so the downloads below would contain a fixture's job history.
          </div>
        )}

        <div style={css("display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:18px; margin-bottom:20px;")}>
          <EffectList
            label="What the new file changes"
            items={REBUILD_EFFECTS.fixes}
            mark="→"
            markColor="oklch(0.5 0.13 145)"
          />
          <EffectList
            label="What it leaves alone"
            items={REBUILD_EFFECTS.leaves}
            mark="="
            markColor="oklch(0.55 0.015 260)"
          />
        </div>

        <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); line-height:1.6; margin-bottom:18px;")}>
          Sections come out in this order: {SECTION_ORDER.join(" · ")}. Skills sits high because it is
          three lines that answer the first question a recruiter skims for. Anything your resume
          doesn't have is left out rather than printed empty.
        </div>

        {applied.applied > 0 && (
          <div style={css("border:1px solid oklch(0.55 0.13 145 / 0.35); background:oklch(0.6 0.14 145 / 0.07); border-radius:11px; padding:13px 15px; font-size:12.5px; line-height:1.6; color:oklch(0.32 0.08 150); margin-bottom:18px;")}>
            <strong>
              {applied.applied} accepted rewrite{applied.applied === 1 ? "" : "s"} {applied.applied === 1 ? "is" : "are"} in
              {" "}this file.
            </strong>{" "}
            The lines you accepted above replace the originals; everything you left alone is
            unchanged.
            {applied.blanks.length > 0 && (
              // The one thing that makes a rebuilt file unsendable, so it is
              // said here as well as on the row — this is the screen someone is
              // on at the moment they download it.
              <>
                {" "}
                <span style={css("color:oklch(0.42 0.1 55);")}>
                  {applied.blanks.length === 1
                    ? "One of them still has a ___ in it"
                    : `${applied.blanks.length} of them still have a ___ in them`}
                  {" "}— fill in the number before you send this anywhere.
                </span>
              </>
            )}
          </div>
        )}

        {applied.missing.length > 0 && (
          // The resume was re-analyzed after these were written, so the lines
          // they replace are not in this parse. Saying which is more useful than
          // a count, since the rewrite text is still on screen above.
          <div style={css("border:1px solid oklch(0.65 0.14 60 / 0.4); background:oklch(0.7 0.15 60 / 0.08); border-radius:11px; padding:13px 15px; font-size:12.5px; line-height:1.6; color:oklch(0.4 0.09 55); margin-bottom:18px;")}>
            <strong>
              {applied.missing.length} accepted rewrite
              {applied.missing.length === 1 ? "" : "s"} could not be applied.
            </strong>{" "}
            The line{applied.missing.length === 1 ? "" : "s"} {applied.missing.length === 1 ? "it" : "they"}
            {" "}replaced {applied.missing.length === 1 ? "isn't" : "aren't"} in the current parse, which
            happens when the resume has been re-analyzed since. The rewrite text is still above if you
            want to paste it in by hand.
          </div>
        )}

        {analysis.partialParse ? (
          // Refused rather than rendered: this parse never looked for education,
          // projects or certifications, so a file built from it would be missing
          // sections the candidate has — and they would find out after sending
          // it. A stale report is not worth that, and re-running is one button.
          <div style={css("border:1px solid oklch(0.65 0.14 60 / 0.4); background:oklch(0.7 0.15 60 / 0.08); border-radius:11px; padding:14px 16px; font-size:13px; line-height:1.65; color:oklch(0.38 0.09 55);")}>
            <strong>This report is too old to rebuild from.</strong> It was produced before the
            analysis read education, projects and certifications, so a new file written from it would
            be missing whichever of those your resume has. Run the analysis again — that costs a model
            call — and the rebuild appears here.
          </div>
        ) : empty ? (
          <div style={css("font-size:13px; color:oklch(0.45 0.1 40); line-height:1.6;")}>
            There isn't enough in the parse to rebuild from yet — the report's parse section says what
            got in the way.
          </div>
        ) : (
          <>
            <div style={css("display:flex; align-items:center; gap:11px; flex-wrap:wrap;")}>
              <PrimaryButton onClick={() => download("docx")}>Download as Word</PrimaryButton>
              <SecondaryButton
                onClick={() => download("pdf")}
                disabled={unsupported.length > 0}
              >
                Download as PDF
              </SecondaryButton>
              <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.55 0.015 260);")}>
                {document.fileStem}
              </span>
            </div>

            {unsupported.length > 0 && (
              // Stated rather than silently degraded: the PDF fonts are the
              // fourteen every reader ships, and their encoding cannot express
              // these characters. Dropping them from someone's name would be
              // the worse failure by a distance.
              <div style={css("font-size:12.5px; color:oklch(0.45 0.1 40); line-height:1.6; margin-top:12px; max-width:620px;")}>
                The PDF is off because your resume uses characters its built-in fonts can't
                write: {unsupported.slice(0, 8).join(" ")}
                {unsupported.length > 8 ? " …" : ""}. The Word file handles them properly — open it and
                save as PDF from there if you need one.
              </div>
            )}

            <div style={css("font-size:12px; color:oklch(0.55 0.015 260); line-height:1.6; margin-top:12px; max-width:620px;")}>
              Your uploaded file isn't touched or replaced. Read the new one before you send it
              anywhere — it is generated from the parse, so anything the parse got wrong is in it too.
            </div>
          </>
        )}

        {failure ? (
          <div style={css("margin-top:14px;")}>
            <ErrorNote error={failure} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function EffectList({
  label,
  items,
  mark,
  markColor,
}: {
  label: string;
  items: readonly string[];
  mark: string;
  markColor: string;
}) {
  return (
    <div>
      <div style={css("font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:0.08em; text-transform:uppercase; color:oklch(0.55 0.015 260); margin-bottom:8px;")}>
        {label}
      </div>
      <ul style={css("list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:7px;")}>
        {items.map((item) => (
          <li key={item} style={css("display:flex; gap:8px; font-size:12.5px; line-height:1.55; color:oklch(0.35 0.015 260);")}>
            <span
              style={{
                ...css("font-family:'IBM Plex Mono'; font-size:11px; flex:0 0 auto; margin-top:1px;"),
                color: markColor,
              }}
            >
              {mark}
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Hand a Blob to the browser as a download.
 *
 * The object URL is revoked on the next tick rather than immediately: Safari
 * cancels an in-flight download if the URL disappears in the same frame as the
 * click.
 */
function save(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
