import type { ReactNode } from "react";
import { css } from "../../css";
import { ATS_CATEGORY_IDS } from "../../lib/ai";
import type {
  AtsCategory,
  AtsCategoryId,
  AtsFinding,
  AtsSeverity,
  ResumeAnalysis,
} from "../../lib/ai";
import { EditRow, useFindingRewrite } from "./ResumeImprove";
import { Eyebrow } from "../ui";

/**
 * The base-resume review. Every number and every quoted line here comes from
 * the provider's report — nothing is recomputed in the UI, so what the user
 * reads is what the analysis said.
 */

interface SeverityLook {
  label: string;
  /** The heading a fix sits under, which reads differently once it's passing. */
  fixLabel: string;
  mark: string;
  fg: string;
  bg: string;
  border: string;
}

const SEVERITY: Record<AtsSeverity, SeverityLook> = {
  critical: {
    label: "Critical",
    fixLabel: "Fix",
    mark: "!",
    fg: "oklch(0.45 0.12 25)",
    bg: "oklch(0.6 0.16 25 / 0.07)",
    border: "oklch(0.6 0.16 25 / 0.28)",
  },
  warning: {
    label: "Worth fixing",
    fixLabel: "Fix",
    mark: "△",
    fg: "oklch(0.42 0.1 55)",
    bg: "oklch(0.65 0.14 60 / 0.09)",
    border: "oklch(0.65 0.14 60 / 0.3)",
  },
  pass: {
    label: "Passing",
    fixLabel: "Keeps it passing",
    mark: "✓",
    fg: "oklch(0.33 0.09 150)",
    bg: "oklch(0.55 0.13 145 / 0.07)",
    border: "oklch(0.55 0.13 145 / 0.25)",
  },
};

const SEVERITY_RANK: Record<AtsSeverity, number> = { critical: 0, warning: 1, pass: 2 };

/** One definition of where green becomes amber becomes red, used off-screen too. */
export function scoreColor(score: number): string {
  if (score >= 80) return "oklch(0.5 0.13 145)";
  if (score >= 60) return "oklch(0.58 0.14 60)";
  return "oklch(0.55 0.16 25)";
}

export function AtsReportView({
  analysis,
  fileName,
  /**
   * The rewrite card, rendered between the summary and the ranked fixes. Passed
   * in rather than built here so this component stays a pure reading of the
   * report and knows nothing about what a rewrite costs.
   */
  improve,
}: {
  analysis: ResumeAnalysis;
  fileName?: string | null;
  improve?: ReactNode;
}) {
  const { report } = analysis;
  const categories = ATS_CATEGORY_IDS.map((id) => report.categories[id]);

  return (
    <div style={css("display:flex; flex-direction:column; gap:22px;")}>
      {analysis.sample && <SampleBanner />}

      <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:14px; background:#fff; padding:22px; display:flex; gap:22px; align-items:flex-start;")}>
        <ScoreBadge score={report.overallScore} />
        <div style={css("flex:1; min-width:0;")}>
          <Eyebrow style={{ marginBottom: "7px" }}>
            {fileName ? `Base resume · ${fileName}` : "Base resume"}
          </Eyebrow>
          <p style={css("font-size:14px; line-height:1.65; color:oklch(0.3 0.015 260); margin:0;")}>
            {report.summary}
          </p>
          <div style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.55 0.015 260); margin-top:12px;")}>
            scored by {analysis.model}
          </div>
        </div>
      </div>

      <ScoreStrip categories={categories} />

      {improve}

      {report.topFixes.length > 0 && (
        <div>
          <Eyebrow style={{ marginBottom: "12px" }}>Start here · highest leverage first</Eyebrow>
          <div style={css("display:flex; flex-direction:column; gap:10px;")}>
            {report.topFixes.map((fix, i) => {
              const look = SEVERITY[fix.severity];
              return (
                <div
                  key={`${fix.category}-${i}`}
                  style={{
                    ...css("border-radius:12px; padding:14px 16px; display:flex; gap:14px; align-items:flex-start;"),
                    background: look.bg,
                    border: `1px solid ${look.border}`,
                  }}
                >
                  <span
                    style={{
                      ...css("font-family:'IBM Plex Mono'; font-size:12px; font-weight:600; flex:0 0 auto; width:18px; text-align:center;"),
                      color: look.fg,
                    }}
                  >
                    {i + 1}
                  </span>
                  <div style={css("min-width:0;")}>
                    <div style={css("display:flex; align-items:center; gap:9px; flex-wrap:wrap;")}>
                      <span style={css("font-size:14px; font-weight:600;")}>{fix.title}</span>
                      <SeverityChip severity={fix.severity} />
                      <span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; letter-spacing:0.08em; text-transform:uppercase; color:oklch(0.55 0.015 260);")}>
                        {report.categories[fix.category].label}
                      </span>
                    </div>
                    <div style={css("font-size:13px; line-height:1.6; color:oklch(0.35 0.015 260); margin-top:5px;")}>
                      {fix.fix}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <Eyebrow style={{ marginBottom: "12px" }}>The seven categories</Eyebrow>
        <div style={css("display:flex; flex-direction:column; gap:14px;")}>
          {categories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      </div>

      <div style={css("border:1px dashed oklch(0.85 0.008 260); border-radius:12px; padding:16px 18px; background:#fff;")}>
        <div style={css("font-size:13px; font-weight:600; margin-bottom:5px;")}>
          This report doesn't check keywords against a job
        </div>
        <p style={css("font-size:12.5px; line-height:1.6; color:oklch(0.5 0.015 260); margin:0;")}>
          A match score needs something to match against, and a base resume has no posting attached
          to it. Keyword coverage is measured per role, on each application's Materials tab, against
          the job description you paste there.
        </p>
      </div>
    </div>
  );
}

/**
 * The one thing on this screen the user must not miss: no model saw their file.
 * Keyed off the analysis's own `sample` flag, not off which provider is wired
 * up — a real provider can still hand back a sample.
 */
function SampleBanner() {
  return (
    <div style={css("border:1px solid oklch(0.65 0.14 60 / 0.45); background:oklch(0.7 0.15 60 / 0.12); border-radius:12px; padding:14px 16px; display:flex; gap:12px; align-items:flex-start;")}>
      <span style={css("font-size:15px; line-height:1.3;")}>⚠</span>
      <div>
        <div style={css("font-size:13.5px; font-weight:600; color:oklch(0.4 0.1 55);")}>
          Sample output — local mode, no model was called
        </div>
        <div style={css("font-size:12.5px; line-height:1.6; color:oklch(0.42 0.07 55); margin-top:4px;")}>
          Nothing below was read off your file, and none of it was saved to your account. It's a
          fixture, here so this screen can be built and checked without spending anything.
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <div
      style={{
        ...css("flex:0 0 auto; width:92px; height:92px; border-radius:16px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;"),
        background: `color-mix(in oklab, ${color} 10%, #fff)`,
        border: `1px solid color-mix(in oklab, ${color} 32%, #fff)`,
      }}
    >
      <span style={{ ...css("font-family:'Space Grotesk'; font-size:32px; font-weight:600; line-height:1;"), color }}>
        {score}
      </span>
      <span style={css("font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.55 0.015 260);")}>
        / 100
      </span>
    </div>
  );
}

/** All seven scores in one line, in the contract's order, before the detail. */
function ScoreStrip({ categories }: { categories: AtsCategory[] }) {
  return (
    <div style={css("display:grid; grid-template-columns:repeat(7, 1fr); gap:8px;")}>
      {categories.map((category) => (
        <div
          key={category.id}
          title={category.summary}
          style={css("border:1px solid oklch(0.92 0.006 260); border-radius:10px; background:#fff; padding:10px 8px; text-align:center;")}
        >
          <div style={{ ...css("font-family:'Space Grotesk'; font-size:17px; font-weight:600; line-height:1.2;"), color: scoreColor(category.score) }}>
            {category.score}
          </div>
          <div style={css("font-family:'IBM Plex Mono'; font-size:9.5px; letter-spacing:0.08em; text-transform:uppercase; color:oklch(0.55 0.015 260); margin-top:4px;")}>
            {category.id}
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryCard({ category }: { category: AtsCategory }) {
  const findings = [...category.findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );

  return (
    <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; background:#fff; overflow:hidden;")}>
      <div style={css("padding:16px 18px; border-bottom:1px solid oklch(0.95 0.006 260);")}>
        <div style={css("display:flex; align-items:baseline; justify-content:space-between; gap:14px;")}>
          <h3 style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600; margin:0;")}>
            {category.label}
          </h3>
          <span style={{ ...css("font-family:'Space Grotesk'; font-size:16px; font-weight:600;"), color: scoreColor(category.score) }}>
            {category.score}
            <span style={css("font-size:11px; color:oklch(0.6 0.015 260); font-weight:400;")}> /100</span>
          </span>
        </div>
        <div style={css("height:4px; border-radius:2px; background:oklch(0.94 0.006 260); margin:10px 0 11px; overflow:hidden;")}>
          <div
            style={{
              ...css("height:100%; border-radius:2px; transform-origin:left; animation:growBar .5s ease both;"),
              width: `${Math.max(0, Math.min(100, category.score))}%`,
              background: scoreColor(category.score),
            }}
          ></div>
        </div>
        <p style={css("font-size:13px; line-height:1.6; color:oklch(0.45 0.015 260); margin:0;")}>
          {category.summary}
        </p>
      </div>

      {findings.length === 0 ? (
        <div style={css("padding:14px 18px; font-size:12.5px; color:oklch(0.5 0.015 260); line-height:1.6;")}>
          Nothing flagged here — no changes to make.
        </div>
      ) : (
        <div style={css("display:flex; flex-direction:column;")}>
          {findings.map((finding, i) => (
            <FindingRow
              key={`${category.id}-${i}`}
              category={category.id}
              finding={finding}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FindingRow({
  category,
  finding,
}: {
  category: AtsCategoryId;
  finding: AtsFinding;
}) {
  const look = SEVERITY[finding.severity];
  // Null unless a rewrite pass has produced one for this exact finding, so the
  // report reads identically before anyone asks for rewrites.
  const { edit, state } = useFindingRewrite(category, finding.title);
  return (
    <div style={css("padding:15px 18px; border-top:1px solid oklch(0.96 0.004 260);")}>
      <div style={css("display:flex; align-items:center; gap:9px; flex-wrap:wrap; margin-bottom:6px;")}>
        <span style={css("font-size:13.5px; font-weight:600;")}>{finding.title}</span>
        <SeverityChip severity={finding.severity} />
      </div>
      <p style={css("font-size:13px; line-height:1.65; color:oklch(0.42 0.015 260); margin:0;")}>
        {finding.detail}
      </p>

      {finding.evidence && (
        <figure style={css("margin:11px 0 0; padding:0;")}>
          <figcaption style={css("font-family:'IBM Plex Mono'; font-size:10px; letter-spacing:0.09em; text-transform:uppercase; color:oklch(0.58 0.015 260); margin-bottom:5px;")}>
            From your resume
          </figcaption>
          <blockquote style={css("margin:0; font-family:'IBM Plex Mono'; font-size:12px; line-height:1.65; color:oklch(0.32 0.02 260); background:oklch(0.975 0.004 260); border-left:3px solid oklch(0.82 0.01 260); border-radius:0 8px 8px 0; padding:10px 13px;")}>
            “{finding.evidence}”
          </blockquote>
        </figure>
      )}

      <div
        style={{
          ...css("margin-top:11px; border-radius:9px; padding:10px 13px; font-size:12.5px; line-height:1.6;"),
          background: look.bg,
          border: `1px solid ${look.border}`,
          color: look.fg,
        }}
      >
        <strong>{look.fixLabel}:</strong> {finding.fix}
      </div>

      {edit && state ? <EditRow edit={edit} state={state} /> : null}
    </div>
  );
}

function SeverityChip({ severity }: { severity: AtsSeverity }) {
  const look = SEVERITY[severity];
  return (
    <span
      style={{
        ...css("display:inline-flex; align-items:center; gap:5px; font-family:'IBM Plex Mono'; font-size:10.5px; letter-spacing:0.06em; text-transform:uppercase; padding:3px 9px; border-radius:100px;"),
        color: look.fg,
        background: look.bg,
        border: `1px solid ${look.border}`,
      }}
    >
      <span aria-hidden="true">{look.mark}</span>
      {look.label}
    </span>
  );
}
