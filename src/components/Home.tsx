import { useApp } from "../store";
import { css } from "../css";

export function Home() {
  const { goApplications, openStripeDebrief, openStripe, openFigma, goProfile } = useApp();

  return (
    <div style={css("padding:30px 40px 60px; max-width:1120px; width:100%; animation:fadeIn .3s ease both;")}>
      <div style={css("display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:26px;")}>
        <div>
          <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:8px;")}>Thursday · Week of Aug 3</div>
          <h1 style={css("font-family:'Space Grotesk'; font-size:28px; font-weight:600; letter-spacing:-0.01em; margin:0;")}>Two interviews to prep. One recap waiting.</h1>
        </div>
        <button onClick={goApplications} data-tour="add-role" style={css("font-family:'IBM Plex Sans'; font-size:13.5px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:11px 16px; border-radius:9px; cursor:pointer; white-space:nowrap;")}>+ Add a role</button>
      </div>

      {/* readiness */}
      <div data-tour="readiness" style={css("display:grid; grid-template-columns:1.3fr 1fr 1fr; gap:14px; margin-bottom:26px;")}>
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:18px; background:#fff;")}>
          <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-bottom:10px; font-weight:500;")}>Response rate</div>
          <div style={css("display:flex; align-items:baseline; gap:8px;")}><span style={css("font-family:'Space Grotesk'; font-size:32px; font-weight:600;")}>42%</span><span style={css("font-size:12.5px; color:oklch(0.5 0.13 145); font-weight:600;")}>↑ 8</span></div>
          <div style={css("margin-top:12px; height:6px; border-radius:3px; background:oklch(0.93 0.006 260); overflow:hidden;")}><div style={css("width:42%; height:100%; background:oklch(0.55 0.15 255); transform-origin:left; animation:growBar .8s ease both;")}></div></div>
          <div style={css("font-family:'IBM Plex Mono'; font-size:10.5px; color:oklch(0.6 0.01 260); margin-top:8px;")}>8 responses · 19 applications</div>
        </div>
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:18px; background:#fff;")}>
          <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-bottom:10px; font-weight:500;")}>Interviews this week</div>
          <div style={css("font-family:'Space Grotesk'; font-size:32px; font-weight:600;")}>2</div>
          <div style={css("font-size:12.5px; color:oklch(0.45 0.015 260); margin-top:12px; line-height:1.4;")}>Ramp · Fri 10am · Figma · Mon 2pm</div>
        </div>
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:18px; background:#fff;")}>
          <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-bottom:10px; font-weight:500;")}>Prep readiness</div>
          <div style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600;")}>Strong</div>
          <div style={css("display:flex; gap:4px; margin-top:14px;")}><span style={css("flex:1;height:6px;border-radius:3px;background:oklch(0.55 0.15 255);")}></span><span style={css("flex:1;height:6px;border-radius:3px;background:oklch(0.55 0.15 255);")}></span><span style={css("flex:1;height:6px;border-radius:3px;background:oklch(0.55 0.15 255);")}></span><span style={css("flex:1;height:6px;border-radius:3px;background:oklch(0.9 0.006 260);")}></span></div>
        </div>
      </div>

      <div style={css("display:grid; grid-template-columns:1.5fr 1fr; gap:22px;")}>
        {/* needs attention */}
        <div data-tour="needs">
          <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:12px;")}>Needs attention</div>
          <div style={css("display:flex; flex-direction:column; gap:10px;")}>
            <div onClick={openStripeDebrief} style={css("display:flex; align-items:center; gap:14px; border:1px solid oklch(0.9 0.006 260); border-left:3px solid oklch(0.55 0.15 255); border-radius:11px; padding:15px 16px; background:#fff; cursor:pointer;")}>
              <div style={css("flex:1;")}><div style={css("font-weight:600; font-size:14.5px;")}>Log your Stripe recap</div><div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:3px;")}>Onsite was yesterday — capture it while it's fresh</div></div>
              <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.5 0.13 40); background:oklch(0.55 0.13 40 / 0.1); padding:4px 8px; border-radius:5px;")}>1d ago</span>
            </div>
            <div onClick={openStripe} style={css("display:flex; align-items:center; gap:14px; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:15px 16px; background:#fff; cursor:pointer;")}>
              <div style={css("flex:1;")}><div style={css("font-weight:600; font-size:14.5px;")}>Prep · Ramp technical screen</div><div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:3px;")}>Tomorrow 10am — dossier ready, review themes</div></div>
              <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.5 0.015 260);")}>Fri</span>
            </div>
            <div onClick={openFigma} style={css("display:flex; align-items:center; gap:14px; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:15px 16px; background:#fff; cursor:pointer;")}>
              <div style={css("flex:1;")}><div style={css("font-weight:600; font-size:14.5px;")}>Tailor resume · Figma Staff Eng</div><div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:3px;")}>4 keyword gaps you can honestly close</div></div>
              <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.5 0.015 260);")}>Mon</span>
            </div>
          </div>
          <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin:24px 0 12px;")}>Jump back in</div>
          <div style={css("display:flex; gap:10px;")}>
            <button onClick={goApplications} style={css("flex:1; text-align:left; font-family:'IBM Plex Sans'; background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:14px; cursor:pointer;")}><div style={css("font-weight:600; font-size:13.5px;")}>Open the tracker</div><div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-top:2px;")}>8 active applications</div></button>
            <button onClick={goProfile} style={css("flex:1; text-align:left; font-family:'IBM Plex Sans'; background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:14px; cursor:pointer;")}><div style={css("font-weight:600; font-size:13.5px;")}>Review your profile</div><div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-top:2px;")}>2 gaps flagged</div></button>
          </div>
        </div>

        {/* dossier signature */}
        <div data-tour="dossier" onClick={openStripe} style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:18px; background:linear-gradient(180deg, oklch(0.55 0.15 255 / 0.05), #fff 60%); cursor:pointer;")}>
          <div style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.12em; text-transform:uppercase; color:oklch(0.5 0.02 260); margin-bottom:6px;")}>Deepest prep space · Stripe</div>
          <div style={css("font-family:'Space Grotesk'; font-size:19px; font-weight:600; margin-bottom:4px;")}>Deepening</div>
          <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-bottom:18px;")}>7 sources · 3 recaps</div>
          <div style={css("display:flex; flex-direction:column-reverse; gap:5px;")}>
            <div style={css("height:14px; border-radius:4px; background:oklch(0.55 0.15 255); width:100%; transform-origin:left; animation:growBar .6s .0s ease both;")}></div>
            <div style={css("height:14px; border-radius:4px; background:oklch(0.55 0.15 255 / 0.78); width:86%; transform-origin:left; animation:growBar .6s .1s ease both;")}></div>
            <div style={css("height:14px; border-radius:4px; background:oklch(0.55 0.15 255 / 0.56); width:72%; transform-origin:left; animation:growBar .6s .2s ease both;")}></div>
            <div style={css("height:14px; border-radius:4px; background:oklch(0.55 0.15 255 / 0.34); width:55%; transform-origin:left; animation:growBar .6s .3s ease both;")}></div>
            <div style={css("height:14px; border-radius:4px; background:oklch(0.55 0.15 255 / 0.18); width:40%; transform-origin:left; animation:growBar .6s .4s ease both;")}></div>
          </div>
          <div style={css("font-size:12px; color:oklch(0.45 0.015 260); margin-top:16px; line-height:1.5; border-top:1px solid oklch(0.92 0.006 260); padding-top:12px;")}>Your last recap added <strong style={css("font-weight:600;")}>2 likely themes</strong>. Prep gets sharper each round. →</div>
        </div>
      </div>
    </div>
  );
}
