import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { css } from "../../css";
import type { AtsLayout, ResumeAnalysis, ResumeEdit } from "../../lib/ai";
import { applyAcceptedEdits } from "../../lib/resume/edits";
import { fieldsFromParsed } from "../../lib/resume/templates";
import { downloadResumePdf } from "../../lib/resume/pdfDownload";
import { ROUTES } from "../../routes";
import { ErrorNote, Eyebrow, PrimaryButton, SecondaryButton } from "../ui";

/**
 * Offer a parser-safe template PDF from the analysis parse.
 *
 * The hand-built PDF/DOCX path is retired: Generate on Profile and this
 * download both use Chromium + Classic/Compact HTML templates.
 */

interface LayoutCopy {
  title: string;
  detail: string;
  urgent: boolean;
}

const LAYOUT_COPY: Record<AtsLayout, LayoutCopy> = {
  single_column_text: {
    title: "Your layout is already the kind parsers handle",
    detail:
      "One column of real text, so there is no reading order to get wrong. A template PDF is here if you want a clean Classic or Compact export from this parse — or use Generate on your profile for the full spine.",
    urgent: false,
  },
  multi_column: {
    title: "This resume is laid out in columns",
    detail:
      "Which column a parser reads first is up to the parser. Generate a single-column template PDF from the parse (or from your profile spine) so reading order is never a question.",
    urgent: true,
  },
  graphical: {
    title: "This resume is built from a design template",
    detail:
      "Text boxes and tables arrive at a parser as nonsense or nothing. A Classic/Compact template PDF carries the same words in a structure that survives extraction.",
    urgent: true,
  },
  scanned: {
    title: "This resume is an image of text",
    detail:
      "There is no text layer to extract. Anything read here came from looking at the page. A template PDF from the parse is real text you can send.",
    urgent: true,
  },
};

export function ResumeRebuild({
  analysis,
  edits = [],
}: {
  analysis: ResumeAnalysis;
  edits?: readonly ResumeEdit[];
}) {
  const navigate = useNavigate();
  const copy = LAYOUT_COPY[analysis.report.layout];
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const { fields, applied } = useMemo(() => {
    const substituted = applyAcceptedEdits(analysis.parsed, edits);
    return {
      fields: fieldsFromParsed(substituted.parsed),
      applied: substituted,
    };
  }, [analysis.parsed, edits]);

  const empty =
    !fields.fullName &&
    fields.experiences.length === 0 &&
    fields.skills.length === 0;

  async function downloadPdf() {
    setFailure(null);
    setBusy(true);
    try {
      await downloadResumePdf({ templateId: "classic", fields });
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <Eyebrow style={{ marginBottom: "12px" }}>
        Generate a parser-safe template
      </Eyebrow>

      <div
        style={{
          ...css("border-radius:14px; background:#fff; padding:22px;"),
          border: copy.urgent
            ? "1px solid oklch(0.65 0.14 60 / 0.4)"
            : "1px solid oklch(0.9 0.006 260)",
        }}
      >
        <h3
          style={css(
            "font-family:'Space Grotesk'; font-size:17px; font-weight:600; margin:0 0 7px;",
          )}
        >
          {copy.title}
        </h3>
        <p
          style={css(
            "font-size:13.5px; line-height:1.65; color:oklch(0.4 0.015 260); margin:0 0 18px; max-width:640px;",
          )}
        >
          {copy.detail}
        </p>

        {analysis.sample && (
          <div
            style={css(
              "border:1px solid oklch(0.65 0.14 60 / 0.45); background:oklch(0.7 0.15 60 / 0.12); border-radius:11px; padding:12px 14px; font-size:12.5px; line-height:1.6; color:oklch(0.4 0.1 55); margin-bottom:18px;",
            )}
          >
            <strong>This would render sample data, not your resume.</strong> No
            model has read your file.
          </div>
        )}

        {applied.applied > 0 && (
          <div
            style={css(
              "border:1px solid oklch(0.55 0.13 145 / 0.35); background:oklch(0.6 0.14 145 / 0.07); border-radius:11px; padding:13px 15px; font-size:12.5px; line-height:1.6; color:oklch(0.32 0.08 150); margin-bottom:18px;",
            )}
          >
            <strong>
              {applied.applied} accepted rewrite
              {applied.applied === 1 ? " is" : "s are"} in this file.
            </strong>
            {applied.blanks.length > 0 && (
              <>
                {" "}
                <span style={css("color:oklch(0.42 0.1 55);")}>
                  {applied.blanks.length === 1
                    ? "One still has a ___ — fill it before sending."
                    : `${applied.blanks.length} still have a ___ — fill them before sending.`}
                </span>
              </>
            )}
          </div>
        )}

        {analysis.partialParse ? (
          <div
            style={css(
              "border:1px solid oklch(0.65 0.14 60 / 0.4); background:oklch(0.7 0.15 60 / 0.08); border-radius:11px; padding:14px 16px; font-size:13px; line-height:1.65; color:oklch(0.38 0.09 55);",
            )}
          >
            <strong>This report is too old to generate from.</strong> Re-run the
            analysis so education, projects and certifications are included.
          </div>
        ) : empty ? (
          <div
            style={css(
              "font-size:13px; color:oklch(0.45 0.1 40); line-height:1.6;",
            )}
          >
            There isn't enough in the parse to generate from yet.
          </div>
        ) : (
          <>
            <div
              style={css(
                "display:flex; align-items:center; gap:11px; flex-wrap:wrap;",
              )}
            >
              <PrimaryButton onClick={downloadPdf} disabled={busy}>
                {busy ? "Rendering PDF…" : "Download Classic PDF"}
              </PrimaryButton>
              <SecondaryButton onClick={() => navigate(ROUTES.profile)}>
                Generate on profile →
              </SecondaryButton>
            </div>
            <div
              style={css(
                "font-size:12px; color:oklch(0.55 0.015 260); line-height:1.6; margin-top:12px; max-width:620px;",
              )}
            >
              Word download is paused for now. Your uploaded file is never
              edited — this is a fresh template PDF from the parse.
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
