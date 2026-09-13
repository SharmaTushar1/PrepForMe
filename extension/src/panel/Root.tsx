import { useEffect, useState } from "react";
import { detectAts, scrapeJob, type AtsKind, type DetectedJob } from "../content/detect";
import { App } from "./App";
import { colors } from "./theme";
import type { ExtensionMessage } from "../lib/messages";

/**
 * Owns whether the panel is open. Auto-opens when the page looks like a job
 * posting; otherwise stays fully invisible (no badge, nothing in the DOM)
 * until the toolbar icon forces it open, so browsing an ordinary page never
 * shows PrepFor.Me chrome uninvited.
 */
export function Root() {
  const [ats, setAts] = useState<AtsKind | null>(null);
  const [job, setJob] = useState<DetectedJob | null>(null);
  const [open, setOpen] = useState(false);
  const [everActivated, setEverActivated] = useState(false);

  useEffect(() => {
    const detected = detectAts();
    if (detected) {
      setAts(detected);
      setJob(scrapeJob(detected));
      setOpen(true);
      setEverActivated(true);
    }
  }, []);

  useEffect(() => {
    const listener = (message: ExtensionMessage) => {
      if (message.type !== "TOGGLE_PANEL") return;
      setEverActivated(true);
      setOpen((wasOpen) => {
        const nextOpen = !wasOpen;
        if (nextOpen && !job) {
          const kind = ats ?? "generic";
          setAts(kind);
          setJob(scrapeJob(kind));
        }
        return nextOpen;
      });
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ats, job]);

  if (!everActivated) return null;

  return (
    <div style={{ position: "fixed", top: 18, right: 18, zIndex: 2147483647 }}>
      {open && ats && job ? (
        <App ats={ats} initialJob={job} onClose={() => setOpen(false)} />
      ) : (
        <LauncherButton onClick={() => setOpen(true)} />
      )}
    </div>
  );
}

function LauncherButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Open PrepFor.Me"
      style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: colors.primary,
        border: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow: "0 10px 24px -8px rgba(20,20,30,0.4)",
        position: "relative",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      </svg>
      <span
        style={{
          position: "absolute",
          top: -3,
          right: -3,
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: colors.success,
          border: "2px solid #fff",
        }}
      />
    </button>
  );
}
