import { useEffect, useMemo, useState } from "react";
import type { AtsKind, DetectedJob } from "../content/detect";
import { runAutofill, type FillReport } from "../content/autofill";
import {
  checkSignedIn,
  editTailoredResume,
  enrichSkillGaps,
  findOrCreateApplication,
  loadProfile,
  saveTailoredResume,
  tailorResume,
  NotSignedInError,
} from "../lib/api";
import type {
  ApplicationRecord,
  AtsKeyword,
  MissingSkillPrompt,
  ProfileRecord,
  ResumeFields,
  TailoringChange,
} from "../lib/types";
import { Badge, Button, ErrorNote, Label, Spinner, TextArea, TextInput } from "./ui";
import { colors, font } from "./theme";

type Step =
  | "checking"
  | "signedOut"
  | "idle"
  | "scanning"
  | "gapReview"
  | "generating"
  | "result"
  | "filling"
  | "done";

const ATS_LABEL: Record<AtsKind, string> = {
  greenhouse: "Greenhouse",
  generic: "Careers page",
};

export function App({ ats, initialJob, onClose }: { ats: AtsKind; initialJob: DetectedJob; onClose: () => void }) {
  const [step, setStep] = useState<Step>("checking");
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const [job, setJob] = useState<DetectedJob>(initialJob);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [application, setApplication] = useState<ApplicationRecord | null>(null);
  const [fields, setFields] = useState<ResumeFields | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [changes, setChanges] = useState<TailoringChange[]>([]);
  const [keywords, setKeywords] = useState<AtsKeyword[]>([]);
  const [missingSkills, setMissingSkills] = useState<MissingSkillPrompt[]>([]);
  const [briefs, setBriefs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [tweakText, setTweakText] = useState("");
  const [lastTweak, setLastTweak] = useState<string | null>(null);
  const [tweaking, setTweaking] = useState(false);
  const [fillReport, setFillReport] = useState<FillReport | null>(null);

  useEffect(() => {
    checkSignedIn().then(({ signedIn, email }) => {
      setSignedInEmail(email);
      setStep(signedIn ? "idle" : "signedOut");
    });
  }, []);

  useEffect(() => {
    if (step !== "idle" && step !== "signedOut") return;
    loadProfile()
      .then(setProfile)
      .catch(() => undefined);
  }, [step]);

  const templateId = application?.templateId ?? profile?.defaultTemplateId ?? "classic";

  async function startTailor() {
    setError(null);
    setStep("scanning");
    try {
      const app = await findOrCreateApplication({
        company: job.company,
        role: job.role,
        postingUrl: job.postingUrl || null,
        jobDescription: job.jobDescription,
      });
      setApplication(app);
      const result = await tailorResume(app.id);
      setFields(result.fields);
      setSummary(result.summary);
      setChanges(result.changes);
      setKeywords(result.keywords);
      setMissingSkills(result.missingSkills);

      if (result.missingSkills.length > 0) {
        setStep("gapReview");
        return;
      }
      await saveTailoredResume(app.id, result.fields, {
        summary: result.summary,
        changes: result.changes,
        keywords: result.keywords,
        missingSkills: [],
        variant: result.variant,
      });
      setStep("result");
    } catch (e) {
      setError(messageOf(e));
      setStep(e instanceof NotSignedInError ? "signedOut" : "idle");
    }
  }

  async function continueFromGaps(skip: boolean) {
    if (!application || !fields) return;
    setError(null);
    setStep("generating");
    try {
      const briefList = skip
        ? []
        : missingSkills
            .map((g) => ({ skill: g.skill, text: (briefs[g.skill] ?? "").trim() }))
            .filter((b) => b.text.length >= 8);
      const enrichResult = await enrichSkillGaps(application.id, fields, briefList);
      setFields(enrichResult.fields);
      await saveTailoredResume(application.id, enrichResult.fields, {
        summary,
        changes,
        keywords,
        missingSkills: [],
        variant: null,
      });
      setStep("result");
    } catch (e) {
      setError(messageOf(e));
      setStep("gapReview");
    }
  }

  async function applyTweak() {
    if (!application || !fields || !tweakText.trim()) return;
    setError(null);
    setTweaking(true);
    try {
      const result = await editTailoredResume(application.id, fields, tweakText.trim());
      setFields(result.fields);
      setChanges(result.changes);
      setLastTweak(tweakText.trim());
      setTweakText("");
      await saveTailoredResume(application.id, result.fields, { summary, changes: result.changes, keywords, missingSkills: [], variant: null });
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setTweaking(false);
    }
  }

  async function startAutofill() {
    if (!fields) return;
    setError(null);
    setStep("filling");
    try {
      const report = await runAutofill(ats, fields, profile, templateId);
      setFillReport(report);
      setStep("done");
    } catch (e) {
      setError(messageOf(e));
      setStep("result");
    }
  }

  return (
    <div
      style={{
        width: 380,
        maxHeight: 640,
        display: "flex",
        flexDirection: "column",
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        boxShadow: "0 24px 60px -20px rgba(20,20,30,0.35), 0 0 0 1px rgba(0,0,0,0.03)",
        overflow: "hidden",
        fontFamily: font,
        color: colors.text,
      }}
    >
      <Header onClose={onClose} ats={ats} company={job.company} />
      <div style={{ padding: "16px 16px 18px", overflowY: "auto", flex: 1 }}>
        {error && <ErrorNote>{error}</ErrorNote>}

        {step === "checking" && (
          <Centered>
            <Spinner />
          </Centered>
        )}

        {step === "signedOut" && <SignedOutPanel onRetry={() => checkSignedIn().then(({ signedIn, email }) => {
          setSignedInEmail(email);
          setStep(signedIn ? "idle" : "signedOut");
        })} />}

        {step === "idle" && (
          <IdlePanel
            ats={ats}
            job={job}
            onChangeJob={setJob}
            profile={profile}
            onStart={startTailor}
          />
        )}

        {(step === "scanning" || step === "generating") && (
          <Centered>
            <Spinner size={32} />
            <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 16 }}>
              {step === "scanning" ? "Reading the job description…" : "Tailoring your resume for this role…"}
            </div>
            <div style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 4 }}>
              {step === "scanning" ? "Comparing it against your profile" : "Matching language only. Nothing invented."}
            </div>
          </Centered>
        )}

        {step === "gapReview" && (
          <GapReviewPanel
            missingSkills={missingSkills}
            briefs={briefs}
            onBriefChange={(skill, value) => setBriefs((b) => ({ ...b, [skill]: value }))}
            onSubmit={() => continueFromGaps(false)}
            onSkip={() => continueFromGaps(true)}
          />
        )}

        {step === "result" && fields && (
          <ResultPanel
            summary={summary}
            changes={changes}
            keywords={keywords}
            fields={fields}
            showPreview={showPreview}
            onTogglePreview={() => setShowPreview((v) => !v)}
            tweakText={tweakText}
            onTweakChange={setTweakText}
            onApplyTweak={applyTweak}
            tweaking={tweaking}
            lastTweak={lastTweak}
          />
        )}

        {step === "filling" && (
          <Centered>
            <Spinner size={32} />
            <div style={{ fontWeight: 600, fontSize: 14.5, marginTop: 16 }}>Filling this page…</div>
            <div style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 4 }}>
              Name, contact, links, and the fields we recognise.
            </div>
          </Centered>
        )}

        {step === "done" && fillReport && (
          <DonePanel report={fillReport} company={job.company} onDone={onClose} onTweak={() => setStep("result")} />
        )}
      </div>

      {step === "result" && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${colors.border}` }}>
          <Button full size="lg" onClick={startAutofill}>
            Autofill this page
          </Button>
        </div>
      )}

      <div style={{ padding: "8px 16px 10px", fontSize: 10.5, color: colors.textMuted, textAlign: "center" }}>
        {signedInEmail ?? ""}
      </div>
    </div>
  );
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong.";
}

function Header({ onClose, ats, company }: { onClose: () => void; ats: AtsKind; company: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "13px 14px",
        borderBottom: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
        <div
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: colors.primary,
            flexShrink: 0,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>PrepFor.Me</div>
          <div style={{ fontSize: 11, color: colors.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {ATS_LABEL[ats]} · {company}
          </div>
        </div>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, fontSize: 16, lineHeight: 1, padding: 4 }}
      >
        ×
      </button>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "36px 8px", textAlign: "center" }}>{children}</div>;
}

function SignedOutPanel({ onRetry }: { onRetry: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 4px" }}>
      <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 6 }}>Sign in to PrepFor.Me first</div>
      <p style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 16px" }}>
        Open your PrepFor.Me tab and sign in there — this panel reuses that session, so nothing needs to be typed here.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        I've signed in — check again
      </Button>
    </div>
  );
}

function IdlePanel({
  ats,
  job,
  onChangeJob,
  profile,
  onStart,
}: {
  ats: AtsKind;
  job: DetectedJob;
  onChangeJob: (job: DetectedJob) => void;
  profile: ProfileRecord | null;
  onStart: () => void;
}) {
  const jdTooShort = job.jobDescription.trim().length < 40;
  return (
    <div>
      <Label>Company</Label>
      <TextInput
        value={job.company}
        onChange={(e) => onChangeJob({ ...job, company: e.target.value })}
        style={{ marginBottom: 10 }}
      />
      <Label>Role</Label>
      <TextInput value={job.role} onChange={(e) => onChangeJob({ ...job, role: e.target.value })} style={{ marginBottom: 14 }} />

      {ats === "generic" && (
        <div style={{ fontSize: 11.5, color: colors.textMuted, marginBottom: 14, lineHeight: 1.5 }}>
          We guessed the company, role, and job description from this page — fix anything above before tailoring, since it
          gets sent to the model as-is.
        </div>
      )}

      {jdTooShort && (
        <ErrorNote>
          We couldn't find much job-description text on this page. Tailoring will run on whatever we found, but it may be
          thin — check the page loaded fully.
        </ErrorNote>
      )}

      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: 9,
          padding: "10px 12px",
          marginBottom: 16,
          fontSize: 12,
          color: colors.textMuted,
          background: colors.bgMuted,
        }}
      >
        Uses your saved profile and base resume{profile?.fullName ? ` (${profile.fullName})` : ""}. Update those in
        PrepFor.Me if they're out of date.
      </div>

      <Button full size="lg" onClick={onStart} disabled={!job.company.trim() || !job.role.trim()}>
        Tailor &amp; autofill this page
      </Button>

      <p style={{ fontSize: 11.5, color: colors.textMuted, lineHeight: 1.55, margin: "12px 0 0" }}>
        We'll read the job description on this page and match it to your profile. You review every field — we never click
        submit for you.
      </p>
    </div>
  );
}

function GapReviewPanel({
  missingSkills,
  briefs,
  onBriefChange,
  onSubmit,
  onSkip,
}: {
  missingSkills: MissingSkillPrompt[];
  briefs: Record<string, string>;
  onBriefChange: (skill: string, value: string) => void;
  onSubmit: () => void;
  onSkip: () => void;
}) {
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 6 }}>A couple of skills to confirm</div>
      <p style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 16px" }}>
        This posting names skills we don't see on your resume. Add a quick note for any you've used — we'll add a skill and
        a bullet. Skip the rest.
      </p>
      {missingSkills.map((g) => (
        <div key={g.skill} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{g.skill}</div>
          <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 7, lineHeight: 1.45 }}>{g.prompt}</div>
          <TextArea
            placeholder="Skip if you haven't done this…"
            value={briefs[g.skill] ?? ""}
            onChange={(e) => onBriefChange(g.skill, e.target.value)}
          />
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <Button style={{ flex: 1 }} onClick={onSubmit}>
          Apply &amp; continue
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          Skip all
        </Button>
      </div>
    </div>
  );
}

function ResultPanel({
  summary,
  changes,
  keywords,
  fields,
  showPreview,
  onTogglePreview,
  tweakText,
  onTweakChange,
  onApplyTweak,
  tweaking,
  lastTweak,
}: {
  summary: string;
  changes: TailoringChange[];
  keywords: AtsKeyword[];
  fields: ResumeFields;
  showPreview: boolean;
  onTogglePreview: () => void;
  tweakText: string;
  onTweakChange: (v: string) => void;
  onApplyTweak: () => void;
  tweaking: boolean;
  lastTweak: string | null;
}) {
  const covered = useMemo(() => keywords.filter((k) => k.covered), [keywords]);
  const missing = useMemo(() => keywords.filter((k) => !k.covered), [keywords]);

  return (
    <div>
      <div
        style={{
          background: colors.successBg,
          color: colors.successText,
          border: `1px solid ${colors.success}`,
          borderRadius: 9,
          padding: "10px 12px",
          fontSize: 12.5,
          lineHeight: 1.5,
          marginBottom: 16,
        }}
      >
        {summary}
      </div>

      {changes.length > 0 && (
        <>
          <Label>What changed</Label>
          {changes.map((c, i) => (
            <div
              key={i}
              style={{
                border: `1px solid ${colors.border}`,
                borderRadius: 8,
                padding: "9px 10px",
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 11.5, color: colors.textMuted, textDecoration: "line-through", marginBottom: 3 }}>
                {c.before}
              </div>
              <div style={{ fontSize: 12.5, marginBottom: 3 }}>{c.after}</div>
              <div style={{ fontSize: 11, color: colors.textMuted, fontStyle: "italic" }}>{c.rationale}</div>
            </div>
          ))}
        </>
      )}

      {keywords.length > 0 && (
        <>
          <div style={{ marginTop: 14, marginBottom: 8 }}>
            <Label>Keyword match</Label>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {covered.map((k) => (
              <Badge key={k.keyword} tone="success">
                {k.keyword}
              </Badge>
            ))}
            {missing.map((k) => (
              <Badge key={k.keyword} tone="warning">
                {k.keyword}
              </Badge>
            ))}
          </div>
        </>
      )}

      <Button variant="outline" size="sm" onClick={onTogglePreview} style={{ marginBottom: 14 }}>
        {showPreview ? "Hide preview" : "Preview resume"}
      </Button>

      {showPreview && <ResumePreview fields={fields} />}

      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Tweak this version</div>
        <p style={{ fontSize: 11.5, color: colors.textMuted, margin: "0 0 8px", lineHeight: 1.5 }}>
          Say exactly what to change — everything else stays as-is. Not a full re-tailor.
        </p>
        {lastTweak && (
          <div
            style={{
              fontSize: 11.5,
              color: colors.successText,
              background: colors.successBg,
              borderRadius: 6,
              padding: "6px 9px",
              marginBottom: 8,
            }}
          >
            ✓ Applied: "{lastTweak}"
          </div>
        )}
        <TextArea
          placeholder='e.g. "Make the headline Platform Engineer"'
          value={tweakText}
          onChange={(e) => onTweakChange(e.target.value)}
        />
        <Button size="sm" variant="outline" style={{ marginTop: 8 }} onClick={onApplyTweak} disabled={tweaking || !tweakText.trim()}>
          {tweaking ? "Applying…" : "Apply edit"}
        </Button>
      </div>
    </div>
  );
}

function ResumePreview({ fields }: { fields: ResumeFields }) {
  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 9,
        background: "#fff",
        padding: 14,
        marginBottom: 16,
        fontSize: 11.5,
        lineHeight: 1.5,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13.5 }}>{fields.fullName || "Your name"}</div>
      {fields.headline && <div style={{ color: colors.textMuted, marginBottom: 4 }}>{fields.headline}</div>}
      <div style={{ color: colors.textMuted, marginBottom: 8 }}>
        {[fields.email, fields.phone, fields.location].filter(Boolean).join(" · ")}
      </div>
      {fields.summary && <div style={{ marginBottom: 8 }}>{fields.summary}</div>}
      {fields.experiences.slice(0, 2).map((exp, i) => (
        <div key={i} style={{ marginBottom: 6 }}>
          <div style={{ fontWeight: 600 }}>
            {exp.title} — {exp.company}
          </div>
          <ul style={{ margin: "3px 0 0 16px", padding: 0 }}>
            {exp.bullets.slice(0, 2).map((b, j) => (
              <li key={j}>{b}</li>
            ))}
          </ul>
        </div>
      ))}
      {fields.skills.length > 0 && (
        <div style={{ color: colors.textMuted, marginTop: 6 }}>{fields.skills.join(" · ")}</div>
      )}
    </div>
  );
}

function DonePanel({
  report,
  company,
  onDone,
  onTweak,
}: {
  report: FillReport;
  company: string;
  onDone: () => void;
  onTweak: () => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, color: colors.successText, marginBottom: 14 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.success, flexShrink: 0 }} />
        {report.filled.length > 0 ? `Filled ${report.filled.length} field${report.filled.length === 1 ? "" : "s"}` : "Nothing matched automatically"}
      </div>

      {report.filled.map((label) => (
        <div key={label} style={{ display: "flex", gap: 9, fontSize: 12.5, marginBottom: 8 }}>
          <span style={{ color: colors.success }}>✓</span>
          <span>{label}</span>
        </div>
      ))}

      {report.flagged.length > 0 && (
        <>
          <div style={{ height: 1, background: colors.border, margin: "10px 0 12px" }} />
          {report.flagged.map((label) => (
            <div key={label} style={{ display: "flex", gap: 9, fontSize: 12.5, color: colors.warningText, marginBottom: 8 }}>
              <span>!</span>
              <span>{label}</span>
            </div>
          ))}
        </>
      )}

      <div
        style={{
          background: colors.bgMuted,
          border: `1px solid ${colors.border}`,
          borderRadius: 9,
          padding: "10px 12px",
          fontSize: 12,
          color: colors.textMuted,
          lineHeight: 1.55,
          margin: "12px 0 16px",
        }}
      >
        Review every field, then click <strong style={{ color: colors.text }}>{company}'s own submit button</strong>.
        PrepFor.Me never submits for you.
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <Button style={{ flex: 1 }} onClick={onDone}>
          Got it — I'll review
        </Button>
        <Button variant="outline" onClick={onTweak}>
          Tweak resume
        </Button>
      </div>
    </div>
  );
}
