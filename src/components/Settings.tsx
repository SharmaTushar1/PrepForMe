import { useApp } from "../store";
import { css } from "../css";

export function Settings() {
  const { openExt, signOut } = useApp();

  return (
    <div style={css("padding:30px 40px 60px; max-width:760px; width:100%; animation:fadeIn .3s ease both;")}>
      <h1 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0 0 24px;")}>Settings</h1>

      <div data-tour="privacy" style={css("border:2px solid oklch(0.55 0.15 255 / 0.25); border-radius:13px; padding:20px; background:oklch(0.55 0.15 255 / 0.03); margin-bottom:18px;")}>
        <div style={css("display:flex; align-items:center; gap:9px; margin-bottom:6px;")}><span style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600;")}>Privacy &amp; data</span><span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.12); padding:2px 8px; border-radius:100px;")}>you're in control</span></div>
        <p style={css("font-size:13px; color:oklch(0.45 0.015 260); margin:0 0 16px; line-height:1.55;")}>We hold your full career history so the app can tailor, prep, and autofill for you. You can export it anytime — plain and simple.</p>
        <div style={css("display:flex; gap:10px; flex-wrap:wrap;")}>
          <button style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:oklch(0.3 0.02 260); background:#fff; border:1px solid oklch(0.88 0.006 260); padding:10px 15px; border-radius:9px; cursor:pointer;")}>Export all my data</button>
          <button style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:oklch(0.3 0.02 260); background:#fff; border:1px solid oklch(0.88 0.006 260); padding:10px 15px; border-radius:9px; cursor:pointer;")}>Clear a company's corpus</button>
        </div>
      </div>

      <div style={css("display:flex; flex-direction:column; gap:12px;")}>
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:18px; background:#fff;")}>
          <div style={css("font-family:'Space Grotesk'; font-size:15px; font-weight:600; margin-bottom:14px;")}>Account</div>
          <div style={css("display:flex; justify-content:space-between; font-size:13.5px; padding:6px 0;")}><span style={css("color:oklch(0.5 0.015 260);")}>Name</span><span>Alex Chen</span></div>
          <div style={css("display:flex; justify-content:space-between; font-size:13.5px; padding:6px 0;")}><span style={css("color:oklch(0.5 0.015 260);")}>Email</span><span>alex@example.com</span></div>
          <div style={css("display:flex; justify-content:space-between; font-size:13.5px; padding:6px 0;")}><span style={css("color:oklch(0.5 0.015 260);")}>Plan</span><span style={css("color:oklch(0.4 0.13 255); font-weight:600;")}>Pro</span></div>
        </div>
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:18px; background:#fff;")}>
          <div style={css("display:flex; align-items:center; justify-content:space-between;")}><div><div style={css("font-family:'Space Grotesk'; font-size:15px; font-weight:600;")}>Browser extension</div><div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:2px;")}>Autofills forms · never submits</div></div><button onClick={openExt} style={css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.1); border:none; padding:9px 14px; border-radius:8px; cursor:pointer;")}>Preview popup</button></div>
        </div>
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:18px; background:#fff;")}>
          <div style={css("font-family:'Space Grotesk'; font-size:15px; font-weight:600; margin-bottom:14px;")}>Reminders</div>
          <div style={css("display:flex; justify-content:space-between; align-items:center; font-size:13.5px; padding:6px 0;")}><span>Nudge me to log a recap after an interview</span><span style={css("width:36px;height:20px;border-radius:100px;background:oklch(0.55 0.15 255);position:relative;")}><span style={css("position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:#fff;")}></span></span></div>
          <div style={css("display:flex; justify-content:space-between; align-items:center; font-size:13.5px; padding:6px 0;")}><span>Flag stale applications after 10 days</span><span style={css("width:36px;height:20px;border-radius:100px;background:oklch(0.55 0.15 255);position:relative;")}><span style={css("position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:50%;background:#fff;")}></span></span></div>
        </div>
        <button onClick={signOut} style={css("align-self:flex-start; font-family:'IBM Plex Sans'; font-size:13px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer; padding:8px 0;")}>Sign out</button>
      </div>
    </div>
  );
}
