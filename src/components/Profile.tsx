import { css } from "../css";

export function Profile() {
  return (
    <div style={css("padding:30px 40px 60px; max-width:900px; width:100%; animation:fadeIn .3s ease both;")}>
      <div style={css("display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;")}>
        <h1 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0;")}>Your profile</h1>
        <span style={css("font-family:'IBM Plex Mono'; font-size:12px; color:oklch(0.55 0.13 145);")}>✓ synced · the spine of everything</span>
      </div>
      <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 24px;")}>Every bullet and answer is an editable object — reorder, toggle, reuse. This is the source of truth for tailoring and autofill.</p>

      <div data-tour="profile-review" style={css("background:oklch(0.55 0.13 40 / 0.06); border:1px solid oklch(0.55 0.13 40 / 0.25); border-radius:11px; padding:14px 16px; margin-bottom:22px; display:flex; align-items:center; gap:12px;")}>
        <span style={css("font-size:13.5px; color:oklch(0.4 0.1 40);")}><strong>Standing review:</strong> 2 gaps — no quantified impact on 3 bullets, and your most recent role is missing a summary.</span>
        <button style={css("margin-left:auto; white-space:nowrap; font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.1 40); background:#fff; border:1px solid oklch(0.55 0.13 40 / 0.3); padding:7px 12px; border-radius:8px; cursor:pointer;")}>Fix gaps</button>
      </div>

      <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:12px;")}>Experience</div>
      <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:20px; background:#fff; margin-bottom:16px;")}>
        <div style={css("display:flex; align-items:flex-start; justify-content:space-between;")}>
          <div><div style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600;")}>Senior Software Engineer</div><div style={css("font-size:13.5px; color:oklch(0.45 0.015 260);")}>Acme Cloud · 2021 — Present</div></div>
          <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.55 0.015 260); cursor:pointer;")}>edit</span>
        </div>
        <div style={css("display:flex; flex-direction:column; gap:8px; margin-top:14px;")}>
          <div style={css("display:flex; align-items:center; gap:11px; background:oklch(0.99 0.003 260); border:1px solid oklch(0.93 0.006 260); border-radius:9px; padding:11px 13px;")}><span style={css("color:oklch(0.7 0.01 260); cursor:grab;")}>⠿</span><span style={css("font-size:13.5px; flex:1;")}>Led a 5-engineer team building fault-tolerant backend services in Go.</span><span style={css("width:32px;height:18px;border-radius:100px;background:oklch(0.55 0.15 255);position:relative;")}><span style={css("position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#fff;")}></span></span></div>
          <div style={css("display:flex; align-items:center; gap:11px; background:oklch(0.99 0.003 260); border:1px solid oklch(0.93 0.006 260); border-radius:9px; padding:11px 13px;")}><span style={css("color:oklch(0.7 0.01 260); cursor:grab;")}>⠿</span><span style={css("font-size:13.5px; flex:1;")}>Cut on-call incidents 40% with internal reliability tooling.</span><span style={css("width:32px;height:18px;border-radius:100px;background:oklch(0.55 0.15 255);position:relative;")}><span style={css("position:absolute;top:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#fff;")}></span></span></div>
          <div style={css("display:flex; align-items:center; gap:11px; background:oklch(0.99 0.003 260); border:1px solid oklch(0.93 0.006 260); border-radius:9px; padding:11px 13px; opacity:0.6;")}><span style={css("color:oklch(0.7 0.01 260); cursor:grab;")}>⠿</span><span style={css("font-size:13.5px; flex:1;")}>Mentored two junior engineers to promotion.</span><span style={css("width:32px;height:18px;border-radius:100px;background:oklch(0.85 0.006 260);position:relative;")}><span style={css("position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;")}></span></span></div>
        </div>
      </div>

      <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:16px;")}>
        <div>
          <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:12px;")}>Skills</div>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px; background:#fff; display:flex; gap:7px; flex-wrap:wrap;")}>
            <span style={css("font-size:12.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.35 0.11 255); padding:5px 11px; border-radius:100px;")}>Go</span>
            <span style={css("font-size:12.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.35 0.11 255); padding:5px 11px; border-radius:100px;")}>Distributed systems</span>
            <span style={css("font-size:12.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.35 0.11 255); padding:5px 11px; border-radius:100px;")}>Kubernetes</span>
            <span style={css("font-size:12.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.35 0.11 255); padding:5px 11px; border-radius:100px;")}>Postgres</span>
            <span style={css("font-size:12.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.35 0.11 255); padding:5px 11px; border-radius:100px;")}>gRPC</span>
            <span style={css("font-size:12.5px; border:1px dashed oklch(0.8 0.01 260); color:oklch(0.5 0.015 260); padding:5px 11px; border-radius:100px; cursor:pointer;")}>+ add</span>
          </div>
        </div>
        <div>
          <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:12px;")}>Common answers · power the autofill</div>
          <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:16px; background:#fff; display:flex; flex-direction:column; gap:10px;")}>
            <div style={css("font-size:13px;")}><div style={css("color:oklch(0.5 0.015 260); font-size:12px; margin-bottom:2px;")}>Notice period</div>2 weeks</div>
            <div style={css("font-size:13px;")}><div style={css("color:oklch(0.5 0.015 260); font-size:12px; margin-bottom:2px;")}>Work authorization</div>US citizen, no sponsorship needed</div>
            <div style={css("font-size:13px;")}><div style={css("color:oklch(0.5 0.015 260); font-size:12px; margin-bottom:2px;")}>Salary expectation</div>$220k — $260k</div>
          </div>
        </div>
      </div>
    </div>
  );
}
