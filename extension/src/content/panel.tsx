/**
 * Runs on every page except the web app's own origin (see manifest.json).
 * Mounted eagerly but renders nothing (`Root` returns null) until a job
 * posting is detected or the toolbar icon asks for it — see `panel/Root.tsx`.
 *
 * Shadow DOM keeps the host page's CSS from leaking in (and ours from
 * leaking out) — job sites do all sorts of aggressive global styling.
 */
import { createRoot } from "react-dom/client";
import { Root } from "../panel/Root";

const HOST_ID = "prepforme-extension-root";

function mount(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    @keyframes pfm-spin { to { transform: rotate(360deg); } }
  `;
  shadow.appendChild(style);

  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);

  createRoot(mountPoint).render(<Root />);
}

if (document.readyState === "complete" || document.readyState === "interactive") {
  mount();
} else {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
}
