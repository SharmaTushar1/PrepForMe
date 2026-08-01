import { useApp } from "../store";
import { css } from "../css";
import { LogoMark } from "./Logo";
import { ACCENT } from "../data";

export function Onboarding() {
  const { state, obUpload, enterApp, finishOnboarding } = useApp();
  const step = state.obStep;
  const dot = (n: number) => (step >= n ? ACCENT : "oklch(0.9 0.006 260)");

  return (
    <div style={css("min-height:100vh; display:flex; align-items:center; justify-content:center; padding:40px; background:radial-gradient(110% 80% at 50% -10%, oklch(0.55 0.15 255 / 0.08), transparent 55%), oklch(0.985 0.003 260);")}>
      <div style={css("width:560px; max-width:100%;")}>
        <div style={css("display:flex; align-items:center; gap:9px; justify-content:center; margin-bottom:8px;")}>
          <LogoMark size={26} />
          <span style={css("font-family:'Space Grotesk'; font-weight:600; font-size:17px;")}>PrepFor<span style={css("color:oklch(0.55 0.15 255);")}>.Me</span></span>
        </div>

        {/* progress */}
        <div style={css("display:flex; gap:6px; justify-content:center; margin:20px 0 26px;")}>
          <span style={{ width: "44px", height: "4px", borderRadius: "2px", background: dot(0) }}></span>
          <span style={{ width: "44px", height: "4px", borderRadius: "2px", background: dot(1) }}></span>
          <span style={{ width: "44px", height: "4px", borderRadius: "2px", background: dot(2) }}></span>
        </div>

        <div style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:18px; padding:36px; box-shadow:0 30px 70px -44px oklch(0.3 0.05 260 / 0.6);")}>
          {step === 0 && (
            <div style={css("animation:fadeUp .4s ease both;")}>
              <h2 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0 0 8px;")}>Let's start with your resume.</h2>
              <p style={css("font-size:15px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0 0 24px;")}>We'll turn it into a structured profile you can edit — every bullet becomes its own editable object. You'll never type from scratch.</p>
              <div onClick={obUpload} style={css("border:2px dashed oklch(0.8 0.01 260); border-radius:14px; padding:44px 24px; text-align:center; cursor:pointer; background:oklch(0.99 0.003 260);")}>
                <div style={css("width:52px;height:52px;border-radius:14px;background:oklch(0.55 0.15 255 / 0.1);color:oklch(0.4 0.13 255);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:24px;")}>↑</div>
                <div style={css("font-weight:600; font-size:15px; margin-bottom:5px;")}>Drop your resume, or click to upload</div>
                <div style={css("font-size:13px; color:oklch(0.5 0.015 260);")}>PDF or Word · we'll take it from here</div>
              </div>
              <button onClick={enterApp} style={css("width:100%; margin-top:16px; background:none; border:none; font-size:13.5px; color:oklch(0.5 0.015 260); cursor:pointer;")}>or start from scratch instead</button>
            </div>
          )}

          {step === 1 && (
            <div style={css("text-align:center; padding:20px 0; animation:fadeIn .3s ease both;")}>
              <div style={css("width:60px;height:60px;border-radius:16px;background:oklch(0.55 0.15 255 / 0.1);display:flex;align-items:center;justify-content:center;margin:0 auto 22px;")}>
                <div style={css("width:26px;height:26px;border:3px solid oklch(0.55 0.15 255 / 0.3);border-top-color:oklch(0.55 0.15 255);border-radius:50%;animation:spin .8s linear infinite;")}></div>
              </div>
              <h2 style={css("font-family:'Space Grotesk'; font-size:22px; font-weight:600; margin:0 0 8px;")}>Reading your resume…</h2>
              <p style={css("font-size:14px; color:oklch(0.5 0.015 260); margin:0;")}>Extracting experiences, bullets, skills, and education. About 20 seconds.</p>
              <div style={css("text-align:left; margin-top:24px; display:flex; flex-direction:column; gap:9px; font-size:13px; color:oklch(0.4 0.015 260);")}>
                <div>✓ Found 3 roles</div>
                <div>✓ Extracted 14 achievement bullets</div>
                <div style={css("color:oklch(0.55 0.015 260);")}><span style={css("animation:blink 1s infinite;")}>◔</span> Categorizing skills…</div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div style={css("animation:fadeUp .4s ease both;")}>
              <h2 style={css("font-family:'Space Grotesk'; font-size:24px; font-weight:600; margin:0 0 6px;")}>Here's what we found. Fix anything.</h2>
              <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 22px;")}>You're editing, not starting over. Tap any field to correct it.</p>
              <div style={css("display:flex; flex-direction:column; gap:12px;")}>
                <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:15px;")}>
                  <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:oklch(0.55 0.015 260); margin-bottom:8px;")}>Experience · 1 of 3</div>
                  <div style={css("font-weight:600; font-size:15px;")}>Senior Software Engineer · Acme Cloud</div>
                  <div style={css("font-size:13px; color:oklch(0.5 0.015 260); margin-top:2px;")}>2021 — Present</div>
                  <div style={css("margin-top:10px; display:flex; flex-direction:column; gap:6px;")}>
                    <div style={css("font-size:13px; background:oklch(0.99 0.003 260); border:1px solid oklch(0.93 0.006 260); border-radius:7px; padding:8px 10px;")}>Led a 5-engineer team building fault-tolerant backend services.</div>
                    <div style={css("font-size:13px; background:oklch(0.99 0.003 260); border:1px solid oklch(0.93 0.006 260); border-radius:7px; padding:8px 10px;")}>Cut on-call incidents 40% with internal reliability tooling.</div>
                  </div>
                </div>
                <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:15px;")}>
                  <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.08em; text-transform:uppercase; color:oklch(0.55 0.015 260); margin-bottom:8px;")}>Skills</div>
                  <div style={css("display:flex; gap:7px; flex-wrap:wrap;")}>
                    <span style={css("font-size:12.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.35 0.11 255); padding:5px 11px; border-radius:100px;")}>Go</span>
                    <span style={css("font-size:12.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.35 0.11 255); padding:5px 11px; border-radius:100px;")}>Distributed systems</span>
                    <span style={css("font-size:12.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.35 0.11 255); padding:5px 11px; border-radius:100px;")}>Kubernetes</span>
                    <span style={css("font-size:12.5px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.35 0.11 255); padding:5px 11px; border-radius:100px;")}>Postgres</span>
                    <span style={css("font-size:12.5px; border:1px dashed oklch(0.8 0.01 260); color:oklch(0.5 0.015 260); padding:5px 11px; border-radius:100px;")}>+ add</span>
                  </div>
                </div>
              </div>
              <button onClick={finishOnboarding} style={css("width:100%; margin-top:22px; font-family:'IBM Plex Sans'; font-size:15px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:14px; border-radius:11px; cursor:pointer;")}>Looks right — take me in</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
