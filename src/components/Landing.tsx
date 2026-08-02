import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store";
import { useSession } from "../auth/SessionProvider";
import { css } from "../css";
import { ROUTES } from "../routes";
import { LogoMark } from "./Logo";

const DEMO_ROUTES = ["add-role", "tailor", "company-prep", "debrief"];
const DEMO_INTERVAL = 3400;

export function Landing() {
  const { openContact } = useApp();
  const { session } = useSession();
  const navigate = useNavigate();

  // The hero walkthrough rotates only while someone is on this page.
  const [demo, setDemoState] = useState(0);
  const timer = useRef<number | null>(null);

  const startRotation = useCallback(() => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = window.setInterval(
      () => setDemoState((d) => (d + 1) % DEMO_ROUTES.length),
      DEMO_INTERVAL,
    );
  }, []);

  useEffect(() => {
    startRotation();
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, [startRotation]);

  const setDemo = (i: number) => {
    setDemoState(i);
    startRotation();
  };

  const signIn = () => navigate(ROUTES.login);
  const getStarted = () => navigate(session ? ROUTES.onboarding : ROUTES.login);

  const dBg = (i: number) => (demo === i ? "oklch(0.55 0.15 255 / 0.08)" : "#fff");
  const dBorder = (i: number) =>
    demo === i ? "oklch(0.55 0.15 255 / 0.4)" : "oklch(0.9 0.006 260)";
  const dFg = (i: number) => (demo === i ? "oklch(0.4 0.13 255)" : "oklch(0.5 0.015 260)");

  const stepTab = (i: number, label: string) => (
    <div
      onClick={() => setDemo(i)}
      style={{
        flex: 1,
        cursor: "pointer",
        padding: "10px 12px",
        borderRadius: "9px",
        border: `1px solid ${dBorder(i)}`,
        background: dBg(i),
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: 600, color: dFg(i) }}>{label}</div>
    </div>
  );

  return (
    <div
      style={css(
        "background: radial-gradient(120% 90% at 80% -10%, oklch(0.55 0.15 255 / 0.09), transparent 55%), oklch(0.985 0.003 260);",
      )}
    >
      {/* nav */}
      <div
        style={css(
          "position:sticky; top:0; z-index:40; backdrop-filter:blur(10px); background:oklch(0.985 0.003 260 / 0.8); border-bottom:1px solid oklch(0.92 0.006 260);",
        )}
      >
        <div style={css("max-width:1200px; margin:0 auto; padding:16px 32px; display:flex; align-items:center; gap:14px;")}>
          <div style={css("display:flex; align-items:center; gap:9px;")}>
            <LogoMark size={26} />
            <span style={css("font-family:'Space Grotesk',sans-serif; font-weight:600; font-size:17px; letter-spacing:-0.01em;")}>
              PrepFor<span style={css("color:oklch(0.55 0.15 255);")}>.Me</span>
            </span>
          </div>
          <div style={css("display:flex; gap:26px; margin-left:32px;")}>
            <a href="#how" style={css("font-size:14px; color:oklch(0.4 0.015 260);")}>How it works</a>
            <a href="#features" style={css("font-size:14px; color:oklch(0.4 0.015 260);")}>Features</a>
            <a href="#dossier" style={css("font-size:14px; color:oklch(0.4 0.015 260);")}>Company prep</a>
            <a href="#reviews" style={css("font-size:14px; color:oklch(0.4 0.015 260);")}>Reviews</a>
            <a href="#pricing" style={css("font-size:14px; color:oklch(0.4 0.015 260);")}>Pricing</a>
          </div>
          <div style={css("margin-left:auto; display:flex; align-items:center; gap:14px;")}>
            <button onClick={openContact} style={css("font-family:'IBM Plex Sans'; font-size:14px; font-weight:500; background:none; border:none; color:oklch(0.4 0.015 260); cursor:pointer;")}>Contact</button>
            <button onClick={signIn} style={css("font-family:'IBM Plex Sans'; font-size:14px; font-weight:500; background:none; border:none; color:oklch(0.35 0.02 260); cursor:pointer;")}>Sign in</button>
            <button onClick={getStarted} style={css("font-family:'IBM Plex Sans'; font-size:14px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:10px 16px; border-radius:9px; cursor:pointer;")}>Get started</button>
          </div>
        </div>
      </div>

      {/* hero */}
      <div style={css("max-width:1200px; margin:0 auto; padding:76px 32px 40px; display:grid; grid-template-columns:1fr 1.05fr; gap:56px; align-items:center;")}>
        <div>
          <div style={css("display:inline-flex; align-items:center; gap:8px; font-family:'IBM Plex Mono',monospace; font-size:12px; letter-spacing:0.06em; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.1); padding:6px 12px; border-radius:100px; margin-bottom:22px;")}>
            <span style={css("width: 6px; height: 6px; border-radius: 50%; background: oklch(0.55 0.15 255);")}></span>For people who apply with intent
          </div>
          <h1 style={css("font-family:'Space Grotesk',sans-serif; font-size:52px; line-height:1.04; font-weight:600; letter-spacing:-0.025em; margin:0 0 20px;")}>Apply to jobs, better. Smarter.</h1>
          <p style={css("font-size:18px; line-height:1.6; color:oklch(0.4 0.015 260); margin:0 0 30px; max-width:490px; text-wrap:pretty;")}>PrepFor.Me tailors your resume truthfully to each role and builds deep, company-specific interview prep that compounds every time you use it. Not a spray-and-pray machine — a war room for high-intent applications.</p>
          <div style={css("display:flex; gap:14px; align-items:center;")}>
            <button onClick={getStarted} style={css("font-family:'IBM Plex Sans'; font-size:15px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:14px 24px; border-radius:11px; cursor:pointer; box-shadow:0 10px 24px -12px oklch(0.55 0.15 255 / 0.8);")}>Start with your resume</button>
            <button onClick={signIn} style={css("font-family:'IBM Plex Sans'; font-size:15px; font-weight:600; color:oklch(0.3 0.02 260); background:#fff; border:1px solid oklch(0.88 0.006 260); padding:14px 22px; border-radius:11px; cursor:pointer;")}>Sign in →</button>
          </div>
          <div style={css("display:flex; gap:26px; margin-top:34px;")}>
            <div><div style={css("font-family:'Space Grotesk'; font-size:24px; font-weight:600;")}>2.4×</div><div style={css("font-size:12.5px; color:oklch(0.5 0.015 260);")}>higher response rate</div></div>
            <div style={css("width:1px; background:oklch(0.9 0.006 260);")}></div>
            <div><div style={css("font-family:'Space Grotesk'; font-size:24px; font-weight:600;")}>0</div><div style={css("font-size:12.5px; color:oklch(0.5 0.015 260);")}>applications auto-submitted</div></div>
            <div style={css("width:1px; background:oklch(0.9 0.006 260);")}></div>
            <div><div style={css("font-family:'Space Grotesk'; font-size:24px; font-weight:600;")}>100%</div><div style={css("font-size:12.5px; color:oklch(0.5 0.015 260);")}>your real experience</div></div>
          </div>
        </div>

        {/* animated walkthrough */}
        <div>
          <div style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:16px; box-shadow:0 30px 70px -40px oklch(0.3 0.05 260 / 0.6); overflow:hidden;")}>
            <div style={css("display:flex; align-items:center; gap:7px; padding:13px 16px; border-bottom:1px solid oklch(0.93 0.006 260); background:oklch(0.99 0.003 260);")}>
              <span style={css("width:11px;height:11px;border-radius:50%;background:oklch(0.85 0.02 30);")}></span>
              <span style={css("width:11px;height:11px;border-radius:50%;background:oklch(0.88 0.02 90);")}></span>
              <span style={css("width:11px;height:11px;border-radius:50%;background:oklch(0.85 0.03 145);")}></span>
              <span style={css("margin-left:12px; font-family:'IBM Plex Mono',monospace; font-size:11px; color:oklch(0.55 0.01 260);")}>prepfor.me / {DEMO_ROUTES[demo]}</span>
            </div>
            <div style={css("height:340px; position:relative; background:oklch(0.988 0.003 260);")}>
              {demo === 0 && (
                <div style={css("position:absolute; inset:0; padding:28px; animation:fadeUp .5s ease both;")}>
                  <div style={css("font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:16px;")}>Step 1 · Add a role</div>
                  <div style={css("font-family:'Space Grotesk'; font-size:20px; font-weight:600; margin-bottom:16px;")}>Paste the job description</div>
                  <div style={css("border:1px dashed oklch(0.8 0.01 260); border-radius:12px; padding:18px; background:#fff; font-size:13px; color:oklch(0.45 0.015 260); line-height:1.55;")}>We're hiring a <strong style={css("color:#10151c;")}>Staff Software Engineer</strong> at Stripe to build resilient payments infrastructure at scale. You'll own distributed systems in Go, mentor engineers, and drive reliability across…</div>
                  <div style={css("display:flex; gap:10px; margin-top:18px;")}><div style={css("background:oklch(0.55 0.15 255); color:#fff; font-size:13px; font-weight:600; padding:9px 16px; border-radius:9px;")}>Add role</div><div style={css("border:1px solid oklch(0.88 0.006 260); font-size:13px; padding:9px 16px; border-radius:9px; color:oklch(0.4 0.02 260);")}>or paste a URL</div></div>
                </div>
              )}
              {demo === 1 && (
                <div style={css("position:absolute; inset:0; padding:28px; animation:fadeUp .5s ease both;")}>
                  <div style={css("font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:16px;")}>Step 2 · Tailor — truthfully</div>
                  <div style={css("font-family:'Space Grotesk'; font-size:20px; font-weight:600; margin-bottom:4px;")}>We reframe your real work</div>
                  <div style={css("font-size:13px; color:oklch(0.5 0.015 260); margin-bottom:16px;")}>Never invented. Here's exactly what changed:</div>
                  <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:10px; overflow:hidden; font-size:12.5px;")}>
                    <div style={css("padding:12px 14px; background:oklch(0.55 0.13 25 / 0.06); color:oklch(0.45 0.06 25); border-bottom:1px solid oklch(0.93 0.006 260); text-decoration:line-through; text-decoration-color:oklch(0.6 0.1 25);")}>Built internal tooling to reduce on-call load.</div>
                    <div style={css("padding:12px 14px; background:oklch(0.55 0.13 145 / 0.07); color:oklch(0.32 0.09 150);")}>Drove <strong>reliability</strong> across <strong>distributed systems</strong>, cutting on-call incidents 40% — your real work, re-emphasized for this role.</div>
                  </div>
                  <div style={css("display:flex; gap:7px; margin-top:16px; flex-wrap:wrap;")}><span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:oklch(0.55 0.13 145 / 0.12); color:oklch(0.32 0.09 150); padding:4px 9px; border-radius:6px;")}>✓ distributed systems</span><span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:oklch(0.55 0.13 145 / 0.12); color:oklch(0.32 0.09 150); padding:4px 9px; border-radius:6px;")}>✓ reliability</span><span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:oklch(0.55 0.13 40 / 0.12); color:oklch(0.45 0.1 40); padding:4px 9px; border-radius:6px;")}>gap: Go</span></div>
                </div>
              )}
              {demo === 2 && (
                <div style={css("position:absolute; inset:0; padding:28px; animation:fadeUp .5s ease both;")}>
                  <div style={css("font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:16px;")}>Step 3 · Company prep that compounds</div>
                  <div style={css("font-family:'Space Grotesk'; font-size:20px; font-weight:600; margin-bottom:4px;")}>Know Stripe cold</div>
                  <div style={css("font-size:13px; color:oklch(0.5 0.015 260); margin-bottom:20px;")}>7 first-party sources · 3 of your recaps</div>
                  <div style={css("display:flex; flex-direction:column-reverse; gap:6px; max-width:320px;")}>
                    <div style={css("height:18px; border-radius:5px; background:oklch(0.55 0.15 255); width:100%; transform-origin:left; animation:growBar .6s .0s ease both;")}></div>
                    <div style={css("height:18px; border-radius:5px; background:oklch(0.55 0.15 255 / 0.78); width:84%; transform-origin:left; animation:growBar .6s .1s ease both;")}></div>
                    <div style={css("height:18px; border-radius:5px; background:oklch(0.55 0.15 255 / 0.56); width:70%; transform-origin:left; animation:growBar .6s .2s ease both;")}></div>
                    <div style={css("height:18px; border-radius:5px; background:oklch(0.55 0.15 255 / 0.34); width:55%; transform-origin:left; animation:growBar .6s .3s ease both;")}></div>
                    <div style={css("height:18px; border-radius:5px; background:oklch(0.55 0.15 255 / 0.18); width:42%; transform-origin:left; animation:growBar .6s .4s ease both;")}></div>
                  </div>
                  <div style={css("font-size:12.5px; color:oklch(0.45 0.015 260); margin-top:18px;")}>Chat with everything you've gathered — answers cite their sources.</div>
                </div>
              )}
              {demo === 3 && (
                <div style={css("position:absolute; inset:0; padding:28px; animation:fadeUp .5s ease both;")}>
                  <div style={css("font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:16px;")}>Step 4 · Close the loop</div>
                  <div style={css("font-family:'Space Grotesk'; font-size:20px; font-weight:600; margin-bottom:16px;")}>Log the interview → prep levels up</div>
                  <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:16px; background:#fff;")}>
                    <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260);")}>Technical round · Stripe</div>
                    <div style={css("font-size:13.5px; margin-top:6px; line-height:1.5;")}>"Design a rate limiter for the payments API." — asked in round 2.</div>
                  </div>
                  <div style={css("display:flex; align-items:center; gap:11px; margin-top:16px; background:oklch(0.55 0.13 145 / 0.09); border:1px solid oklch(0.55 0.13 145 / 0.25); border-radius:11px; padding:14px 16px;")}>
                    <div style={css("width:30px;height:30px;border-radius:50%;background:oklch(0.55 0.13 145);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;")}>↑</div>
                    <div style={css("font-size:13px; color:oklch(0.3 0.08 150); line-height:1.45;")}><strong>Added to Stripe prep.</strong> Future questions will draw on this.</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* step tabs */}
          <div style={css("display:flex; gap:8px; margin-top:16px;")}>
            {stepTab(0, "1 · Add role")}
            {stepTab(1, "2 · Tailor")}
            {stepTab(2, "3 · Prep")}
            {stepTab(3, "4 · Recap")}
          </div>
          <div style={css("text-align:center; font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:12px;")}>This example is an engineer — but the same flow works for consultants, salespeople, recruiters, designers, nurses, any role.</div>
        </div>
      </div>

      {/* trust strip */}
      <div style={css("max-width:1200px; margin:0 auto; padding:30px 32px 10px;")}>
        <div style={css("font-family:'IBM Plex Mono',monospace; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.6 0.01 260); text-align:center; margin-bottom:18px;")}>Candidates prep for roles at</div>
        <div style={css("display:flex; justify-content:center; gap:44px; flex-wrap:wrap; opacity:0.55; font-family:'Space Grotesk'; font-weight:600; font-size:18px; color:oklch(0.4 0.015 260);")}>
          <span>Stripe</span><span>McKinsey</span><span>Michael Page</span><span>Salesforce</span><span>Notion</span><span>Deloitte</span><span>Datadog</span>
        </div>
      </div>

      {/* how it works */}
      <div id="how" style={css("max-width:1200px; margin:0 auto; padding:80px 32px 40px;")}>
        <div style={css("text-align:center; margin-bottom:44px;")}>
          <div style={css("font-family:'IBM Plex Mono',monospace; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.4 0.13 255); margin-bottom:12px;")}>The core loop</div>
          <h2 style={css("font-family:'Space Grotesk'; font-size:36px; font-weight:600; letter-spacing:-0.02em; margin:0 0 12px;")}>From "I want to switch" to "I got the offer"</h2>
          <p style={css("font-size:16px; color:oklch(0.45 0.015 260); max-width:560px; margin:0 auto;")}>One tool for the whole search. Preparation quality — not application volume.</p>
        </div>
        <div style={css("display:grid; grid-template-columns:repeat(4,1fr); gap:18px;")}>
          {[
            ["01", "Upload your resume", "We parse it into a structured profile — every bullet an editable object. You edit, never type from scratch."],
            ["02", "Tailor to each role", "Paste a JD. Get a truthfully tailored variant plus an ATS keyword-gap view — with the diff of what changed and why."],
            ["03", "Build company prep", "A per-company knowledge base you can chat with — built from first-party sources and interview recaps of thousands of candidates."],
            ["04", "Recap & compound", "After each interview, log what was asked. Every recap makes the next round — and the next candidate-you — sharper."],
          ].map(([n, title, body]) => (
            <div key={n} style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:14px; padding:22px;")}>
              <div style={css("font-family:'IBM Plex Mono'; font-size:12px; color:oklch(0.55 0.15 255); margin-bottom:12px;")}>{n}</div>
              <div style={css("font-family:'Space Grotesk'; font-size:17px; font-weight:600; margin-bottom:8px;")}>{title}</div>
              <div style={css("font-size:13.5px; color:oklch(0.45 0.015 260); line-height:1.55;")}>{body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* features */}
      <div id="features" style={css("max-width:1200px; margin:0 auto; padding:56px 32px;")}>
        <div style={css("display:grid; grid-template-columns:1fr 1fr; gap:20px;")}>
          <div style={css("grid-column:1 / -1; background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:16px; padding:32px; display:grid; grid-template-columns:1fr 1.1fr; gap:36px; align-items:center;")}>
            <div>
              <div style={css("font-family:'IBM Plex Mono'; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.4 0.13 255); margin-bottom:12px;")}>Truthful by design</div>
              <h3 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; letter-spacing:-0.01em; margin:0 0 12px;")}>Reframes your real work. Never invents it.</h3>
              <p style={css("font-size:15px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0;")}>Every tailored resume shows the diff — the exact bullets we re-emphasized and why. The ATS gap view flags keywords you're genuinely missing and nudges you to surface real experience, never to stuff words you can't back up.</p>
            </div>
            <div style={css("border:1px solid oklch(0.92 0.006 260); border-radius:12px; overflow:hidden; font-size:12.5px;")}>
              <div style={css("padding:13px 15px; background:oklch(0.55 0.13 25 / 0.06); color:oklch(0.45 0.06 25); text-decoration:line-through; text-decoration-color:oklch(0.6 0.1 25); border-bottom:1px solid oklch(0.94 0.006 260);")}>Managed client accounts and hit my targets.</div>
              <div style={css("padding:13px 15px; background:oklch(0.55 0.13 145 / 0.07); color:oklch(0.3 0.09 150);")}>Owned a <strong>$4.2M enterprise book across EMEA</strong>, closing <strong>118% of quota</strong> — aligned to the role's expansion focus.</div>
              <div style={css("padding:11px 15px; background:#fff; color:oklch(0.5 0.015 260); border-top:1px solid oklch(0.94 0.006 260); font-family:'IBM Plex Mono'; font-size:11px;")}>↳ reframed from your real "account management" experience</div>
            </div>
          </div>

          <div style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:16px; padding:28px;")}>
            <div style={css("font-family:'IBM Plex Mono'; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.4 0.13 255); margin-bottom:12px;")}>The tracker</div>
            <h3 style={css("font-family:'Space Grotesk'; font-size:22px; font-weight:600; margin:0 0 10px;")}>Your whole pipeline, one glance</h3>
            <p style={css("font-size:14px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0 0 18px;")}>A kanban board or a dense table — your call. Honest funnel metrics show response and interview rates, and which resume variant actually converts.</p>
            <div style={css("display:flex; gap:8px;")}>
              <div style={css("flex:1; background:oklch(0.98 0.003 260); border:1px solid oklch(0.92 0.006 260); border-radius:9px; padding:10px; font-size:11px;")}><div style={css("font-family:'IBM Plex Mono'; color:oklch(0.55 0.01 260); margin-bottom:6px;")}>Applied</div><div style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:6px; padding:7px; font-weight:600;")}>Michael Page</div></div>
              <div style={css("flex:1; background:oklch(0.98 0.003 260); border:1px solid oklch(0.92 0.006 260); border-radius:9px; padding:10px; font-size:11px;")}><div style={css("font-family:'IBM Plex Mono'; color:oklch(0.55 0.01 260); margin-bottom:6px;")}>Screen</div><div style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:6px; padding:7px; font-weight:600;")}>Ramp</div></div>
              <div style={css("flex:1; background:oklch(0.55 0.15 255 / 0.06); border:1px solid oklch(0.55 0.15 255 / 0.3); border-radius:9px; padding:10px; font-size:11px;")}><div style={css("font-family:'IBM Plex Mono'; color:oklch(0.4 0.13 255); margin-bottom:6px;")}>Offer</div><div style={css("background:#fff; border:1px solid oklch(0.55 0.15 255 / 0.4); border-radius:6px; padding:7px; font-weight:600;")}>Bain</div></div>
            </div>
          </div>

          <div style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:16px; padding:28px;")}>
            <div style={css("font-family:'IBM Plex Mono'; font-size:12px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.4 0.13 255); margin-bottom:12px;")}>The extension</div>
            <h3 style={css("font-family:'Space Grotesk'; font-size:22px; font-weight:600; margin:0 0 10px;")}>Autofills forms. Never submits.</h3>
            <p style={css("font-size:14px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0 0 18px;")}>On Greenhouse, Lever, Ashby — the extension fills what it can from your profile and flags what it couldn't. Then it hands control back. You review every field and click the site's own submit. There is no submit button in PrepFor.Me.</p>
            <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; overflow:hidden;")}>
              <div style={css("padding:11px 14px; background:oklch(0.55 0.15 255); color:#fff; font-size:12.5px; font-weight:600; display:flex; align-items:center; gap:8px;")}><span style={css("width:7px;height:7px;border-radius:50%;background:#fff;")}></span>Filled 11 of 13 fields</div>
              <div style={css("padding:12px 14px; font-size:12.5px; color:oklch(0.45 0.015 260); line-height:1.5;")}>2 fields need you: <strong style={css("color:#10151c;")}>"Why Stripe?"</strong> and salary expectation. Review everything, then submit on the site.</div>
            </div>
          </div>
        </div>
      </div>

      {/* signature: dossier */}
      <div id="dossier" style={css("background:oklch(0.16 0.018 260); color:oklch(0.95 0.008 260);")}>
        <div style={css("max-width:1200px; margin:0 auto; padding:80px 32px; display:grid; grid-template-columns:1fr 1fr; gap:56px; align-items:center;")}>
          <div>
            <div style={css("font-family:'IBM Plex Mono'; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.72 0.11 255); margin-bottom:14px;")}>The signature · your moat</div>
            <h2 style={css("font-family:'Space Grotesk'; font-size:38px; font-weight:600; letter-spacing:-0.02em; line-height:1.08; margin:0 0 18px;")}>Every company you chase gets a file that only gets deeper.</h2>
            <p style={css("font-size:16px; line-height:1.65; color:oklch(0.75 0.01 260); margin:0 0 20px;")}>Add first-party sources — their blog, careers page, product or service pages, recent news. Log what got asked in real interviews. PrepFor.Me folds it all into a company knowledge base you can chat with, and it compounds: the more you use it, the sharper your prep gets.</p>
            <div style={css("display:flex; gap:22px;")}>
              <div><div style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; color:oklch(0.72 0.11 255);")}>7</div><div style={css("font-size:13px; color:oklch(0.65 0.01 260);")}>sources gathered</div></div>
              <div><div style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; color:oklch(0.72 0.11 255);")}>3</div><div style={css("font-size:13px; color:oklch(0.65 0.01 260);")}>recaps logged</div></div>
              <div><div style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; color:oklch(0.72 0.11 255);")}>+2</div><div style={css("font-size:13px; color:oklch(0.65 0.01 260);")}>new likely themes</div></div>
            </div>
          </div>
          <div style={css("background:oklch(0.2 0.02 260); border:1px solid oklch(0.32 0.02 260); border-radius:16px; padding:28px;")}>
            <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:oklch(0.65 0.06 255); margin-bottom:8px;")}>Prep Space · Michael Page</div>
            <div style={css("font-family:'Space Grotesk'; font-size:22px; font-weight:600; margin-bottom:22px;")}>Deepening every round</div>
            <div style={css("display:flex; flex-direction:column-reverse; gap:7px;")}>
              <div style={css("height:22px; border-radius:6px; background:oklch(0.72 0.11 255); width:100%; box-shadow:0 0 18px oklch(0.72 0.11 255 / 0.5); transform-origin:left; animation:growBar .7s .0s ease both;")}></div>
              <div style={css("height:22px; border-radius:6px; background:oklch(0.72 0.11 255 / 0.78); width:85%; transform-origin:left; animation:growBar .7s .12s ease both;")}></div>
              <div style={css("height:22px; border-radius:6px; background:oklch(0.72 0.11 255 / 0.56); width:71%; transform-origin:left; animation:growBar .7s .24s ease both;")}></div>
              <div style={css("height:22px; border-radius:6px; background:oklch(0.72 0.11 255 / 0.34); width:56%; transform-origin:left; animation:growBar .7s .36s ease both;")}></div>
              <div style={css("height:22px; border-radius:6px; background:oklch(0.72 0.11 255 / 0.18); width:42%; transform-origin:left; animation:growBar .7s .48s ease both;")}></div>
            </div>
            <div style={css("font-size:13px; color:oklch(0.7 0.01 260); margin-top:20px; line-height:1.55; border-top:1px solid oklch(0.32 0.02 260); padding-top:16px;")}>"What competencies does Michael Page screen for in a bilingual recruiter loop?" — answered from their careers page <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.72 0.11 255);")}>[careers · 2]</span> and your round-2 recap.</div>
          </div>
        </div>
      </div>

      {/* reviews */}
      <div id="reviews" style={css("max-width:1200px; margin:0 auto; padding:80px 32px;")}>
        <div style={css("text-align:center; margin-bottom:44px;")}>
          <div style={css("font-family:'IBM Plex Mono'; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.4 0.13 255); margin-bottom:12px;")}>From the war room</div>
          <h2 style={css("font-family:'Space Grotesk'; font-size:36px; font-weight:600; letter-spacing:-0.02em; margin:0;")}>Job seekers who stopped spraying</h2>
        </div>
        <div style={css("display:grid; grid-template-columns:repeat(3,1fr); gap:18px;")}>
          {[
            ["\"The recap loop is unreal. By my third case interview the prep basically knew which frameworks they'd push on. I walked in calm.\"", "M", "Maya R.", "Management Consultant → Bain"],
            ["\"I applied to 9 roles instead of 90 and landed 4 final rounds. The truthful diff meant I could actually defend every line in the interview.\"", "D", "Daniel K.", "Enterprise Account Exec → Ramp"],
            ["\"Finally a tool that doesn't try to auto-apply for me. It preps, I decide. That's the whole reason I trust it with my history.\"", "P", "Priya S.", "Bilingual Recruiter → Michael Page"],
          ].map(([quote, initial, name, role]) => (
            <div key={name} style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:14px; padding:24px;")}>
              <div style={css("color:oklch(0.75 0.13 85); font-size:15px; margin-bottom:12px;")}>★★★★★</div>
              <p style={css("font-size:14.5px; line-height:1.6; margin:0 0 20px; color:oklch(0.25 0.015 260);")}>{quote}</p>
              <div style={css("display:flex; align-items:center; gap:11px;")}><div style={css("width:36px;height:36px;border-radius:50%;background:oklch(0.55 0.15 255 / 0.15);color:oklch(0.4 0.13 255);display:flex;align-items:center;justify-content:center;font-weight:600;")}>{initial}</div><div><div style={css("font-size:13.5px; font-weight:600;")}>{name}</div><div style={css("font-size:12px; color:oklch(0.5 0.015 260);")}>{role}</div></div></div>
            </div>
          ))}
        </div>
      </div>

      {/* pricing */}
      <div id="pricing" style={css("max-width:1100px; margin:0 auto; padding:56px 32px 80px;")}>
        <div style={css("text-align:center; margin-bottom:44px;")}>
          <div style={css("font-family:'IBM Plex Mono'; font-size:12px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.4 0.13 255); margin-bottom:12px;")}>Pricing</div>
          <h2 style={css("font-family:'Space Grotesk'; font-size:36px; font-weight:600; letter-spacing:-0.02em; margin:0 0 10px;")}>Depth, not seats</h2>
          <p style={css("font-size:16px; color:oklch(0.45 0.015 260); margin:0;")}>Start free. Every AI action is durable and editable — we never charge you for pointless regeneration.</p>
        </div>
        <div style={css("display:grid; grid-template-columns:repeat(3,1fr); gap:18px; align-items:stretch;")}>
          <div style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:16px; padding:28px; display:flex; flex-direction:column;")}>
            <div style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600;")}>Starter</div>
            <div style={css("margin:14px 0 6px;")}><span style={css("font-family:'Space Grotesk'; font-size:38px; font-weight:600;")}>$0</span></div>
            <div style={css("font-size:13px; color:oklch(0.5 0.015 260); margin-bottom:20px;")}>The core loop, forever.</div>
            <div style={css("display:flex; flex-direction:column; gap:10px; font-size:13.5px; color:oklch(0.35 0.015 260); flex:1;")}>
              <div>✓ Structured profile</div><div>✓ Up to 5 tracked applications</div><div>✓ Resume tailoring + ATS gap</div><div>✓ 1 company prep workspace</div>
            </div>
            <button onClick={getStarted} style={css("margin-top:22px; font-family:'IBM Plex Sans'; font-size:14px; font-weight:600; color:oklch(0.3 0.02 260); background:#fff; border:1px solid oklch(0.85 0.006 260); padding:12px; border-radius:10px; cursor:pointer;")}>Get started</button>
          </div>
          <div style={css("background:#fff; border:2px solid oklch(0.55 0.15 255); border-radius:16px; padding:28px; display:flex; flex-direction:column; position:relative; box-shadow:0 24px 50px -30px oklch(0.55 0.15 255 / 0.7);")}>
            <div style={css("position:absolute; top:-12px; left:28px; background:oklch(0.55 0.15 255); color:#fff; font-family:'IBM Plex Mono'; font-size:11px; padding:4px 11px; border-radius:100px;")}>MOST POPULAR</div>
            <div style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600;")}>Pro</div>
            <div style={css("margin:14px 0 6px;")}><span style={css("font-family:'Space Grotesk'; font-size:38px; font-weight:600;")}>$20</span><span style={css("font-size:14px; color:oklch(0.5 0.015 260);")}>/mo</span></div>
            <div style={css("font-size:13px; color:oklch(0.5 0.015 260); margin-bottom:20px;")}>For an active, serious search.</div>
            <div style={css("display:flex; flex-direction:column; gap:10px; font-size:13.5px; color:oklch(0.35 0.015 260); flex:1;")}>
              <div>✓ Unlimited applications</div><div>✓ Unlimited company prep workspaces</div><div>✓ Browser extension autofill</div><div>✓ Funnel &amp; conversion analytics</div><div>✓ Recap-fed prep, compounding</div>
            </div>
            <button onClick={getStarted} style={css("margin-top:22px; font-family:'IBM Plex Sans'; font-size:14px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:12px; border-radius:10px; cursor:pointer;")}>Start Pro</button>
          </div>
          <div style={css("background:oklch(0.98 0.003 260); border:1px solid oklch(0.9 0.006 260); border-radius:16px; padding:28px; display:flex; flex-direction:column;")}>
            <div style={css("display:flex; align-items:center; gap:8px;")}><span style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600;")}>Premium</span><span style={css("font-family:'IBM Plex Mono'; font-size:10px; background:oklch(0.9 0.008 260); color:oklch(0.45 0.015 260); padding:3px 8px; border-radius:100px;")}>SOON</span></div>
            <div style={css("margin:14px 0 6px;")}><span style={css("font-family:'Space Grotesk'; font-size:38px; font-weight:600; color:oklch(0.5 0.015 260);")}>—</span></div>
            <div style={css("font-size:13px; color:oklch(0.5 0.015 260); margin-bottom:20px;")}>The flagship prep engine.</div>
            <div style={css("display:flex; flex-direction:column; gap:10px; font-size:13.5px; color:oklch(0.5 0.015 260); flex:1;")}>
              <div>◔ Grounded mock interviews</div><div>◔ Rubric-based answer scoring</div><div>◔ Practice library (DSA, sys design)</div><div>◔ Company-specific drills</div>
            </div>
            <button disabled style={css("margin-top:22px; font-family:'IBM Plex Sans'; font-size:14px; font-weight:600; color:oklch(0.55 0.015 260); background:oklch(0.94 0.006 260); border:none; padding:12px; border-radius:10px; cursor:not-allowed;")}>Join waitlist</button>
          </div>
        </div>
      </div>

      {/* privacy band */}
      <div style={css("max-width:1200px; margin:0 auto; padding:0 32px 70px;")}>
        <div style={css("background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:16px; padding:32px; display:flex; align-items:center; gap:28px; flex-wrap:wrap;")}>
          <div style={css("flex:1; min-width:280px;")}>
            <h3 style={css("font-family:'Space Grotesk'; font-size:22px; font-weight:600; margin:0 0 8px;")}>The human is always in charge.</h3>
            <p style={css("font-size:14.5px; color:oklch(0.45 0.015 260); line-height:1.6; margin:0;")}>Nothing is submitted, sent, or published without your explicit say-so. We hold career data — all of which is stored in anonymously. So feel free to share as honest review of your interview experience as you'd like.</p>
          </div>
          <div style={css("display:flex; gap:12px; flex-wrap:wrap;")}>
            <span style={css("font-family:'IBM Plex Mono'; font-size:12px; background:oklch(0.98 0.003 260); border:1px solid oklch(0.9 0.006 260); padding:9px 14px; border-radius:100px;")}>🔒 Export anytime</span>
            <span style={css("font-family:'IBM Plex Mono'; font-size:12px; background:oklch(0.98 0.003 260); border:1px solid oklch(0.9 0.006 260); padding:9px 14px; border-radius:100px;")}>📎 Sourced answers</span>
          </div>
        </div>
      </div>

      {/* final cta */}
      <div style={css("background:oklch(0.55 0.15 255); color:#fff;")}>
        <div style={css("max-width:1200px; margin:0 auto; padding:72px 32px; text-align:center;")}>
          <h2 style={css("font-family:'Space Grotesk'; font-size:40px; font-weight:600; letter-spacing:-0.02em; margin:0 0 14px;")}>Walk into every interview knowing the company cold.</h2>
          <p style={css("font-size:17px; opacity:0.85; margin:0 0 28px;")}>Upload your resume. Your first tailored application takes about five minutes.</p>
          <button onClick={getStarted} style={css("font-family:'IBM Plex Sans'; font-size:16px; font-weight:600; color:oklch(0.4 0.13 255); background:#fff; border:none; padding:15px 30px; border-radius:12px; cursor:pointer;")}>Get started free</button>
        </div>
      </div>

      {/* footer */}
      <div style={css("background:oklch(0.16 0.018 260); color:oklch(0.65 0.01 260);")}>
        <div style={css("max-width:1200px; margin:0 auto; padding:40px 32px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;")}>
          <div style={css("display:flex; align-items:center; gap:9px;")}><LogoMark size={22} /><span style={css("font-family:'Space Grotesk'; font-weight:600; font-size:15px; color:oklch(0.9 0.008 260);")}>PrepFor<span style={css("color:oklch(0.72 0.11 255);")}>.Me</span></span></div>
          <div style={css("display:flex; align-items:center; gap:18px; font-size:13px;")}><span>Prepare deeply. Apply with intent. You decide.</span><button onClick={openContact} style={css("font-family:'IBM Plex Sans'; font-size:13px; color:oklch(0.72 0.11 255); background:none; border:none; cursor:pointer; padding:0;")}>Contact support</button></div>
          <div style={css("font-family:'IBM Plex Mono'; font-size:12px;")}>© 2026</div>
        </div>
      </div>
    </div>
  );
}
