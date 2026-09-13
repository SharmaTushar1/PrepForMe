import { useEffect, useMemo, useState } from "react";
import type { AtsKind, DetectedJob } from "../content/detect";
import { runAutofill, type FillReport } from "../content/autofill";
import {
  checkSignedIn,
  editTailoredResume,
  enrichSkillGaps,
  findExistingApplication,
  findOrCreateApplication,
  loadProfile,
  saveTailoredResume,
  tailorResume,
  updateJobDescription,
  isAuthFailure,
  NotConfiguredError,
} from "../lib/api";
import { isConfigured } from "../lib/config";
import { sendMessageSafe, type ExtensionMessage, type StartSignInResponse } from "../lib/messages";
import type {
  ApplicationRecord,
  AtsKeyword,
  MissingSkillPrompt,
  ProfileRecord,
  ResumeFields,
  ResumeTemplateId,
  TailoringChange,
} from "../lib/types";
import { Badge, Button, ErrorNote, Label, Spinner, TextArea, TextInput } from "./ui";
import { ResumePdfPreview } from "./ResumePdfPreview";
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

/** Runs the extension's sign-in, tailoring, review, and autofill panel workflow. */
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
  const [showPreview, setShowPreview] = useState(true);
  const [tweakText, setTweakText] = useState("");
  const [lastTweak, setLastTweak] = useState<string | null>(null);
  const [tweaking, setTweaking] = useState(false);
  const [fillReport, setFillReport] = useState<FillReport | null>(null);
  const [savedTailored, setSavedTailored] = useState<ApplicationRecord | null>(null);
  const [lookingForSaved, setLookingForSaved] = useState(false);

  /** Moves the panel into its ready state after a session becomes available. */
  function applySignedIn(email: string | null) {
    setSignedInEmail(email);
    setError(null);
    setStep((current) => (current === "checking" || current === "signedOut" ? "idle" : current));
  }

  /** Clears an unusable session and returns the panel to its sign-in state. */
  async function forceSignIn(message?: string) {
    setSignedInEmail(null);
    setError(message ?? null);
    setStep("signedOut");
    await sendMessageSafe({ type: "CLEAR_SESSION" });
  }

  /** Displays an operation error and routes authentication failures to sign-in. */
  function handleCaughtError(e: unknown, fallbackStep: Step) {
    setError(messageOf(e));
    if (isAuthFailure(e) || /session has expired/i.test(messageOf(e))) {
      void forceSignIn(messageOf(e));
      return;
    }
    setStep(fallbackStep);
  }

  /** Restores tailored fields and session details from a saved application. */
  function hydrateFromSaved(app: ApplicationRecord) {
    if (!app.tailoredResume) return;
    setApplication(app);
    setFields(app.tailoredResume);
    if (app.tailorSession) {
      setSummary(app.tailorSession.summary);
      setChanges(app.tailorSession.changes);
      setKeywords(app.tailorSession.keywords);
      setMissingSkills(app.tailorSession.missingSkills);
    } else {
      setSummary("Previously tailored resume from PrepFor.Me.");
      setChanges([]);
      setKeywords([]);
      setMissingSkills([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    checkSignedIn().then(({ signedIn, email }) => {
      if (cancelled) return;
      if (signedIn) applySignedIn(email);
      else setStep("signedOut");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-detect sign-in: poll while signed out, and react when the background
  // broadcasts that a session just landed (after the login tab finishes).
  useEffect(() => {
    if (step !== "signedOut") return;

    let cancelled = false;
    const tick = () => {
      checkSignedIn().then(({ signedIn, email }) => {
        if (!cancelled && signedIn) applySignedIn(email);
      });
    };
    tick();
    const id = window.setInterval(tick, 1500);

    const onMessage = (message: ExtensionMessage) => {
      if (message.type === "SESSION_READY") applySignedIn(message.email);
    };
    chrome.runtime.onMessage.addListener(onMessage);

    return () => {
      cancelled = true;
      window.clearInterval(id);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, [step]);

  useEffect(() => {
    if (step !== "idle" && step !== "signedOut") return;
    loadProfile()
      .then(setProfile)
      .catch((e) => {
        if (isAuthFailure(e)) void forceSignIn(messageOf(e));
      });
  }, [step]);

  // Look up a prior tailor pass for this posting so we can offer reuse (no credits).
  useEffect(() => {
    if (step !== "idle") return;
    let cancelled = false;
    setLookingForSaved(true);
    findExistingApplication({
      company: job.company,
      role: job.role,
      postingUrl: job.postingUrl || null,
    })
      .then((app) => {
        if (cancelled) return;
        setSavedTailored(app?.tailoredResume ? app : null);
      })
      .catch((e) => {
        if (!cancelled && isAuthFailure(e)) void forceSignIn(messageOf(e));
        else if (!cancelled) setSavedTailored(null);
      })
      .finally(() => {
        if (!cancelled) setLookingForSaved(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, job.company, job.role, job.postingUrl]);

  const templateId = application?.templateId ?? savedTailored?.templateId ?? profile?.defaultTemplateId ?? "classic";

  /** Runs page autofill with the selected fields and records its report. */
  async function runAutofillWithFields(nextFields: ResumeFields, app: ApplicationRecord | null) {
    setStep("filling");
    try {
      const tpl = app?.templateId ?? profile?.defaultTemplateId ?? "classic";
      const report = await runAutofill(ats, nextFields, profile, tpl, signedInEmail);
      setFillReport(report);
      setStep("done");
    } catch (e) {
      handleCaughtError(e, "result");
    }
  }

  /** Autofills immediately from a previously tailored resume without spending credits. */
  async function useSavedResume() {
    if (!savedTailored?.tailoredResume) return;
    setError(null);
    hydrateFromSaved(savedTailored);
    await runAutofillWithFields(savedTailored.tailoredResume, savedTailored);
  }

  /** Opens a previously tailored resume for review before autofilling. */
  async function reviewSavedResume() {
    if (!savedTailored?.tailoredResume) return;
    setError(null);
    hydrateFromSaved(savedTailored);
    setStep("result");
  }

  /** Autofills the page with the panel's current tailored fields. */
  async function runAutofillAfterTailor() {
    if (!fields) return;
    await runAutofillWithFields(fields, application);
  }

  /** Saves the detected posting, tailors a resume, and advances the workflow. */
  async function startTailor() {
    setError(null);
    setStep("scanning");
    try {
      if (!isConfigured) throw new NotConfiguredError();
      const app = await findOrCreateApplication({
        company: job.company,
        role: job.role,
        postingUrl: job.postingUrl || null,
        jobDescription: job.jobDescription,
      });
      // tailor-resume reads job_description from the row — always push the
      // scraped JD, including when we reused an older applications row.
      if (job.jobDescription.trim()) {
        await updateJobDescription(app.id, job.jobDescription);
      }
      setApplication(app);
      const result = await tailorResume(app.id);
      setFields(result.fields);
      setSummary(result.summary);
      setChanges(result.changes);
      setKeywords(result.keywords);
      setMissingSkills(result.missingSkills);
      setSavedTailored(null);

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
      await runAutofillWithFields(result.fields, app);
    } catch (e) {
      handleCaughtError(e, "idle");
    }
  }

  /** Enriches confirmed skill gaps, or skips them, before rendering and filling. */
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
      setStep("filling");
      const report = await runAutofill(ats, enrichResult.fields, profile, templateId, signedInEmail);
      setFillReport(report);
      setStep("done");
    } catch (e) {
      handleCaughtError(e, "gapReview");
    }
  }

  /** Applies and persists the requested edit to the current tailored resume. */
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
      await saveTailoredResume(application.id, result.fields, {
        summary,
        changes: result.changes,
        keywords,
        missingSkills: [],
        variant: null,
      });
    } catch (e) {
      handleCaughtError(e, "result");
    } finally {
      setTweaking(false);
    }
  }

  /** Starts autofill from the review screen when tailored fields are ready. */
  async function startAutofill() {
    if (!fields) return;
    setError(null);
    await runAutofillAfterTailor();
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

        {step === "signedOut" && (
          <SignedOutPanel
            onOpenSignIn={async () => {
              setError(null);
              const response = await sendMessageSafe<StartSignInResponse>({ type: "START_SIGN_IN" });
              if (!response?.ok) {
                setError(response && "error" in response ? response.error : "Couldn't open PrepFor.Me.");
              }
            }}
          />
        )}

        {step === "idle" && (
          <IdlePanel
            ats={ats}
            job={job}
            onChangeJob={setJob}
            profile={profile}
            configured={isConfigured}
            lookingForSaved={lookingForSaved}
            savedTailored={savedTailored}
            onUseSaved={useSavedResume}
            onReviewSaved={reviewSavedResume}
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
            templateId={templateId}
            showPreview={showPreview}
            onTogglePreview={() => setShowPreview((v) => !v)}
            onAuthFailure={(msg) => void forceSignIn(msg)}
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
          <DonePanel
            report={fillReport}
            company={job.company}
            onShowResume={() => setStep("result")}
            onAutofillAgain={startAutofill}
          />
        )}
      </div>

      {step === "result" && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
          <Button full size="lg" onClick={startAutofill}>
            Autofill this page
          </Button>
        </div>
      )}

      {step === "done" && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${colors.border}` }}>
          <Button full variant="outline" onClick={onClose}>
            Close panel
          </Button>
        </div>
      )}

      <div style={{ padding: "8px 16px 10px", fontSize: 10.5, color: colors.textMuted, textAlign: "center" }}>
        {signedInEmail ?? ""}
      </div>
    </div>
  );
}

/** Converts an unknown failure into actionable extension-facing copy. */
function messageOf(e: unknown): string {
  if (!(e instanceof Error)) return "Something went wrong.";
  if (e.message === "Failed to fetch" || /NetworkError|Load failed/i.test(e.message)) {
    return "Couldn't reach PrepFor.Me's servers. Reload the extension on chrome://extensions after building with extension/.env.local filled in.";
  }
  return e.message;
}

/** Renders panel branding, ATS context, and the close control. */
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

/** Centers transient panel content such as progress indicators. */
function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "36px 8px", textAlign: "center" }}>{children}</div>;
}

/** Explains and starts the web-app sign-in handoff. */
function SignedOutPanel({ onOpenSignIn }: { onOpenSignIn: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 4px" }}>
      <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 6 }}>Sign in to PrepFor.Me first</div>
      <p style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 1.55, margin: "0 0 16px" }}>
        We'll open PrepFor.Me, wait for you to sign in, then bring you right back here automatically.
      </p>
      <Button size="sm" onClick={onOpenSignIn}>
        Open PrepFor.Me to sign in
      </Button>
      <p style={{ fontSize: 11.5, color: colors.textMuted, lineHeight: 1.5, margin: "14px 0 0" }}>
        Already signed in? Keep your PrepFor.Me tab open — this panel checks automatically.
      </p>
    </div>
  );
}

/** Shows detected job details and the available new or saved tailoring actions. */
function IdlePanel({
  ats,
  job,
  onChangeJob,
  profile,
  configured,
  lookingForSaved,
  savedTailored,
  onUseSaved,
  onReviewSaved,
  onStart,
}: {
  ats: AtsKind;
  job: DetectedJob;
  onChangeJob: (job: DetectedJob) => void;
  profile: ProfileRecord | null;
  configured: boolean;
  lookingForSaved: boolean;
  savedTailored: ApplicationRecord | null;
  onUseSaved: () => void;
  onReviewSaved: () => void;
  onStart: () => void;
}) {
  const jdTooShort = job.jobDescription.trim().length < 40;
  const hasSaved = Boolean(savedTailored?.tailoredResume);
  return (
    <div>
      {!configured && (
        <ErrorNote>
          Extension isn't configured. Fill extension/.env.local, run npm run build, and reload on chrome://extensions.
        </ErrorNote>
      )}
      <Label htmlFor="pfm-company-input">Company</Label>
      <TextInput
        id="pfm-company-input"
        value={job.company}
        onChange={(e) => onChangeJob({ ...job, company: e.target.value })}
        style={{ marginBottom: 10 }}
      />
      <Label htmlFor="pfm-role-input">Role</Label>
      <TextInput id="pfm-role-input" value={job.role} onChange={(e) => onChangeJob({ ...job, role: e.target.value })} style={{ marginBottom: 14 }} />

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
        Uses your saved profile and base resume
        {profile?.fullName ? ` (${profile.fullName})` : ""}. Update those in PrepFor.Me if they're out of date.
      </div>

      {lookingForSaved && (
        <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 14, textAlign: "center" }}>
          Checking for a previous tailor…
        </div>
      )}

      {hasSaved && !lookingForSaved && (
        <div
          style={{
            border: `1px solid ${colors.success}`,
            background: colors.successBg,
            borderRadius: 9,
            padding: "12px 12px",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.successText, marginBottom: 4 }}>
            Already tailored for this role
          </div>
          <p style={{ fontSize: 12, color: colors.successText, lineHeight: 1.5, margin: "0 0 12px" }}>
            Found the resume in PrepFor.Me's Materials for{" "}
            <strong>
              {savedTailored?.role} at {savedTailored?.company}
            </strong>
            . Reuse it to skip another credit spend.
          </p>
          <Button full size="lg" onClick={onUseSaved} disabled={!configured} style={{ marginBottom: 8 }}>
            Use saved resume & autofill
          </Button>
          <Button full variant="outline" size="sm" onClick={onReviewSaved} disabled={!configured}>
            Review saved resume first
          </Button>
        </div>
      )}

      <Button
        full
        size={hasSaved ? "sm" : "lg"}
        variant={hasSaved ? "ghost" : "primary"}
        onClick={onStart}
        disabled={!configured || !job.company.trim() || !job.role.trim()}
      >
        {hasSaved ? "Re-tailor anyway (uses credits)" : "Tailor & autofill this page"}
      </Button>
      <p style={{ fontSize: 11.5, color: colors.textMuted, lineHeight: 1.55, margin: "12px 0 0" }}>
        {hasSaved
          ? "Re-tailor runs the model again against this posting's job description."
          : "We'll read the job description on this page and match it to your profile. You review every field — we never click submit for you."}
      </p>
    </div>
  );
}

/** Collects optional evidence for skills missing from the base resume. */
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

/** Presents tailored changes, keyword coverage, PDF preview, and edit controls. */
function ResultPanel({
  summary,
  changes,
  keywords,
  fields,
  templateId,
  showPreview,
  onTogglePreview,
  onAuthFailure,
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
  templateId: ResumeTemplateId;
  showPreview: boolean;
  onTogglePreview: () => void;
  onAuthFailure: (message: string) => void;
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

      <Button variant="outline" size="sm" onClick={onTogglePreview} style={{ marginBottom: 10 }}>
        {showPreview ? "Hide resume PDF" : "Show resume PDF"}
      </Button>

      {showPreview && (
        <ResumePdfPreview fields={fields} templateId={templateId} onAuthFailure={onAuthFailure} />
      )}

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

/** Summarizes fields filled automatically and items that still need user review. */
function DonePanel({
  report,
  company,
  onShowResume,
  onAutofillAgain,
}: {
  report: FillReport;
  company: string;
  onShowResume: () => void;
  onAutofillAgain: () => void;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13.5,
          fontWeight: 600,
          color: report.filled.length > 0 ? colors.successText : colors.warningText,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: report.filled.length > 0 ? colors.success : colors.warningText,
            flexShrink: 0,
          }}
        />
        {report.filled.length > 0
          ? `Filled ${report.filled.length} field${report.filled.length === 1 ? "" : "s"} on the page`
          : "Couldn't autofill yet"}
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
        {report.noFormFound
          ? "Your tailored resume is saved. Open the Apply form on this posting, then press Autofill again."
          : (
            <>
              Review every field, then click <strong style={{ color: colors.text }}>{company}'s own submit button</strong>.
              PrepFor.Me never submits for you.
            </>
          )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {report.noFormFound || report.filled.length === 0 ? (
          <Button style={{ flex: 1 }} onClick={onAutofillAgain}>
            Try autofill again
          </Button>
        ) : null}
        <Button style={{ flex: 1 }} variant="outline" onClick={onShowResume}>
          View tailored resume
        </Button>
      </div>
    </div>
  );
}
