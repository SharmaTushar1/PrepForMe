import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store";
import { css } from "../css";
import { LogoMark } from "./Logo";
import { ACCENT } from "../data";
import { ROUTES } from "../routes";
import type { ResumeAnalysis } from "../lib/ai";
import { useCreateBullet, useCreateExperience, useUpdateProfile } from "../data/profile";
import { ParsedResumeReview } from "./resume/ParsedResumeReview";
import { ResumeUploadCard } from "./resume/ResumeUploadCard";
import { FieldLabel, PrimaryButton, TextInput } from "./ui";

/**
 * Three ways through, and all of them have to work: upload a PDF and review
 * what came out of it, type the one role that matters, or skip and start with
 * an empty spine. Uploading is first because it's the only one that fills the
 * profile in a single step — it isn't a requirement.
 */
const STEP = { upload: 0, identity: 1, role: 2, review: 3 } as const;

export function Onboarding() {
  const { state, setObStep } = useApp();
  const navigate = useNavigate();
  const updateProfile = useUpdateProfile();
  const createExperience = useCreateExperience();
  const createBullet = useCreateBullet();

  const step = state.obStep;
  const dot = (n: number) => (step >= n ? ACCENT : "oklch(0.9 0.006 260)");

  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [fullName, setFullName] = useState("");
  const [headline, setHeadline] = useState("");
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [bullets, setBullets] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);

  async function saveIdentity() {
    if (!fullName.trim()) return;
    setSaving(true);
    try {
      await updateProfile.mutateAsync({ fullName, headline });
      setObStep(STEP.role);
    } finally {
      setSaving(false);
    }
  }

  async function saveFirstRole() {
    if (!title.trim() || !company.trim()) return;
    setSaving(true);
    try {
      const experience = await createExperience.mutateAsync({ title, company });
      const kept = bullets.map((b) => b.trim()).filter(Boolean);
      for (let i = 0; i < kept.length; i++) {
        await createBullet.mutateAsync({
          experienceId: experience.id,
          text: kept[i],
          sortOrder: i,
        });
      }
      navigate(ROUTES.home);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={css("min-height:100vh; display:flex; align-items:center; justify-content:center; padding:40px; background:radial-gradient(110% 80% at 50% -10%, oklch(0.55 0.15 255 / 0.08), transparent 55%), oklch(0.985 0.003 260);")}>
      <div
        style={{
          ...css("max-width:100%;"),
          width: step === STEP.review ? "720px" : "560px",
        }}
      >
        <div style={css("display:flex; align-items:center; gap:9px; justify-content:center; margin-bottom:8px;")}>
          <LogoMark size={26} />
          <span style={css("font-family:'Space Grotesk'; font-weight:600; font-size:17px;")}>
            PrepFor<span style={css("color:oklch(0.55 0.15 255);")}>.Me</span>
          </span>
        </div>

        <div style={css("display:flex; gap:6px; justify-content:center; margin:20px 0 26px;")}>
          <span style={{ width: "44px", height: "4px", borderRadius: "2px", background: dot(STEP.upload) }}></span>
          <span style={{ width: "44px", height: "4px", borderRadius: "2px", background: dot(STEP.identity) }}></span>
          <span style={{ width: "44px", height: "4px", borderRadius: "2px", background: dot(STEP.role) }}></span>
        </div>

        <div style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:18px; padding:36px; box-shadow:0 30px 70px -44px oklch(0.3 0.05 260 / 0.6);")}>
          {step === STEP.upload && (
            <div style={css("animation:fadeUp .4s ease both;")}>
              <h2 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0 0 8px;")}>
                Start with your resume.
              </h2>
              <p style={css("font-size:15px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0 0 24px;")}>
                Everything the app produces is built from your profile, so the fastest way in is the
                PDF you already send out. You'll get a review of what a parser makes of it, and you
                choose what carries over.
              </p>

              <ResumeUploadCard
                onAnalyzed={(result) => {
                  setAnalysis(result);
                  setObStep(STEP.review);
                }}
                footer={
                  <div style={css("display:flex; flex-direction:column; gap:10px; align-items:center; padding-top:6px;")}>
                    <TextLink onClick={() => setObStep(STEP.identity)}>
                      I'd rather type it in myself
                    </TextLink>
                    <TextLink onClick={() => navigate(ROUTES.home)}>
                      Skip for now — I'll set this up later
                    </TextLink>
                  </div>
                }
              />
            </div>
          )}

          {step === STEP.identity && (
            <div style={css("animation:fadeUp .4s ease both;")}>
              <h2 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0 0 8px;")}>Let's build your spine.</h2>
              <p style={css("font-size:15px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0 0 24px;")}>
                Everything the app produces is generated from your profile — so it starts here, and
                nothing gets invented on top of it.
              </p>

              <div style={css("display:flex; flex-direction:column; gap:16px;")}>
                <div>
                  <FieldLabel>Your name</FieldLabel>
                  <TextInput value={fullName} onChange={setFullName} placeholder="Alex Chen" autoFocus />
                </div>
                <div>
                  <FieldLabel hint="(optional)">Headline</FieldLabel>
                  <TextInput
                    value={headline}
                    onChange={setHeadline}
                    placeholder="Senior Software Engineer · Reliability"
                    onEnter={saveIdentity}
                  />
                </div>
              </div>

              <PrimaryButton
                onClick={saveIdentity}
                disabled={!fullName.trim() || saving}
                style={{ width: "100%", marginTop: "22px", padding: "14px", fontSize: "15px", borderRadius: "11px" }}
              >
                {saving ? "Saving…" : "Continue"}
              </PrimaryButton>

              <div style={css("margin-top:16px; text-align:center;")}>
                <TextLink onClick={() => setObStep(STEP.upload)}>
                  Actually, I'll upload my resume
                </TextLink>
              </div>
            </div>
          )}

          {step === STEP.role && (
            <div style={css("animation:fadeUp .4s ease both;")}>
              <h2 style={css("font-family:'Space Grotesk'; font-size:24px; font-weight:600; margin:0 0 6px;")}>Your most recent role.</h2>
              <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 22px; line-height:1.6;")}>
                Two or three bullets is enough to start. You can add the rest — and every other role —
                on your profile.
              </p>

              <div style={css("display:flex; flex-direction:column; gap:16px;")}>
                <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:14px;")}>
                  <div>
                    <FieldLabel>Title</FieldLabel>
                    <TextInput value={title} onChange={setTitle} placeholder="Senior Software Engineer" autoFocus />
                  </div>
                  <div>
                    <FieldLabel>Company</FieldLabel>
                    <TextInput value={company} onChange={setCompany} placeholder="Acme Cloud" />
                  </div>
                </div>

                <div>
                  <FieldLabel hint="— what you did, with a number where you have one">Bullets</FieldLabel>
                  <div style={css("display:flex; flex-direction:column; gap:8px;")}>
                    {bullets.map((bullet, i) => (
                      <TextInput
                        key={i}
                        value={bullet}
                        onChange={(value) =>
                          setBullets((prev) => prev.map((b, j) => (j === i ? value : b)))
                        }
                        placeholder={
                          i === 0
                            ? "Cut on-call incidents 40% with internal reliability tooling."
                            : "Another thing you did"
                        }
                        ariaLabel={`Bullet ${i + 1}`}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => setBullets((prev) => [...prev, ""])}
                    style={css("margin-top:10px; font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:none; border:none; cursor:pointer; padding:0;")}
                  >
                    + Add another bullet
                  </button>
                </div>
              </div>

              <PrimaryButton
                onClick={saveFirstRole}
                disabled={!title.trim() || !company.trim() || saving}
                style={{ width: "100%", marginTop: "22px", padding: "14px", fontSize: "15px", borderRadius: "11px" }}
              >
                {saving ? "Saving…" : "Take me in"}
              </PrimaryButton>
              <button
                onClick={() => navigate(ROUTES.home)}
                style={css("width:100%; margin-top:14px; background:none; border:none; font-size:13.5px; color:oklch(0.5 0.015 260); cursor:pointer;")}
              >
                I'll do this later
              </button>
            </div>
          )}

          {step === STEP.review &&
            (analysis ? (
              <div style={css("animation:fadeUp .4s ease both;")}>
                <ParsedResumeReview
                  parsed={analysis.parsed}
                  sample={analysis.sample}
                  onApplied={() => navigate(ROUTES.resume)}
                  footer={
                    <TextLink onClick={() => navigate(ROUTES.home)}>
                      Skip — take me in with an empty profile
                    </TextLink>
                  }
                />
              </div>
            ) : (
              <div style={css("animation:fadeUp .4s ease both;")}>
                <h2 style={css("font-family:'Space Grotesk'; font-size:22px; font-weight:600; margin:0 0 8px;")}>
                  That review has gone.
                </h2>
                <p style={css("font-size:14px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0 0 22px;")}>
                  A parse only lives as long as the screen showing it. Your file is still uploaded —
                  the full report is on your profile, and you can review the roles from there.
                </p>
                <PrimaryButton
                  onClick={() => navigate(ROUTES.resume)}
                  style={{ width: "100%", padding: "14px", fontSize: "15px", borderRadius: "11px" }}
                >
                  Open the report
                </PrimaryButton>
                <div style={css("margin-top:14px; text-align:center;")}>
                  <TextLink onClick={() => setObStep(STEP.upload)}>Start again</TextLink>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function TextLink({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={css("background:none; border:none; font-size:13.5px; color:oklch(0.5 0.015 260); cursor:pointer; padding:0;")}
    >
      {children}
    </button>
  );
}
