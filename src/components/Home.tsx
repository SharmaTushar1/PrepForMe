import { useNavigate } from "react-router-dom";
import { useApp } from "../store";
import { css } from "../css";
import { ACCENT, MUTED_DOT } from "../data";
import { ROUTES } from "../routes";
import { dueLabelWithTime, percent, weekHeader } from "../lib/format";
import { DEPTH_SEGMENTS } from "../lib/depth";
import { useDecoratedApplications, type DecoratedApp } from "../data/derived";
import {
  useFunnelMetrics,
  useInterviewsThisWeek,
  useNeedsAttention,
  useReadiness,
  type AttentionItem,
} from "../data/metrics";
import { useExperiences, useProfile, useSkills, profileGaps } from "../data/profile";
import { EmptyState, Eyebrow, Loading, PrimaryButton } from "./ui";

export function Home() {
  const { openAddRole } = useApp();
  const navigate = useNavigate();

  const { apps, deepest, isLoading } = useDecoratedApplications();
  const { metrics } = useFunnelMetrics();
  const interviews = useInterviewsThisWeek();
  const readiness = useReadiness();
  const { items } = useNeedsAttention();

  const profile = useProfile();
  const experiences = useExperiences();
  const skills = useSkills();
  const gaps = profileGaps(profile.data, experiences.data ?? [], skills.data ?? []);

  const unlogged = items.filter((i) => i.kind === "recap").length;

  if (isLoading) return <Loading label="Loading your war room…" />;

  return (
    <div style={css("padding:30px 40px 60px; max-width:1120px; width:100%; animation:fadeIn .3s ease both;")}>
      <div style={css("display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:26px;")}>
        <div>
          <Eyebrow style={{ marginBottom: "8px" }}>{weekHeader()}</Eyebrow>
          <h1 style={css("font-family:'Space Grotesk'; font-size:28px; font-weight:600; letter-spacing:-0.01em; margin:0;")}>
            {headline(apps.length, interviews.length, unlogged)}
          </h1>
        </div>
        <PrimaryButton onClick={openAddRole} tour="add-role" style={{ fontSize: "13.5px", padding: "11px 16px" }}>
          + Add a role
        </PrimaryButton>
      </div>

      {/* readiness */}
      <div data-tour="readiness" style={css("display:grid; grid-template-columns:1.3fr 1fr 1fr; gap:14px; margin-bottom:26px;")}>
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:18px; background:#fff;")}>
          <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-bottom:10px; font-weight:500;")}>Response rate</div>
          <div style={css("font-family:'Space Grotesk'; font-size:32px; font-weight:600;")}>
            {percent(metrics.responseRate)}
          </div>
          <div style={css("margin-top:12px; height:6px; border-radius:3px; background:oklch(0.93 0.006 260); overflow:hidden;")}>
            <div
              style={{
                ...css("height:100%; background:oklch(0.55 0.15 255); transform-origin:left; animation:growBar .8s ease both;"),
                width: `${Math.round((metrics.responseRate ?? 0) * 100)}%`,
              }}
            ></div>
          </div>
          <div style={css("font-family:'IBM Plex Mono'; font-size:10.5px; color:oklch(0.6 0.01 260); margin-top:8px;")}>
            {metrics.applied === 0
              ? "no applications sent yet"
              : `${metrics.responded} response${metrics.responded === 1 ? "" : "s"} · ${metrics.applied} application${metrics.applied === 1 ? "" : "s"}`}
          </div>
        </div>

        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:18px; background:#fff;")}>
          <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-bottom:10px; font-weight:500;")}>Interviews this week</div>
          <div style={css("font-family:'Space Grotesk'; font-size:32px; font-weight:600;")}>{interviews.length}</div>
          <div style={css("font-size:12.5px; color:oklch(0.45 0.015 260); margin-top:12px; line-height:1.4;")}>
            {interviews.length
              ? interviews
                  .map((a) => `${a.company} · ${dueLabelWithTime(a.nextActionAt)}`)
                  .join(" · ")
              : "Nothing on the calendar — set a date on a role and it shows up here."}
          </div>
        </div>

        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:18px; background:#fff;")}>
          <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-bottom:10px; font-weight:500;")}>Prep readiness</div>
          <div style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600;")}>{readiness.label}</div>
          <div style={css("display:flex; gap:4px; margin-top:14px;")}>
            {Array.from({ length: readiness.segments }, (_, i) => (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: "6px",
                  borderRadius: "3px",
                  background: i < readiness.index ? ACCENT : "oklch(0.9 0.006 260)",
                }}
              ></span>
            ))}
          </div>
        </div>
      </div>

      {apps.length === 0 ? (
        <EmptyState
          title="Nothing tracked yet"
          body="Add the first role you're serious about. Paste the job description with it and the tailoring, keyword gap, and prep space all have something to work from."
          action={<PrimaryButton onClick={openAddRole}>+ Add your first role</PrimaryButton>}
        />
      ) : (
        <div style={css("display:grid; grid-template-columns:1.5fr 1fr; gap:22px;")}>
          {/* needs attention */}
          <div data-tour="needs">
            <Eyebrow style={{ marginBottom: "12px" }}>Needs attention</Eyebrow>
            {items.length ? (
              <div style={css("display:flex; flex-direction:column; gap:10px;")}>
                {items.map((item) => (
                  <AttentionRow key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                title="Nothing is waiting on you"
                body="No recaps to log, no interviews in the next week, and every role has been tailored. Go deeper on a company instead."
              />
            )}

            <Eyebrow style={{ margin: "24px 0 12px" }}>Jump back in</Eyebrow>
            <div style={css("display:flex; gap:10px;")}>
              <button
                onClick={() => navigate(ROUTES.applications)}
                className="pressable"
                style={css("flex:1; text-align:left; font-family:'IBM Plex Sans'; background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:14px; cursor:pointer;")}
              >
                <div style={css("font-weight:600; font-size:13.5px;")}>Open the tracker</div>
                <div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-top:2px;")}>
                  {metrics.active} active application{metrics.active === 1 ? "" : "s"}
                </div>
              </button>
              <button
                onClick={() => navigate(ROUTES.profile)}
                className="pressable"
                style={css("flex:1; text-align:left; font-family:'IBM Plex Sans'; background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:14px; cursor:pointer;")}
              >
                <div style={css("font-weight:600; font-size:13.5px;")}>Review your profile</div>
                <div style={css("font-size:12px; color:oklch(0.5 0.015 260); margin-top:2px;")}>
                  {gaps.length
                    ? `${gaps.length} gap${gaps.length === 1 ? "" : "s"} flagged`
                    : "no gaps flagged"}
                </div>
              </button>
            </div>
          </div>

          {/* deepest prep space */}
          {deepest && <DossierCard app={deepest} />}
        </div>
      )}
    </div>
  );
}

function headline(total: number, interviews: number, unlogged: number): string {
  if (total === 0) return "Let's get the first role in here.";
  const parts: string[] = [];
  if (interviews > 0) {
    parts.push(`${interviews} interview${interviews === 1 ? "" : "s"} to prep.`);
  }
  if (unlogged > 0) {
    parts.push(`${unlogged} recap${unlogged === 1 ? "" : "s"} waiting.`);
  }
  if (!parts.length) return "Nothing urgent. Go deeper on a company.";
  return parts.join(" ");
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const navigate = useNavigate();
  const target =
    item.kind === "recap"
      ? ROUTES.newRecap(item.app.id)
      : ROUTES.applicationTab(item.app.id, item.tab);

  return (
    <div
      onClick={() => navigate(target)}
      className="row-link"
      style={{
        ...css("display:flex; align-items:center; gap:14px; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:15px 16px; background:#fff; cursor:pointer;"),
        borderLeft: item.urgent ? `3px solid ${ACCENT}` : "1px solid oklch(0.9 0.006 260)",
      }}
    >
      <div style={css("flex:1; min-width:0;")}>
        <div style={css("font-weight:600; font-size:14.5px;")}>{item.title}</div>
        <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:3px;")}>{item.detail}</div>
      </div>
      <span
        style={{
          ...css("font-family:'IBM Plex Mono'; font-size:11px; padding:4px 8px; border-radius:5px; white-space:nowrap;"),
          color: item.urgent ? "oklch(0.5 0.13 40)" : "oklch(0.5 0.015 260)",
          background: item.urgent ? "oklch(0.55 0.13 40 / 0.1)" : "transparent",
        }}
      >
        {item.chip}
      </span>
    </div>
  );
}

function DossierCard({ app }: { app: DecoratedApp }) {
  const navigate = useNavigate();
  const filled = app.depthIndex;

  return (
    <div
      data-tour="dossier"
      onClick={() => navigate(ROUTES.applicationTab(app.id, "prep"))}
      style={css("border:1px solid oklch(0.9 0.006 260); border-radius:13px; padding:18px; background:linear-gradient(180deg, oklch(0.55 0.15 255 / 0.05), #fff 60%); cursor:pointer; align-self:start;")}
    >
      <Eyebrow style={{ marginBottom: "6px" }}>Deepest prep space · {app.company}</Eyebrow>
      <div style={css("font-family:'Space Grotesk'; font-size:19px; font-weight:600; margin-bottom:4px;")}>{app.depthLabel}</div>
      <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-bottom:18px;")}>
        {app.sourceCount} source{app.sourceCount === 1 ? "" : "s"} · {app.recapCount} recap
        {app.recapCount === 1 ? "" : "s"}
      </div>
      <div style={css("display:flex; flex-direction:column-reverse; gap:5px;")}>
        {Array.from({ length: DEPTH_SEGMENTS }, (_, i) => {
          const on = i < filled;
          const width = 40 + i * 15;
          return (
            <div
              key={i}
              style={{
                height: "14px",
                borderRadius: "4px",
                background: on ? `oklch(0.55 0.15 255 / ${1 - i * 0.16})` : MUTED_DOT,
                width: `${Math.min(100, width)}%`,
                transformOrigin: "left",
                animation: `growBar .6s ${i * 0.1}s ease both`,
              }}
            ></div>
          );
        })}
      </div>
      <div style={css("font-size:12px; color:oklch(0.45 0.015 260); margin-top:16px; line-height:1.5; border-top:1px solid oklch(0.92 0.006 260); padding-top:12px;")}>
        {app.recapCount > 0
          ? "Every recap you log makes the next round sharper. →"
          : "Log your first recap here and this space stops being generic. →"}
      </div>
    </div>
  );
}
