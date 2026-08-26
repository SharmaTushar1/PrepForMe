/**
 * Extension page that displays a PDF previously stashed in chrome.storage.session
 * by the background worker (OPEN_PDF_TAB). Keeps large PDFs out of the URL bar.
 */
const STORAGE_KEY = "pfm_pdf_preview";

async function main(): Promise<void> {
  const status = document.getElementById("status");
  const stored = await chrome.storage.session.get(STORAGE_KEY);
  const payload = stored[STORAGE_KEY] as
    | { base64: string; fileName?: string; createdAt: number }
    | undefined;

  if (!payload?.base64) {
    if (status) status.textContent = "No PDF to show. Go back to the PrepFor.Me panel and open it again.";
    return;
  }

  await chrome.storage.session.remove(STORAGE_KEY);

  try {
    const binary = atob(payload.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);

    if (payload.fileName) document.title = payload.fileName.replace(/\.pdf$/i, "");

    const embed = document.createElement("embed");
    embed.type = "application/pdf";
    embed.src = url;
    document.body.replaceChildren(embed);
  } catch {
    if (status) status.textContent = "Couldn't open that PDF. Try Download from the panel instead.";
  }
}

void main();
