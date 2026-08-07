import type { ResumeFields, ResumeTemplateId } from "../../types";
import { isResumeTemplateId, resumeFileStem } from "./templates/fields";
import { supabase } from "../supabase";

export interface DownloadResumePdfInput {
  templateId: ResumeTemplateId;
  fields: ResumeFields;
  /** Optional filename stem override. */
  fileStem?: string;
}

/**
 * Ask the Vercel Chromium route for a PDF of already-owned fields.
 * Auth: the caller's Supabase JWT — the API verifies it before rendering.
 */
export async function downloadResumePdf(
  input: DownloadResumePdfInput,
): Promise<void> {
  if (!isResumeTemplateId(input.templateId)) {
    throw new Error("Unknown resume template.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error("Sign in to download a resume PDF.");
  }

  const response = await fetch("/api/render-resume-pdf", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      templateId: input.templateId,
      fields: input.fields,
    }),
  });

  if (!response.ok) {
    let message = "Could not render the PDF.";
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const stem = input.fileStem ?? resumeFileStem(input.fields);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${stem}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
