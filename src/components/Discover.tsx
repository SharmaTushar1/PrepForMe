import { css } from "../css";

export function Discover() {
  return (
    <div style={css("padding:30px 40px 60px; max-width:860px; width:100%; animation:fadeIn .3s ease both;")}>
      <div style={css("display:flex; align-items:center; gap:10px; margin-bottom:6px;")}><h1 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0;")}>Discover</h1><span style={css("font-family:'IBM Plex Mono'; font-size:11px; background:oklch(0.55 0.15 255 / 0.1); color:oklch(0.4 0.13 255); padding:3px 9px; border-radius:100px;")}>v2 · preview</span></div>
      <p style={css("font-size:14px; color:oklch(0.45 0.015 260); margin:0 0 22px; max-width:560px;")}>Describe the role you want. We query public ATS feeds and rank matches against your profile — a query-and-rank layer, not an exhaustive board.</p>
      <div data-tour="discover-search" style={css("display:flex; gap:10px; margin-bottom:26px;")}>
        <div style={css("flex:1; font-size:14px; color:oklch(0.35 0.015 260); background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:14px 16px;")}>Staff-level backend roles, distributed systems, remote-friendly, Series C+</div>
        <button style={css("font-family:'IBM Plex Sans'; font-size:14px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:0 22px; border-radius:11px; cursor:pointer;")}>Find</button>
      </div>
      <div style={css("display:flex; flex-direction:column; gap:11px;")}>
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:16px 18px; background:#fff; display:flex; align-items:center; gap:16px;")}>
          <div style={css("width:40px;height:40px;border-radius:10px;background:oklch(0.6 0.14 145 / 0.15);color:oklch(0.4 0.12 145);display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk';font-weight:700;")}>V</div>
          <div style={css("flex:1;")}><div style={css("font-weight:600; font-size:14.5px;")}>Senior Product Engineer · Vercel</div><div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:2px;")}>Remote · matches your Go + distributed systems + product sense</div></div>
          <div style={css("text-align:center;")}><div style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; color:oklch(0.45 0.12 145);")}>94%</div><div style={css("font-size:10.5px; color:oklch(0.55 0.015 260);")}>match</div></div>
          <button style={css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.1); border:none; padding:9px 13px; border-radius:8px; cursor:pointer;")}>+ Track</button>
        </div>
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:16px 18px; background:#fff; display:flex; align-items:center; gap:16px;")}>
          <div style={css("width:40px;height:40px;border-radius:10px;background:oklch(0.55 0.02 260 / 0.9);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk';font-weight:700;")}>L</div>
          <div style={css("flex:1;")}><div style={css("font-weight:600; font-size:14.5px;")}>Backend Engineer · Linear</div><div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:2px;")}>Remote · strong on reliability, lighter on your frontend exposure</div></div>
          <div style={css("text-align:center;")}><div style={css("font-family:'Space Grotesk'; font-size:18px; font-weight:600; color:oklch(0.5 0.1 145);")}>88%</div><div style={css("font-size:10.5px; color:oklch(0.55 0.015 260);")}>match</div></div>
          <button style={css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.1); border:none; padding:9px 13px; border-radius:8px; cursor:pointer;")}>+ Track</button>
        </div>
      </div>
    </div>
  );
}
