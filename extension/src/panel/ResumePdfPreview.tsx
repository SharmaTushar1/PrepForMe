/**
 * Renders the tailored resume as a real PDF (same Chromium endpoint as download)
 * and offers open-in-new-tab / download. Replaces the old truncated text preview.
 */
import { useEffect, useRef, useState } from "react";
import { renderResumePdf, isAuthFailure } from "../lib/api";
import { sendMessageSafe } from "../lib/messages";
import type { ResumeFields, ResumeTemplateId } from "../lib/types";
import { Button, Spinner } from "./ui";
import { colors } from "./theme";

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const comma = dataUrl.indexOf(",");
      resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read PDF"));
    reader.readAsDataURL(blob);
  });
}

function fileStem(fields: ResumeFields): string {
  const name = (fields.fullName || "Resume").replace(/[^\w -]/g, "").trim() || "Resume";
  return `${name} - Tailored`;
}

export function ResumePdfPreview({
  fields,
  templateId,
  onAuthFailure,
}: {
  fields: ResumeFields;
  templateId: ResumeTemplateId;
  onAuthFailure?: (message: string) => void;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const blobRef = useRef<Blob | null>(null);
  const fieldsKey = JSON.stringify(fields) + ":" + templateId;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);
    setObjectUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    blobRef.current = null;

    renderResumePdf(fields, templateId)
      .then((blob) => {
        if (cancelled) return;
        blobRef.current = blob;
        setObjectUrl(URL.createObjectURL(blob));
        setStatus("ready");
      })
      .catch((e) => {
        if (cancelled) return;
        if (isAuthFailure(e)) {
          onAuthFailure?.(e instanceof Error ? e.message : "Session expired.");
          return;
        }
        setError(e instanceof Error ? e.message : "Could not render the PDF.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
    };
    // fieldsKey captures fields + templateId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsKey]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  async function openInNewTab() {
    const blob = blobRef.current;
    if (!blob) return;
    try {
      const base64 = await blobToBase64(blob);
      const response = await sendMessageSafe<{ ok: true } | { ok: false; error: string }>({
        type: "OPEN_PDF_TAB",
        base64,
        fileName: `${fileStem(fields)}.pdf`,
      });
      if (!response || !response.ok) {
        // Fallback: try blob URL in this page's browsing context.
        if (objectUrl) window.open(objectUrl, "_blank", "noopener,noreferrer");
      }
    } catch {
      if (objectUrl) window.open(objectUrl, "_blank", "noopener,noreferrer");
    }
  }

  function download() {
    const blob = blobRef.current;
    if (!blob || !objectUrl) return;
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `${fileStem(fields)}.pdf`;
    a.rel = "noopener";
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void openInNewTab()}
          disabled={status !== "ready"}
        >
          Open PDF in new tab
        </Button>
        <Button size="sm" variant="ghost" onClick={download} disabled={status !== "ready"}>
          Download
        </Button>
      </div>

      {status === "loading" && (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 9,
            padding: 28,
            textAlign: "center",
            background: colors.bgMuted,
          }}
        >
          <Spinner size={24} />
          <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 10 }}>
            Rendering full PDF…
          </div>
        </div>
      )}

      {status === "error" && (
        <div
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 9,
            padding: 14,
            fontSize: 12.5,
            color: colors.warningText,
            background: colors.warningBg,
            lineHeight: 1.5,
          }}
        >
          {error ?? "Could not render the PDF."}
        </div>
      )}

      {status === "ready" && objectUrl && (
        <iframe
          title="Tailored resume PDF"
          src={objectUrl}
          style={{
            width: "100%",
            height: 480,
            border: `1px solid ${colors.border}`,
            borderRadius: 9,
            background: "#525659",
            display: "block",
          }}
        />
      )}
    </div>
  );
}
