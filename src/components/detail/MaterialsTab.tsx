import { useEffect, useMemo, useState } from "react";
import { css } from "../../css";
import { ai, type AtsKeyword, type TailoringResult } from "../../lib/ai";
import { useUpdateApplication } from "../../data/applications";
import { useProfileContext } from "../../data/profile";
import { useBaseResume } from "../../data/resumes";
import type { DecoratedApp } from "../../data/derived";
import { ROUTES } from "../../routes";
import { EmptyState, PrimaryButton, SecondaryButton, TextArea } from "../ui";
import { useNavigate } from "react-router-dom";

export function MaterialsTab({ app }: { app: DecoratedApp }) {
  const navigate = useNavigate();
  const context = useProfileContext();
  const update = useUpdateApplication();
  const baseResume = useBaseResume();

  const [result, setResult] = useState<TailoringResult | null>(null);
  const [running, setRunning] = useState(false);
  const [keywords, setKeywords] = useState<AtsKeyword[]>([]);
  const [jd, setJd] = useState("");
  const [savingJd, setSavingJd] = useState(false);

  const hasJd = !!app.jobDescription?.trim();
  const bulletCount = useMemo(
    () => context.experiences.reduce((n, e) => n + e.bullets.filter((b) => b.enabled).length, 0),
    [context.experiences],
  );

  // The keyword gap is a plain comparison of two documents, so it's always live.
  useEffect(() => {
    let active = true;
    if (!hasJd || context.loading) {
      setKeywords([]);
      return;
    }
    ai.atsGap({ application: app, context }).then((k) => {
      if (active) setKeywords(k);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id, app.jobDescription, context.loading, context.experiences, context.skills]);

  async function tailor() {
    setRunning(true);
    try {
      const next = await ai.tailorResume({ application: app, context });
      setResult(next);
      setKeywords(next.keywords);
      if (next.changes.length && !app.resumeTailored) {
        await update.mutateAsync({ id: app.id, patch: { resumeTailored: true } });
      }
    } finally {
      setRunning(false);
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
        <h2 style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0 0 6px;")}>Tailored resume</h2>
        <p style={css("font-size:13px; color:oklch(0.5 0.015 260); margin:0 0 18px; max-width:620px;")}>
          Tailoring compares your real bullets against the posting's own language. Paste the job
          description and this whole tab comes alive.
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
  const missing = keywords.filter((k) => !k.covered);

  return (
    <div>
      <div style={css("display:flex; align-items:center; justify-content:space-between; gap:16px; margin-bottom:16px;")}>
        <h2 style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0;")}>Tailored resume</h2>
        <button
          onClick={tailor}
          disabled={running || bulletCount === 0}
          className="pressable"
          style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.1); border:none; padding:9px 14px; border-radius:9px; cursor:pointer;")}
        >
          {result || app.resumeTailored ? "↻ Re-tailor" : "Tailor for this role"}
        </button>
      </div>

      {baseResume.resume && (
        <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); line-height:1.6; margin-bottom:18px; max-width:640px;")}>
          <strong style={css("color:oklch(0.3 0.02 260);")}>Base resume:</strong>{" "}
          {baseResume.resume.fileName} — tailoring rewrites the bullets on your profile, which is
          where that file's roles land once you review them. The PDF itself is never edited.{" "}
          <button
            onClick={() => navigate(ROUTES.resume)}
            style={css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:none; border:none; cursor:pointer; padding:0;")}
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
            body="Tailoring only ever re-emphasizes work you've already written down. Add your experience and its bullets to your profile first."
            action={
              <PrimaryButton onClick={() => navigate(ROUTES.profile)}>
                Go to your profile
              </PrimaryButton>
            }
          />
        </div>
      )}

      {running && (
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:40px; text-align:center; background:#fff;")}>
          <div style={css("width:26px;height:26px;border:3px solid oklch(0.55 0.15 255 / 0.3);border-top-color:oklch(0.55 0.15 255);border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 16px;")}></div>
          <div style={css("font-weight:600; font-size:15px;")}>Reframing your real bullets for this role…</div>
          <div style={css("font-size:13px; color:oklch(0.5 0.015 260); margin-top:5px;")}>Matching against the JD. Nothing invented.</div>
        </div>
      )}

      {!running && result && (
        <div style={css("margin-bottom:32px;")}>
          <div style={css("font-size:13px; color:oklch(0.45 0.015 260); margin-bottom:14px; background:oklch(0.55 0.13 145 / 0.06); border:1px solid oklch(0.55 0.13 145 / 0.2); border-radius:9px; padding:11px 14px;")}>
            ✓ {result.summary}
          </div>
          <div style={css("display:flex; flex-direction:column; gap:12px;")}>
            {result.changes.map((change, i) => (
              <div key={i} style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; overflow:hidden;")}>
                <div style={css("padding:13px 15px; background:oklch(0.55 0.13 25 / 0.05); font-size:13.5px; color:oklch(0.45 0.06 25); text-decoration:line-through; text-decoration-color:oklch(0.6 0.1 25 / 0.6);")}>{change.before}</div>
                <div style={css("padding:13px 15px; background:oklch(0.55 0.13 145 / 0.06); font-size:13.5px; color:oklch(0.28 0.09 150);")}>{change.after}</div>
                <div style={css("padding:9px 15px; font-size:11.5px; font-family:'IBM Plex Mono'; color:oklch(0.5 0.015 260); border-top:1px solid oklch(0.94 0.006 260);")}>↳ {change.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!running && !result && app.resumeTailored && bulletCount > 0 && (
        <div style={css("margin-bottom:32px; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:16px; background:#fff; font-size:13px; color:oklch(0.45 0.015 260); line-height:1.55;")}>
          You've tailored this role before. Run it again to see the current suggestions — your
          profile and this posting may both have changed since.
        </div>
      )}

      {/* ATS gap — a plain comparison, always available */}
      <h2 style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; margin:0 0 8px;")}>ATS keyword gap</h2>
      <p style={css("font-size:13px; color:oklch(0.5 0.015 260); margin:0 0 16px;")}>
        Keywords from the posting, checked against your profile. Both documents are yours — you can
        verify every one of these.
      </p>

      {keywords.length === 0 ? (
        <EmptyState
          compact
          title="Nothing to compare yet"
          body="We couldn't pull recurring keywords out of this posting. A fuller job description gives a sharper comparison."
        />
      ) : (
        <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:16px;")}>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:16px; background:#fff;")}>
            <div style={css("font-size:12.5px; font-weight:600; color:oklch(0.35 0.09 150); margin-bottom:12px;")}>
              ✓ Already covered · {covered.length}
            </div>
            {covered.length ? (
              <div style={css("display:flex; gap:7px; flex-wrap:wrap;")}>
                {covered.map((k) => (
                  <span key={k.keyword} style={css("font-size:12px; background:oklch(0.55 0.13 145 / 0.1); color:oklch(0.3 0.09 150); padding:5px 11px; border-radius:100px;")}>{k.keyword}</span>
                ))}
              </div>
            ) : (
              <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); line-height:1.5;")}>
                None of the posting's keywords appear in your profile yet.
              </div>
            )}
          </div>

          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:16px; background:#fff;")}>
            <div style={css("font-size:12.5px; font-weight:600; color:oklch(0.45 0.1 40); margin-bottom:12px;")}>
              Genuinely missing · {missing.length}
            </div>
            {missing.length ? (
              <div style={css("display:flex; flex-direction:column; gap:9px;")}>
                {missing.map((k) => (
                  <div key={k.keyword} style={css("display:flex; align-items:center; gap:9px; flex-wrap:wrap;")}>
                    <span style={css("font-size:12px; background:oklch(0.55 0.13 40 / 0.1); color:oklch(0.45 0.1 40); padding:5px 11px; border-radius:100px;")}>{k.keyword}</span>
                    <span style={css("font-size:12px; color:oklch(0.5 0.015 260);")}>{k.hint}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); line-height:1.5;")}>
                Nothing missing — your profile already speaks to every keyword we found.
              </div>
            )}
            <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); margin-top:14px; font-style:italic;")}>
              We won't stuff keywords you can't back up.
            </div>
          </div>
        </div>
      )}

      {/* the posting, editable, since everything above depends on it */}
      <details style={css("margin-top:26px;")}>
        <summary style={css("font-size:13px; color:oklch(0.45 0.015 260); cursor:pointer;")}>
          The job description this is measured against
        </summary>
        <div style={css("margin-top:12px;")}>
          <TextArea
            value={jd || (app.jobDescription ?? "")}
            onChange={setJd}
            rows={10}
            ariaLabel="Job description"
          />
          <div style={css("margin-top:10px; display:flex; gap:8px;")}>
            <SecondaryButton onClick={() => setJd("")}>Reset</SecondaryButton>
            <PrimaryButton
              onClick={saveJd}
              disabled={!jd.trim() || jd === app.jobDescription || savingJd}
            >
              {savingJd ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        </div>
      </details>
    </div>
  );
}
