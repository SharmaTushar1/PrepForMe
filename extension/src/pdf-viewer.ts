/**
 * Extension page that displays a PDF previously stashed in chrome.storage.session
 * by the background worker (OPEN_PDF_TAB). Keeps large PDFs out of the URL bar.
 */
async function main(): Promise<void> {
  const status = document.getElementById("status");

  const params = new URLSearchParams(window.location.search);
  const requestId = params.get("req");

  if (!requestId) {
    if (status) status.textContent = "No PDF to show. Go back to the PrepFor.Me panel and open it again.";
    return;
  }

  const storageKey = `pfm_pdf_preview_${requestId}`;
  const stored = await chrome.storage.session.get(storageKey);
  const payload = stored[storageKey] as
    | { base64: string; fileName?: string; createdAt: number }
    | undefined;

  if (!payload?.base64) {
    if (status) status.textContent = "No PDF to show. Go back to the PrepFor.Me panel and open it again.";
    return;
  }

  await chrome.storage.session.remove(storageKey);

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
