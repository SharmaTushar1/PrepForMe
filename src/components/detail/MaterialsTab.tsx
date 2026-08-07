import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { css } from "../../css";
import {
  ai,
  type AtsKeyword,
  type MissingSkillPrompt,
  type TailoringResult,
} from "../../lib/ai";
import { useUpdateApplication } from "../../data/applications";
import { useProfileContext } from "../../data/profile";
import { useBaseResume } from "../../data/resumes";
import type { DecoratedApp } from "../../data/derived";
import type { ResumeFields, ResumeTemplateId, TailorSession } from "../../types";
import {
  fieldsFromProfileSpine,
  pinSpineFacts,
  renderTemplateToHtml,
  RESUME_TEMPLATE_IDS,
} from "../../lib/resume/templates";
import { downloadResumePdf } from "../../lib/resume/pdfDownload";
import { checkContentFidelity } from "../../lib/resume/fidelity";
import { ROUTES } from "../../routes";
import {
  EmptyState,
  ErrorNote,
  PrimaryButton,
  SecondaryButton,
  TextArea,
} from "../ui";

function sessionFromApp(app: DecoratedApp): {
  fields: ResumeFields | null;
  missing: MissingSkillPrompt[];
  briefs: Record<string, string>;
  keywords: AtsKeyword[];
  result: TailoringResult | null;
} {
  const session = app.tailorSession;
  const fields = app.tailoredResume;
  if (!session || !fields) {
    return {
      fields,
      missing: [],
      briefs: {},
      keywords: session?.keywords ?? [],
      result: null,
    };
  }
  return {
    fields,
    missing: session.missingSkills,
    briefs: session.briefs,
    keywords: session.keywords,
    result: {
      summary: session.summary,
      changes: session.changes,
      keywords: session.keywords,
      variant: session.variant,
      missingSkills: session.missingSkills,
      fields,
      model: "saved",
    },
  };
}

function buildSession(input: {
  result: TailoringResult | null;
  missing: MissingSkillPrompt[];
  briefs: Record<string, string>;
  keywords: AtsKeyword[];
}): TailorSession {
  return {
    summary: input.result?.summary ?? "",
    changes: input.result?.changes ?? [],
    keywords: input.keywords,
    missingSkills: input.missing,
    variant: input.result?.variant ?? null,
    briefs: input.briefs,
  };
}

export function MaterialsTab({ app }: { app: DecoratedApp }) {
  const navigate = useNavigate();
  const context = useProfileContext();
  const update = useUpdateApplication();
  const baseResume = useBaseResume();

  const defaultTemplate: ResumeTemplateId =
    app.templateId ?? context.profile?.defaultTemplateId ?? "classic";

  const restored = sessionFromApp(app);
  const [templateId, setTemplateId] = useState<ResumeTemplateId>(defaultTemplate);
  const [result, setResult] = useState<TailoringResult | null>(restored.result);
  const [fields, setFields] = useState<ResumeFields | null>(restored.fields);
  const [running, setRunning] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [keywords, setKeywords] = useState<AtsKeyword[]>(restored.keywords);
  const [missing, setMissing] = useState<MissingSkillPrompt[]>(restored.missing);
  const [briefs, setBriefs] = useState<Record<string, string>>(restored.briefs);
  const [jd, setJd] = useState("");
  const [savingJd, setSavingJd] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [editInstruction, setEditInstruction] = useState("");
  const [editing, setEditing] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const briefsSaveGen = useRef(0);
  const hydratedAppId = useRef(app.id);

  const hasJd = !!app.jobDescription?.trim();
  const alreadyTailored = !!(fields || app.resumeTailored || app.tailoredResume);
  const bulletCount = useMemo(
    () =>
      context.experiences.reduce(
        (n, e) => n + e.bullets.filter((b) => b.enabled).length,
        0,
      ),
    [context.experiences],
  );

  const spine = useMemo(
    () =>
      fieldsFromProfileSpine({
        profile: context.profile,
        experiences: context.experiences,
        skills: context.skills,
        education: context.education,
        projects: context.projects,
        certifications: context.certifications,
      }),
    [
      context.profile,
      context.experiences,
      context.skills,
      context.education,
      context.projects,
      context.certifications,
    ],
  );

  const fidelity = useMemo(
    () => (fields ? checkContentFidelity(fields, spine) : null),
    [fields, spine],
  );

  const html = useMemo(
    () => (fields ? renderTemplateToHtml(fields, templateId) : ""),
    [fields, templateId],
  );

  useEffect(() => {
    setTemplateId(app.templateId ?? context.profile?.defaultTemplateId ?? "classic");
  }, [app.templateId, context.profile?.defaultTemplateId]);

  // Remount / switch role: restore the last saved pass. Never re-calls the model.
  useEffect(() => {
    if (hydratedAppId.current === app.id && fields) return;
    hydratedAppId.current = app.id;
    const next = sessionFromApp(app);
    setFields(next.fields);
    setResult(next.result);
    setMissing(next.missing);
    setBriefs(next.briefs);
    setKeywords(next.keywords);
    setFailure(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the role changes
  }, [app.id]);

  // If the list query lands after first paint with a saved tailor, pick it up once.
  useEffect(() => {
    if (fields || !app.tailoredResume) return;
    const next = sessionFromApp(app);
    setFields(next.fields);
    setResult(next.result);
    setMissing(next.missing);
    setBriefs(next.briefs);
    if (next.keywords.length) setKeywords(next.keywords);
  }, [app.tailoredResume, app.tailorSession, fields]);

  useEffect(() => {
    let active = true;
    if (!hasJd || context.loading) {
      setKeywords((prev) => (prev.length ? [] : prev));
      return;
    }
    // Prefer keywords from the saved tailor pass — atsGap is mechanical and free,
    // but overwriting a saved pass on every visit looks like the work was lost.
    if (app.tailorSession?.keywords?.length && !result) {
      setKeywords(app.tailorSession.keywords);
      return;
    }
    if (keywords.length > 0 && (result || app.tailorSession)) return;
    ai.atsGap({ application: app, context }).then((k) => {
      if (active) setKeywords(k);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, app.jobDescription, context.loading, context.experiences, context.skills]);

  // Persist in-progress skill briefs so leaving mid-panel does not lose them.
  useEffect(() => {
    if (!fields || missing.length === 0) return;
    const gen = ++briefsSaveGen.current;
    const timer = window.setTimeout(() => {
      if (gen !== briefsSaveGen.current) return;
      void update.mutateAsync({
        id: app.id,
        patch: {
          tailoredResume: fields,
          tailorSession: buildSession({ result, missing, briefs, keywords }),
          resumeTailored: true,
        },
      });
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefs]);

  async function persist(
    nextFields: ResumeFields,
    next: {
      result: TailoringResult | null;
      missing: MissingSkillPrompt[];
      briefs: Record<string, string>;
      keywords: AtsKeyword[];
    },
  ) {
    briefsSaveGen.current += 1;
    await update.mutateAsync({
      id: app.id,
      patch: {
        tailoredResume: nextFields,
        tailorSession: buildSession(next),
        resumeTailored: true,
        templateId,
      },
    });
  }

  async function saveTemplate(id: ResumeTemplateId) {
    setTemplateId(id);
    await update.mutateAsync({ id: app.id, patch: { templateId: id } });
  }

  async function tailor() {
    if (alreadyTailored) {
      const ok = window.confirm(
        "Re-tailor replaces the saved version for this role and uses one of this month's tailor allowances. Continue?",
      );
      if (!ok) return;
    }
    setRunning(true);
    setFailure(null);
    try {
      const next = await ai.tailorResume({ application: app, context });
      const pinned = pinSpineFacts(next.fields, spine);
      const saved = { ...next, fields: pinned };
      setResult(saved);
      setKeywords(saved.keywords);
      setMissing(saved.missingSkills);
      setFields(pinned);
      setBriefs({});
      await persist(pinned, {
        result: saved,
        missing: saved.missingSkills,
        briefs: {},
        keywords: saved.keywords,
      });
    } catch (error) {
      setFailure(error);
    } finally {
      setRunning(false);
    }
  }

  async function applySkillGaps() {
    if (!fields) return;
    setEnriching(true);
    setFailure(null);
    try {
      const payload = missing
        .map((m) => ({ skill: m.skill, text: (briefs[m.skill] ?? "").trim() }))
        .filter((b) => b.text.length > 0);
      const nextFields =
        payload.length === 0
          ? fields
          : await ai.enrichSkillGaps({
              application: app,
              context,
              fields,
              briefs: payload,
            });
      const pinned = pinSpineFacts(nextFields, spine);
      setFields(pinned);
      setMissing([]);
      setBriefs({});
      const nextResult = result
        ? { ...result, fields: pinned, missingSkills: [] }
        : null;
      setResult(nextResult);
      await persist(pinned, {
        result: nextResult,
        missing: [],
        briefs: {},
        keywords,
      });
    } catch (error) {
      setFailure(error);
    } finally {
      setEnriching(false);
    }
  }

  async function skipAllGaps() {
    if (!fields) {
      setMissing([]);
      return;
    }
    setMissing([]);
    setBriefs({});
    const nextResult = result ? { ...result, missingSkills: [] } : null;
    setResult(nextResult);
    try {
      await persist(fields, {
        result: nextResult,
        missing: [],
        briefs: {},
        keywords,
      });
    } catch (error) {
      setFailure(error);
    }
  }

  async function applyEdit() {
    if (!fields || !editInstruction.trim()) return;
    const ok = window.confirm(
      "This applies only what you asked for and uses one of this month's tailor allowances. Continue?",
    );
    if (!ok) return;
    setEditing(true);
    setFailure(null);
    try {
      const edited = await ai.editTailoredResume({
        application: app,
        context,
        fields,
        instruction: editInstruction.trim(),
      });
      // Do not pinSpineFacts — contact and wording edits are intentional.
      setFields(edited.fields);
      setEditInstruction("");
      const nextResult: TailoringResult = result
        ? {
            ...result,
            fields: edited.fields,
            summary: edited.summary,
            changes: edited.changes.length
              ? edited.changes
              : result.changes,
          }
        : {
            summary: edited.summary,
            changes: edited.changes,
            keywords,
            variant: null,
            model: edited.model,
            fields: edited.fields,
            missingSkills: missing,
          };
      setResult(nextResult);
      await persist(edited.fields, {
        result: nextResult,
        missing,
        briefs,
        keywords,
      });
    } catch (error) {
      setFailure(error);
    } finally {
      setEditing(false);
    }
  }

  async function download() {
    if (!fields || !fidelity?.ok) return;
    setPdfBusy(true);
    setFailure(null);
    try {
      await downloadResumePdf({ templateId, fields });
    } catch (error) {
      setFailure(error);
    } finally {
      setPdfBusy(false);
    }
  }

  async function saveJd() {
    if (!jd.trim()) return;
    setSavingJd(true);
    try {
      await update.mutateAsync({ id: app.id, patch: { jobDescription: jd } });
      setJd("");
    } finally {
      setSavingJd(false);
    }
  }

  if (!hasJd) {
    return (
      <div>
        <h2
          style={css(
            "font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0 0 6px;",
          )}
        >
          Tailored resume
        </h2>
        <p
          style={css(
            "font-size:13px; color:oklch(0.5 0.015 260); margin:0 0 18px; max-width:620px;",
          )}
        >
          Tailoring edits fields against this posting, then renders the same
          Classic/Compact PDF templates as Generate on your profile. Paste the
          job description to start.
        </p>
        <TextArea
          value={jd}
          onChange={setJd}
          rows={8}
          placeholder={`Paste the ${app.company} job description here.`}
        />
        <div style={css("margin-top:12px;")}>
          <PrimaryButton onClick={saveJd} disabled={!jd.trim() || savingJd}>
            {savingJd ? "Saving…" : "Save job description"}
          </PrimaryButton>
        </div>
      </div>
    );
  }

  const covered = keywords.filter((k) => k.covered);
  const missingKw = keywords.filter((k) => !k.covered);

  return (
    <div>
      <div
        style={css(
          "display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:8px; flex-wrap:wrap;",
        )}
      >
        <h2
          style={css(
            "font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0;",
          )}
        >
          Tailored resume
        </h2>
        <button
          onClick={tailor}
          disabled={running || bulletCount === 0}
          className="pressable"
          style={css(
            "font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.1); border:none; padding:9px 14px; border-radius:9px; cursor:pointer;",
          )}
        >
          {running
            ? "Tailoring…"
            : alreadyTailored
              ? "↻ Re-tailor"
              : "Tailor for this JD"}
        </button>
      </div>
      {alreadyTailored && !running ? (
        <p
          style={css(
            "font-size:12.5px; color:oklch(0.5 0.015 260); margin:0 0 16px; max-width:640px;",
          )}
        >
          Saved for this role — leave and come back anytime. Re-tailor is the
          only action that spends another allowance.
        </p>
      ) : (
        <div style={css("margin-bottom:16px;")} />
      )}

      <div style={css("display:flex; gap:8px; flex-wrap:wrap; margin-bottom:16px;")}>
        {RESUME_TEMPLATE_IDS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => saveTemplate(id)}
            style={{
              ...css(
                "font-size:12.5px; font-weight:600; padding:7px 12px; border-radius:8px; cursor:pointer;",
              ),
              border:
                templateId === id
                  ? "1px solid oklch(0.55 0.15 255)"
                  : "1px solid oklch(0.88 0.006 260)",
              background:
                templateId === id ? "oklch(0.55 0.15 255 / 0.1)" : "#fff",
              color:
                templateId === id
                  ? "oklch(0.4 0.13 255)"
                  : "oklch(0.35 0.015 260)",
            }}
          >
            {id === "classic" ? "Classic" : "Compact"}
          </button>
        ))}
        <span style={css("font-size:12px; color:oklch(0.55 0.015 260); align-self:center;")}>
          Override for this role (profile default is{" "}
          {context.profile?.defaultTemplateId ?? "classic"})
        </span>
      </div>

      {baseResume.resume && (
        <div
          style={css(
            "font-size:12.5px; color:oklch(0.5 0.015 260); line-height:1.6; margin-bottom:18px; max-width:640px;",
          )}
        >
          <strong style={css("color:oklch(0.3 0.02 260);")}>Base resume:</strong>{" "}
          {baseResume.resume.fileName} — tailoring writes application-only copy;
          your profile spine is unchanged.{" "}
          <button
            onClick={() => navigate(ROUTES.resume)}
            style={css(
              "font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:none; border:none; cursor:pointer; padding:0;",
            )}
          >
            Its ATS report →
          </button>
        </div>
      )}

      {bulletCount === 0 && (
        <div style={css("margin-bottom:24px;")}>
          <EmptyState
            compact
            title="No bullets to work with"
            body="Tailoring only re-emphasizes work you've written down. Add experience on your profile first."
            action={
              <PrimaryButton onClick={() => navigate(ROUTES.profile)}>
                Go to your profile
              </PrimaryButton>
            }
          />
        </div>
      )}

      {running && (
        <div
          style={css(
            "border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:40px; text-align:center; background:#fff; margin-bottom:20px;",
          )}
        >
          <div
            style={css(
              "width:26px;height:26px;border:3px solid oklch(0.55 0.15 255 / 0.3);border-top-color:oklch(0.55 0.15 255);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px;",
            )}
          />
          <div style={css("font-weight:600; font-size:15px;")}>
            Tailoring fields for this JD…
          </div>
          <div
            style={css(
              "font-size:13px; color:oklch(0.5 0.015 260); margin-top:5px;",
            )}
          >
            Matching language only. Nothing invented.
          </div>
        </div>
      )}

      {!running && result?.summary ? (
        <div style={css("margin-bottom:24px;")}>
          <div
            style={css(
              "font-size:13px; color:oklch(0.45 0.015 260); margin-bottom:14px; background:oklch(0.55 0.13 145 / 0.06); border:1px solid oklch(0.55 0.13 145 / 0.2); border-radius:9px; padding:11px 14px;",
            )}
          >
            {result.summary}
          </div>
          {result.changes.map((c, i) => (
            <div
              key={i}
              style={css(
                "border:1px solid oklch(0.9 0.006 260); border-radius:10px; padding:12px 14px; margin-bottom:10px; background:#fff;",
              )}
            >
              <div
                style={css(
                  "font-size:12px; color:oklch(0.5 0.015 260); text-decoration:line-through; margin-bottom:6px;",
                )}
              >
                {c.before}
              </div>
              <div style={css("font-size:13.5px; line-height:1.55;")}>{c.after}</div>
              <div
                style={css(
                  "font-size:12px; color:oklch(0.5 0.015 260); margin-top:6px;",
                )}
              >
                {c.rationale}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {missing.length > 0 && (
        <div style={css("margin-bottom:24px;")}>
          <h3
            style={css(
              "font-family:'Space Grotesk'; font-size:15px; font-weight:600; margin:0 0 8px;",
            )}
          >
            Skills on the JD you haven't listed
          </h3>
          <p
            style={css(
              "font-size:13px; color:oklch(0.5 0.015 260); margin:0 0 14px; max-width:620px;",
            )}
          >
            Optional. Brief where you've used each — we'll add a skill chip and
            1–2 bullets to this role's tailored copy only. Skip any you haven't
            done. Your drafts are saved as you type.
          </p>
          {missing.map((m) => (
            <div key={m.skill} style={css("margin-bottom:14px;")}>
              <div style={css("font-size:13px; font-weight:600; margin-bottom:6px;")}>
                {m.skill}
              </div>
              <div
                style={css(
                  "font-size:12px; color:oklch(0.5 0.015 260); margin-bottom:6px;",
                )}
              >
                {m.prompt}
              </div>
              <TextArea
                value={briefs[m.skill] ?? ""}
                onChange={(v) => setBriefs((prev) => ({ ...prev, [m.skill]: v }))}
                rows={3}
                placeholder="Skip if you haven't used this…"
              />
            </div>
          ))}
          <div style={css("display:flex; gap:10px; flex-wrap:wrap;")}>
            <PrimaryButton onClick={applySkillGaps} disabled={enriching}>
              {enriching ? "Applying…" : "Apply briefs / skip rest"}
            </PrimaryButton>
            <SecondaryButton onClick={skipAllGaps} disabled={enriching}>
              Skip all
            </SecondaryButton>
          </div>
        </div>
      )}

      {fields && !running && (
        <div style={css("margin-bottom:24px;")}>
          <h3
            style={css(
              "font-family:'Space Grotesk'; font-size:15px; font-weight:600; margin:0 0 8px;",
            )}
          >
            Tweak this version
          </h3>
          <p
            style={css(
              "font-size:13px; color:oklch(0.5 0.015 260); margin:0 0 12px; max-width:620px;",
            )}
          >
            Say exactly what to change — email, headline, a bullet, location.
            Everything else stays as-is. This is not a full re-tailor.
          </p>
          <TextArea
            value={editInstruction}
            onChange={setEditInstruction}
            rows={3}
            placeholder='e.g. "Change my email to name@work.com" or "Make the headline Platform Engineer"'
          />
          <div style={css("margin-top:10px;")}>
            <PrimaryButton
              onClick={applyEdit}
              disabled={editing || !editInstruction.trim()}
            >
              {editing ? "Applying…" : "Apply edit"}
            </PrimaryButton>
          </div>
        </div>
      )}

      {fields && fidelity && (
        <div style={css("margin-bottom:24px;")}>
          <h3
            style={css(
              "font-family:'Space Grotesk'; font-size:15px; font-weight:600; margin:0 0 8px;",
            )}
          >
            Content fidelity
          </h3>
          {fidelity.issues.length === 0 ? (
            <p
              style={css(
                "font-size:13px; color:oklch(0.4 0.1 145); margin:0 0 12px;",
              )}
            >
              Tailored fields match your profile spine on employer, title, and
              dates.
            </p>
          ) : (
            <ul style={css("margin:0 0 12px; padding-left:18px;")}>
              {fidelity.issues.map((issue, i) => (
                <li
                  key={i}
                  style={{
                    ...css("font-size:13px; line-height:1.5; margin-bottom:6px;"),
                    color:
                      issue.severity === "hard"
                        ? "oklch(0.42 0.12 40)"
                        : "oklch(0.45 0.08 55)",
                  }}
                >
                  {issue.severity === "hard" ? "Block: " : "Check: "}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          <div style={css("display:flex; gap:10px; flex-wrap:wrap;")}>
            <SecondaryButton onClick={() => setPreview((v) => !v)}>
              {preview ? "Hide preview" : "Preview"}
            </SecondaryButton>
            <PrimaryButton
              onClick={download}
              disabled={pdfBusy || !fidelity.ok}
            >
              {pdfBusy ? "Rendering…" : "Download PDF"}
            </PrimaryButton>
          </div>
          {!fidelity.ok && (
            <p
              style={css(
                "font-size:12.5px; color:oklch(0.45 0.1 40); margin:10px 0 0;",
              )}
            >
              Download is blocked until hard fidelity issues are fixed (re-tailor
              or edit the spine).
            </p>
          )}
          {preview && (
            <iframe
              title="Tailored resume preview"
              srcDoc={html}
              style={css(
                "width:100%; height:720px; margin-top:16px; border:1px solid oklch(0.9 0.006 260); border-radius:10px; background:#fff;",
              )}
            />
          )}
        </div>
      )}

      <div style={css("margin-top:8px;")}>
        <div
          style={css(
            "font-size:12.5px; color:oklch(0.5 0.015 260); margin-bottom:10px;",
          )}
        >
          Keyword gap: {covered.length} covered · {missingKw.length} missing
        </div>
        <div style={css("display:flex; flex-wrap:wrap; gap:6px;")}>
          {keywords.map((k) => (
            <span
              key={k.keyword}
              style={{
                ...css(
                  "font-size:12px; padding:4px 9px; border-radius:999px;",
                ),
                background: k.covered
                  ? "oklch(0.55 0.13 145 / 0.12)"
                  : "oklch(0.55 0.13 40 / 0.1)",
                color: k.covered
                  ? "oklch(0.32 0.09 150)"
                  : "oklch(0.4 0.1 40)",
              }}
              title={k.hint}
            >
              {k.keyword}
            </span>
          ))}
        </div>
      </div>

      {failure ? (
        <div style={css("margin-top:16px;")}>
          <ErrorNote error={failure} />
        </div>
      ) : null}
    </div>
  );
}
