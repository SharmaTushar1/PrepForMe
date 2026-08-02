import { useApp } from "../store";
import { css } from "../css";
import { useDecoratedApplications } from "../data/derived";

export function Practice() {
  const { openContact } = useApp();
  const { deepest } = useDecoratedApplications();
  const grounding = deepest ? `your ${deepest.company} prep space` : "the prep space of a role you're tracking";

  return (
    <div style={css("padding:30px 40px 60px; max-width:820px; width:100%; animation:fadeIn .3s ease both;")}>
      <div style={css("display:flex; align-items:center; gap:10px; margin-bottom:6px;")}>
        <h1 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0;")}>Practice</h1>
        <span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:oklch(0.9 0.008 260); color:oklch(0.45 0.015 260); padding:3px 9px; border-radius:100px;")}>Premium · coming soon</span>
      </div>
      <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 24px; max-width:560px;")}>
        The flagship prep engine. Grounded mock interviews and rubric-scored feedback — practice
        against a company you're actually preparing for.
      </p>
      <div data-tour="practice" style={css("display:grid; grid-template-columns:1fr 1fr; gap:14px;")}>
        <Card
          title="Mock interview"
          body={`An AI interviewer grounded in ${grounding}. It asks what they actually ask.`}
        />
        <Card
          title="Evaluation engine"
          body="Rubric-based scoring on your answers — structure, depth, communication."
        />
        <Card
          title="Practice library"
          body="DSA, system design, behavioral drills — generic or company-specific."
        />
        <div style={css("border:2px solid oklch(0.55 0.15 255 / 0.3); border-radius:13px; padding:22px; background:oklch(0.55 0.15 255 / 0.04); display:flex; flex-direction:column; justify-content:center;")}>
          <div style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600; margin-bottom:4px;")}>Want this sooner?</div>
          <p style={css("font-size:12.5px; color:oklch(0.45 0.015 260); line-height:1.5; margin:0 0 12px;")}>
            Tell us what you'd want to practice first — it moves the roadmap.
          </p>
          <button
            onClick={openContact}
            className="pressable"
            style={css("font-family:'IBM Plex Sans'; font-size:13.5px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:11px; border-radius:9px; cursor:pointer;")}
          >
            Send us a note
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:22px; background:#fff; opacity:0.85;")}>
      <div style={css("font-family:'Space Grotesk'; font-size:17px; font-weight:600; margin-bottom:6px;")}>{title}</div>
      <p style={css("font-size:13px; color:oklch(0.45 0.015 260); line-height:1.55; margin:0;")}>{body}</p>
    </div>
  );
}
