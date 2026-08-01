import { useApp } from "../store";
import { css } from "../css";

export function ExtensionPopup() {
  const { closeExt } = useApp();

  return (
    <div onClick={closeExt} style={css("position:fixed; inset:0; background:oklch(0.15 0.02 260 / 0.4); backdrop-filter:blur(2px); z-index:60; display:flex; align-items:center; justify-content:center;")}>
      <div onClick={(e) => e.stopPropagation()} style={css("width:360px; background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 40px 80px -30px oklch(0.2 0.05 260 / 0.7); animation:fadeUp .3s ease both;")}>
        <div style={css("background:oklch(0.55 0.15 255); color:#fff; padding:16px 18px; display:flex; align-items:center; gap:10px;")}>
          <div style={css("width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;")}>🧩</div>
          <div style={css("line-height:1.2;")}><div style={css("font-family:'Space Grotesk'; font-weight:600; font-size:14px;")}>PrepFor.Me</div><div style={css("font-size:11px; opacity:0.85;")}>boards.greenhouse.io/stripe</div></div>
        </div>
        <div style={css("padding:18px;")}>
          <div style={css("display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; color:oklch(0.35 0.1 150); margin-bottom:14px;")}><span style={css("width:8px;height:8px;border-radius:50%;background:oklch(0.55 0.13 145);")}></span>Filled 11 of 13 fields from your profile</div>
          <div style={css("display:flex; flex-direction:column; gap:8px; margin-bottom:16px;")}>
            <div style={css("display:flex; align-items:center; gap:9px; font-size:12.5px;")}><span style={css("color:oklch(0.55 0.13 145);")}>✓</span>Name, email, phone, location</div>
            <div style={css("display:flex; align-items:center; gap:9px; font-size:12.5px;")}><span style={css("color:oklch(0.55 0.13 145);")}>✓</span>Work authorization · notice period</div>
            <div style={css("display:flex; align-items:center; gap:9px; font-size:12.5px; color:oklch(0.45 0.1 40);")}><span>!</span>"Why Stripe?" — needs your voice</div>
            <div style={css("display:flex; align-items:center; gap:9px; font-size:12.5px; color:oklch(0.45 0.1 40);")}><span>!</span>Salary expectation — confirm range</div>
          </div>
          <div style={css("background:oklch(0.98 0.003 260); border:1px solid oklch(0.92 0.006 260); border-radius:10px; padding:12px; font-size:12px; color:oklch(0.4 0.015 260); line-height:1.5; margin-bottom:14px;")}>Review every field, then click <strong>Stripe's own submit button</strong>. PrepFor.Me never submits for you.</div>
          <button onClick={closeExt} style={css("width:100%; font-family:'IBM Plex Sans'; font-size:13.5px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:12px; border-radius:10px; cursor:pointer;")}>Got it — I'll review</button>
        </div>
      </div>
    </div>
  );
}
