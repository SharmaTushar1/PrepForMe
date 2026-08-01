import { useEffect } from "react";
import { useApp } from "../store";
import { css } from "../css";
import { ACCENT, TOUR_STEPS } from "../data";

export function Tour() {
  const { state, positionTour, closeTour, tourNext, tourPrev } = useApp();
  const step = state.tourStep;
  const sp = state.spot;
  const cur = TOUR_STEPS[step];

  // Re-position the spotlight after the target view has rendered (design: 320ms
  // after the step's setState) and whenever the window resizes.
  useEffect(() => {
    const id = window.setTimeout(() => positionTour(), 320);
    return () => window.clearTimeout(id);
  }, [step, positionTour]);

  useEffect(() => {
    const onResize = () => positionTour();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [positionTour]);

  const anchored = !!(sp && !sp.centered);
  const spotShow = anchored;
  const ttCentered = !!(sp && sp.centered);

  const ttTop = anchored ? sp!.ttTop + "px" : "50%";
  const ttLeft = anchored ? sp!.ttLeft + "px" : "50%";
  const ttWidth = anchored ? sp!.ttW + "px" : "360px";
  const ttTransform =
    sp && sp.centered
      ? "translate(-50%,-50%)"
      : sp && !sp.below
        ? "translateY(-100%)"
        : "none";

  const tourNum = step + 1 + " / " + TOUR_STEPS.length;
  const tourNextLabel = step === TOUR_STEPS.length - 1 ? "Finish" : "Next →";
  const dots = TOUR_STEPS.map((_, i) => ({
    bg: i === step ? ACCENT : i < step ? "oklch(0.55 0.15 255 / 0.4)" : "oklch(0.9 0.006 260)",
    w: i === step ? "20px" : "6px",
  }));

  return (
    <div style={css("position:fixed; inset:0; z-index:70; pointer-events:none;")}>
      {/* dim + spotlight cutout (single moving element) */}
      {spotShow && (
        <div
          style={{
            ...css("position:fixed; border-radius:12px; box-shadow:0 0 0 9999px oklch(0.15 0.02 260 / 0.62); border:2px solid oklch(0.62 0.16 255); background:transparent; transition:top .32s cubic-bezier(.4,0,.2,1), left .32s cubic-bezier(.4,0,.2,1), width .32s cubic-bezier(.4,0,.2,1), height .32s cubic-bezier(.4,0,.2,1); pointer-events:none;"),
            top: sp!.t + "px",
            left: sp!.l + "px",
            width: sp!.w + "px",
            height: sp!.h + "px",
          }}
        ></div>
      )}
      {ttCentered && (
        <div style={css("position:fixed; inset:0; background:oklch(0.15 0.02 260 / 0.55); pointer-events:none;")}></div>
      )}

      {/* tooltip */}
      <div
        style={{
          ...css("position:fixed; background:#fff; border-radius:15px; box-shadow:0 26px 60px -26px oklch(0.2 0.05 260 / 0.8); padding:20px 22px; pointer-events:auto; animation:fadeIn .2s ease both;"),
          top: ttTop,
          left: ttLeft,
          width: ttWidth,
          transform: ttTransform,
        }}
      >
        <div style={css("display:flex; align-items:center; justify-content:space-between; margin-bottom:9px;")}>
          <span style={css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.12em; color:oklch(0.4 0.13 255);")}>TOUR · {tourNum}</span>
          <button onClick={closeTour} style={css("background:none; border:none; font-size:19px; line-height:1; color:oklch(0.6 0.015 260); cursor:pointer;")}>×</button>
        </div>
        <h2 style={css("font-family:'Space Grotesk'; font-size:19px; font-weight:600; margin:0 0 9px;")}>{cur.title}</h2>
        {!!cur.hint && (
          <div style={css("display:inline-flex; align-items:center; gap:7px; font-family:'IBM Plex Mono'; font-size:11.5px; font-weight:500; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.1); padding:5px 11px; border-radius:100px; margin-bottom:11px;")}>
            <span style={css("width:6px; height:6px; border-radius:50%; background:oklch(0.55 0.15 255); animation:blink 1.1s infinite;")}></span>👆 {cur.hint}
          </div>
        )}
        <p style={css("font-size:13.5px; color:oklch(0.42 0.015 260); line-height:1.6; margin:0 0 18px; text-wrap:pretty;")}>{cur.body}</p>
        <div style={css("display:flex; align-items:center; gap:6px; margin-bottom:16px;")}>
          {dots.map((d, i) => (
            <span key={i} style={{ height: "6px", width: d.w, borderRadius: "100px", background: d.bg, transition: "all .2s" }}></span>
          ))}
        </div>
        <div style={css("display:flex; align-items:center; gap:10px;")}>
          <button onClick={closeTour} style={css("font-family:'IBM Plex Sans'; font-size:12.5px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer; padding:0;")}>Skip</button>
          <div style={css("margin-left:auto; display:flex; gap:8px;")}>
            {step > 0 && (
              <button onClick={tourPrev} style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:oklch(0.3 0.02 260); background:#fff; border:1px solid oklch(0.9 0.006 260); padding:9px 15px; border-radius:9px; cursor:pointer;")}>Back</button>
            )}
            <button onClick={tourNext} style={css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; color:#fff; background:oklch(0.55 0.15 255); border:none; padding:9px 17px; border-radius:9px; cursor:pointer;")}>{tourNextLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
