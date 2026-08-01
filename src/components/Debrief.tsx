import { useApp } from "../store";
import { css } from "../css";
import { ACCENT } from "../data";

const ROUND_TYPES = ["Phone", "Technical", "System design", "Behavioral", "Onsite"];

export function Debrief() {
  const { state, selectedApp, backFromDebrief, setRoundType, saveDebrief } = useApp();

  return (
    <div style={css("padding:30px 40px 60px; max-width:720px; width:100%; animation:fadeIn .3s ease both;")}>
      <button onClick={backFromDebrief} style={css("font-family:'IBM Plex Sans'; font-size:13px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer; padding:0; margin-bottom:16px;")}>← Back</button>

      {state.debriefSaved && (
        <div style={css("text-align:center; padding:40px 20px; animation:fadeUp .4s ease both;")}>
          <div style={css("width:64px;height:64px;border-radius:18px;background:oklch(0.55 0.13 145 / 0.12);color:oklch(0.45 0.13 145);display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:30px;")}>↑</div>
          <h1 style={css("font-family:'Space Grotesk'; font-size:24px; font-weight:600; margin:0 0 8px;")}>Recap saved.</h1>
          <p style={css("font-size:15px; color:oklch(0.45 0.015 260); max-width:400px; margin:0 auto 24px; line-height:1.6;")}>Added to <strong style={css("color:#10151c;")}>{selectedApp.company} · {selectedApp.role} prep</strong> — future questions will draw on this. This space just leveled up.</p>
          <div style={css("max-width:280px; margin:0 auto; display:flex; flex-direction:column-reverse; gap:5px;")}>
            <div style={css("height:14px; border-radius:4px; background:oklch(0.55 0.15 255); width:100%; transform-origin:left; animation:growBar .6s .0s ease both;")}></div>
            <div style={css("height:14px; border-radius:4px; background:oklch(0.55 0.15 255 / 0.7); width:86%; transform-origin:left; animation:growBar .6s .1s ease both;")}></div>
            <div style={css("height:14px; border-radius:4px; background:oklch(0.55 0.15 255 / 0.45); width:72%; transform-origin:left; animation:growBar .6s .2s ease both;")}></div>
            <div style={css("height:14px; border-radius:4px; background:oklch(0.55 0.15 255 / 0.25); width:58%; transform-origin:left; animation:growBar .6s .3s ease both;")}></div>
          </div>
          <button onClick={backFromDebrief} style={css("margin-top:28px; font-family:'IBM Plex Sans'; font-size:14px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:12px 22px; border-radius:10px; cursor:pointer;")}>Back to application</button>
        </div>
      )}

      {!state.debriefSaved && (
        <div>
          <h1 style={css("font-family:'Space Grotesk'; font-size:24px; font-weight:600; margin:0 0 6px;")}>Log your {selectedApp.company} recap</h1>
          <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 24px;")}>Fast and structured, while it's fresh. This deepens the {selectedApp.company} · {selectedApp.role} prep space.</p>
          <div style={css("display:flex; flex-direction:column; gap:20px;")}>
            <div>
              <div style={css("font-size:13px; font-weight:600; margin-bottom:9px;")}>Round type</div>
              <div style={css("display:flex; gap:8px; flex-wrap:wrap;")}>
                {ROUND_TYPES.map((label) => {
                  const on = state.roundType === label;
                  return (
                    <button
                      key={label}
                      onClick={() => setRoundType(label)}
                      style={{
                        ...css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:500; padding:9px 15px; border-radius:100px; cursor:pointer;"),
                        border: `1px solid ${on ? ACCENT : "oklch(0.9 0.006 260)"}`,
                        background: on ? ACCENT : "#fff",
                        color: on ? "#fff" : "oklch(0.4 0.015 260)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div style={css("font-size:13px; font-weight:600; margin-bottom:9px;")}>Questions you were asked</div>
              <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:14px; background:#fff; font-size:13.5px; color:oklch(0.55 0.015 260); min-height:90px; line-height:1.6;")}>e.g. "Design a rate limiter for the payments API"<br />"Walk me through a hard incident you owned"</div>
            </div>
            <div style={css("display:flex; gap:16px;")}>
              <div style={css("flex:1;")}>
                <div style={css("font-size:13px; font-weight:600; margin-bottom:9px;")}>How did it go?</div>
                <div style={css("display:flex; gap:8px;")}>
                  <button style={css("flex:1; font-family:'IBM Plex Sans'; font-size:13px; padding:9px; border-radius:9px; border:1px solid oklch(0.9 0.006 260); background:#fff; cursor:pointer;")}>Rough</button>
                  <button style={css("flex:1; font-family:'IBM Plex Sans'; font-size:13px; padding:9px; border-radius:9px; border:1px solid oklch(0.9 0.006 260); background:#fff; cursor:pointer;")}>OK</button>
                  <button style={css("flex:1; font-family:'IBM Plex Sans'; font-size:13px; padding:9px; border-radius:9px; border:1px solid oklch(0.55 0.13 145 / 0.4); background:oklch(0.55 0.13 145 / 0.08); color:oklch(0.35 0.1 150); font-weight:600; cursor:pointer;")}>Went well</button>
                </div>
              </div>
            </div>
            <div>
              <div style={css("font-size:13px; font-weight:600; margin-bottom:9px;")}>Notes <span style={css("font-weight:400; color:oklch(0.55 0.015 260);")}>(optional)</span></div>
              <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:14px; background:#fff; font-size:13.5px; color:oklch(0.55 0.015 260); min-height:70px;")}>Anything that'll help future-you or a future round…</div>
            </div>
            <button onClick={saveDebrief} style={css("font-family:'IBM Plex Sans'; font-size:15px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:14px; border-radius:11px; cursor:pointer;")}>Save recap</button>
          </div>
        </div>
      )}
    </div>
  );
}
