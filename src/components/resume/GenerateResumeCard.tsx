import { useMemo, useState } from "react";
import { css } from "../../css";
import type { ResumeTemplateId } from "../../types";
import {
  fieldsFromParsed,
  fieldsFromProfileSpine,
  renderTemplateToHtml,
  RESUME_TEMPLATE_IDS,
} from "../../lib/resume/templates";
import { downloadResumePdf } from "../../lib/resume/pdfDownload";
import { useBaseResume, useResumeReport } from "../../data/resumes";
import {
  useCertifications,
  useEducation,
  useExperiences,
  useProfile,
  useProjects,
  useSkills,
  useUpdateProfile,
} from "../../data/profile";
import { ErrorNote, Eyebrow, PrimaryButton, SecondaryButton } from "../ui";

/**
 * Profile "Generate resume": pick Classic/Compact, preview HTML, download PDF
 * via the Chromium API. No LLM in render.
 */
export function GenerateResumeCard() {
  const profile = useProfile();
  const experiences = useExperiences();
  const skills = useSkills();
  const education = useEducation();
  const projects = useProjects();
  const certifications = useCertifications();
  const updateProfile = useUpdateProfile();
  const base = useBaseResume();
  const report = useResumeReport(base.resume?.id);

  const [templateId, setTemplateId] = useState<ResumeTemplateId>(
    profile.data?.defaultTemplateId ?? "classic",
  );
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const fields = useMemo(
    () =>
      fieldsFromProfileSpine({
        profile: profile.data ?? null,
        experiences: experiences.data ?? [],
        skills: skills.data ?? [],
        education: education.data ?? [],
        projects: projects.data ?? [],
        certifications: certifications.data ?? [],
        baseParse: report.data?.parsed
          ? fieldsFromParsed(report.data.parsed)
          : null,
      }),
    [
      profile.data,
      experiences.data,
      skills.data,
      education.data,
      projects.data,
      certifications.data,
      report.data?.parsed,
    ],
  );

  const html = useMemo(
    () => renderTemplateToHtml(fields, templateId),
    [fields, templateId],
  );

  const hasContent =
    fields.experiences.length > 0 ||
    fields.skills.length > 0 ||
    !!fields.fullName;

  async function chooseTemplate(id: ResumeTemplateId) {
    setTemplateId(id);
    if (profile.data && profile.data.defaultTemplateId !== id) {
      await updateProfile.mutateAsync({ defaultTemplateId: id });
    }
  }

  async function download() {
    setFailure(null);
    setBusy(true);
    try {
      await downloadResumePdf({ templateId, fields });
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <Eyebrow style={{ marginBottom: "12px" }}>Generate resume</Eyebrow>
      <div
        style={css(
          "border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:20px; background:#fff;",
        )}
      >
        <p
          style={css(
            "font-size:13.5px; line-height:1.65; color:oklch(0.4 0.015 260); margin:0 0 16px; max-width:640px;",
          )}
        >
          Build a clean single-column PDF from your profile spine (and any
          education/projects captured from your base upload). Output is always a
          template — we never restyle your original file.
        </p>

        <div style={css("display:flex; gap:10px; flex-wrap:wrap; margin-bottom:16px;")}>
          {RESUME_TEMPLATE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => chooseTemplate(id)}
              className="pressable"
              style={{
                ...css(
                  "font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; padding:8px 14px; border-radius:9px; cursor:pointer;",
                ),
                border:
                  templateId === id
                    ? "1px solid oklch(0.55 0.15 255)"
                    : "1px solid oklch(0.88 0.006 260)",
                background:
                  templateId === id
                    ? "oklch(0.55 0.15 255 / 0.1)"
                    : "#fff",
                color:
                  templateId === id
                    ? "oklch(0.4 0.13 255)"
                    : "oklch(0.35 0.015 260)",
              }}
            >
              {id === "classic" ? "Classic" : "Compact"}
            </button>
          ))}
        </div>

        {!hasContent ? (
          <p style={css("font-size:13px; color:oklch(0.45 0.1 40); margin:0;")}>
            Add your name and at least one role or skill before generating.
          </p>
        ) : (
          <div style={css("display:flex; gap:10px; flex-wrap:wrap; align-items:center;")}>
            <PrimaryButton onClick={() => setPreview((v) => !v)}>
              {preview ? "Hide preview" : "Preview"}
            </PrimaryButton>
            <SecondaryButton onClick={download} disabled={busy}>
              {busy ? "Rendering PDF…" : "Download PDF"}
            </SecondaryButton>
          </div>
        )}

        {preview && hasContent && (
          <iframe
            title="Resume preview"
            srcDoc={html}
            style={css(
              "width:100%; height:720px; margin-top:18px; border:1px solid oklch(0.9 0.006 260); border-radius:10px; background:#fff;",
            )}
          />
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
