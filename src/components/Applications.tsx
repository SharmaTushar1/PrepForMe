import { useNavigate } from "react-router-dom";
import { useApp } from "../store";
import { css } from "../css";
import { ROUTES } from "../routes";
import { percent } from "../lib/format";
import { useDecoratedApplications } from "../data/derived";
import { useFunnelMetrics } from "../data/metrics";
import { EmptyState, ErrorNote, Loading, PrimaryButton } from "./ui";

const SEG_ON = { bg: "#fff", fg: "#10151c", shadow: "0 1px 2px oklch(0.3 0.02 260 / 0.12)" };
const SEG_OFF = { bg: "transparent", fg: "oklch(0.5 0.015 260)", shadow: "none" };

export function Applications() {
  const { state, setTrackerView, openAddRole } = useApp();
  const navigate = useNavigate();
  const { apps, columns, isLoading, isError, error, refetch } = useDecoratedApplications();
  const { metrics } = useFunnelMetrics();

  const board = state.trackerView === "board";
  const on = board ? SEG_ON : SEG_OFF;
  const off = board ? SEG_OFF : SEG_ON;

  return (
    <div style={css("padding:30px 40px 60px; width:100%; animation:fadeIn .3s ease both;")}>
      <div style={css("display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;")}>
        <h1 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0;")}>Applications</h1>
        <div style={css("display:flex; align-items:center; gap:12px;")}>
          <div style={css("display:flex; background:oklch(0.95 0.004 260); border:1px solid oklch(0.9 0.006 260); border-radius:9px; padding:3px;")}>
            <button onClick={() => setTrackerView("board")} style={{ ...css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; border:none; padding:7px 14px; border-radius:7px; cursor:pointer;"), background: on.bg, color: on.fg, boxShadow: on.shadow }}>Board</button>
            <button onClick={() => setTrackerView("table")} style={{ ...css("font-family:'IBM Plex Sans'; font-size:13px; font-weight:600; border:none; padding:7px 14px; border-radius:7px; cursor:pointer;"), background: off.bg, color: off.fg, boxShadow: off.shadow }}>Table</button>
          </div>
          <PrimaryButton onClick={openAddRole} style={{ padding: "9px 15px" }}>+ Add a role</PrimaryButton>
        </div>
      </div>

      {/* analytics strip — every figure is countable from the rows below */}
      <div style={css("display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px;")}>
        <Stat
          label="Response rate"
          value={percent(metrics.responseRate)}
          note={metrics.applied ? `${metrics.responded} of ${metrics.applied} applied` : "nothing applied yet"}
        />
        <Stat
          label="Interview rate"
          value={percent(metrics.interviewRate)}
          note={metrics.applied ? `${metrics.interviewed} reached a technical round` : "nothing applied yet"}
        />
        <Stat label="Active" value={String(metrics.active)} note={`${metrics.total} tracked in total`} />
        <Stat
          label="Offers"
          value={String(metrics.offers)}
          note={metrics.offers ? "worth logging what got you there" : "not yet"}
        />
      </div>

      {isError && <ErrorNote error={error} retry={() => refetch()} />}
      {isLoading && <Loading label="Loading your pipeline…" />}

      {!isLoading && !isError && apps.length === 0 && (
        <EmptyState
          title="Your tracker is empty"
          body="Add a role and it becomes a card here, moving through Saved, Applied, Screen, Technical, Onsite, and Offer as you go."
          action={<PrimaryButton onClick={openAddRole}>+ Add a role</PrimaryButton>}
        />
      )}

      {/* board */}
      {!isLoading && apps.length > 0 && board && (
        <div data-tour="tracker" style={css("display:flex; gap:14px; overflow-x:auto; padding-bottom:8px;")}>
          {columns.map((col) => (
            <div key={col.name} style={css("flex:0 0 236px; background:oklch(0.975 0.003 260); border:1px solid oklch(0.92 0.006 260); border-radius:12px; padding:12px;")}>
              <div style={css("display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; padding:0 4px;")}>
                <span style={{ ...css("font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.06em; text-transform:uppercase; font-weight:600;"), color: col.color }}>{col.name}</span>
                <span style={css("font-family:'IBM Plex Mono'; font-size:11px; color:oklch(0.6 0.01 260); background:#fff; border:1px solid oklch(0.92 0.006 260); border-radius:100px; padding:1px 8px;")}>{col.count}</span>
              </div>
              <div style={css("display:flex; flex-direction:column; gap:9px;")}>
                {col.apps.map((app) => (
                  <div
                    key={app.id}
                    onClick={() => navigate(ROUTES.application(app.id))}
                    className="pressable"
                    style={css("background:#fff; border:1px solid oklch(0.91 0.006 260); border-radius:10px; padding:13px; cursor:pointer; box-shadow:0 1px 2px oklch(0.3 0.02 260 / 0.04);")}
                  >
                    <div style={css("display:flex; align-items:center; gap:8px; margin-bottom:7px;")}>
                      <div style={{ ...css("width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk';font-weight:700;font-size:11px;"), background: app.logoBg, color: app.logoFg }}>{app.initial}</div>
                      <span style={css("font-weight:600; font-size:13.5px;")}>{app.company}</span>
                    </div>
                    <div style={css("font-size:12.5px; color:oklch(0.4 0.015 260); line-height:1.35; margin-bottom:10px;")}>{app.role}</div>
                    <div style={css("display:flex; align-items:center; justify-content:space-between; gap:8px;")}>
                      <span style={css("font-size:11px; color:oklch(0.5 0.015 260);")}>{app.nextLabel}</span>
                      <div style={css("display:flex; gap:4px; flex:0 0 auto;")}>
                        <span title={app.resumeTailored ? "resume tailored" : "resume not tailored yet"} style={{ width: "6px", height: "6px", borderRadius: "50%", background: app.resumeDot }}></span>
                        <span title={app.prepStarted ? "prep space started" : "prep space empty"} style={{ width: "6px", height: "6px", borderRadius: "50%", background: app.prepDot }}></span>
                      </div>
                    </div>
                  </div>
                ))}
                {col.apps.length === 0 && (
                  <div style={css("font-size:11.5px; color:oklch(0.62 0.015 260); padding:10px 4px; line-height:1.5;")}>Nothing here yet.</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* table */}
      {!isLoading && apps.length > 0 && !board && (
        <div style={css("border:1px solid oklch(0.91 0.006 260); border-radius:12px; overflow:hidden; background:#fff;")}>
          <div style={css("display:grid; grid-template-columns:1.4fr 1.6fr 1fr 1.4fr 0.8fr; gap:12px; padding:12px 18px; background:oklch(0.98 0.003 260); border-bottom:1px solid oklch(0.92 0.006 260); font-family:'IBM Plex Mono'; font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:oklch(0.5 0.015 260);")}>
            <span>Company</span><span>Role</span><span>Stage</span><span>Next action</span><span>Updated</span>
          </div>
          {apps.map((app) => (
            <div
              key={app.id}
              onClick={() => navigate(ROUTES.application(app.id))}
              className="row-link"
              style={css("display:grid; grid-template-columns:1.4fr 1.6fr 1fr 1.4fr 0.8fr; gap:12px; padding:14px 18px; border-bottom:1px solid oklch(0.95 0.006 260); cursor:pointer; align-items:center;")}
            >
              <div style={css("display:flex; align-items:center; gap:9px;")}>
                <div style={{ ...css("width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk';font-weight:700;font-size:11px;flex:0 0 auto;"), background: app.logoBg, color: app.logoFg }}>{app.initial}</div>
                <span style={css("font-weight:600; font-size:13.5px;")}>{app.company}</span>
              </div>
              <span style={css("font-size:13px; color:oklch(0.4 0.015 260);")}>{app.role}</span>
              <span><span style={{ ...css("font-size:11.5px; font-weight:600; padding:3px 10px; border-radius:100px;"), color: app.stageColor, background: app.stageBg }}>{app.stage}</span></span>
              <span style={css("font-size:13px; color:oklch(0.45 0.015 260);")}>{app.nextLabel}</span>
              <span style={css("font-size:12px; color:oklch(0.55 0.015 260); font-family:'IBM Plex Mono';")}>{app.updatedLabel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:14px 16px; background:#fff;")}>
      <div style={css("font-size:12px; color:oklch(0.5 0.015 260);")}>{label}</div>
      <div style={css("font-family:'Space Grotesk'; font-size:22px; font-weight:600; margin-top:3px;")}>{value}</div>
      <div style={css("font-family:'IBM Plex Mono'; font-size:10.5px; color:oklch(0.6 0.01 260); margin-top:5px;")}>{note}</div>
    </div>
  );
}
