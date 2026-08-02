import { useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { css } from "../css";
import { ACCENT, ALL_STAGES, STAGES } from "../data";
import { ROUTES } from "../routes";
import { dueLabelWithTime } from "../lib/format";
import type { Stage, Tab } from "../types";
import { nextStage, useUpdateApplication } from "../data/applications";
import { useDecoratedApplication } from "../data/derived";
import { EmptyState, ErrorNote, Loading, PrimaryButton, Select } from "./ui";
import { RoleDialog } from "./RoleDialog";
import { MaterialsTab } from "./detail/MaterialsTab";
import { ReferralsTab } from "./detail/ReferralsTab";
import { CompanyPrepTab } from "./detail/CompanyPrepTab";
import { RecapsTab } from "./detail/RecapsTab";

const TABS: Tab[] = ["materials", "referrals", "prep", "debriefs"];

function isTab(value: string | null): value is Tab {
  return !!value && (TABS as string[]).includes(value);
}

export function AppDetail() {
  const { id } = useParams<{ id: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { app, apps, isLoading, isError, error, refetch } = useDecoratedApplication(id);
  const update = useUpdateApplication();
  const [editing, setEditing] = useState(false);

  const tab: Tab = isTab(params.get("tab")) ? (params.get("tab") as Tab) : "materials";
  const setTab = (next: Tab) => setParams({ tab: next }, { replace: true });

  if (isLoading) return <Loading label="Opening this role…" />;

  if (isError) {
    return (
      <div style={css("padding:30px 40px;")}>
        <ErrorNote error={error} retry={() => refetch()} />
      </div>
    );
  }

  if (!app) {
    return (
      <div style={css("padding:40px;")}>
        <EmptyState
          title="That role isn't here"
          body="It may have been deleted, or the link points at something that never existed on this account."
          action={
            <PrimaryButton onClick={() => navigate(ROUTES.applications)}>
              Back to applications
            </PrimaryButton>
          }
        />
      </div>
    );
  }

  const si = STAGES.indexOf(app.stage);
  const upcoming = nextStage(app.stage);

  const tabButton = (t: Tab, label: ReactNode, tour?: string) => (
    <button
      onClick={() => setTab(t)}
      data-tour={tour}
      style={{
        ...css("font-family:'IBM Plex Sans'; font-size:13.5px; font-weight:600; border:none; background:none; padding:11px 14px; cursor:pointer;"),
        color: tab === t ? "#10151c" : "oklch(0.55 0.015 260)",
        borderBottom: `2px solid ${tab === t ? ACCENT : "transparent"}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={css("width:100%; animation:fadeIn .3s ease both;")}>
      {/* header */}
      <div style={css("padding:24px 40px 0; border-bottom:1px solid oklch(0.92 0.006 260); background:#fff;")}>
        <button
          onClick={() => navigate(ROUTES.applications)}
          style={css("font-family:'IBM Plex Sans'; font-size:13px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer; padding:0; margin-bottom:16px;")}
        >
          ← Applications
        </button>

        <div style={css("display:flex; align-items:flex-start; justify-content:space-between; gap:20px; flex-wrap:wrap;")}>
          <div style={css("display:flex; align-items:center; gap:14px;")}>
            <div style={{ ...css("width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk';font-weight:700;font-size:19px;flex:0 0 auto;"), background: app.logoBg, color: app.logoFg }}>{app.initial}</div>
            <div>
              <h1 style={css("font-family:'Space Grotesk'; font-size:23px; font-weight:600; margin:0;")}>{app.role}</h1>
              <div style={css("font-size:14px; color:oklch(0.45 0.015 260); margin-top:3px;")}>
                {app.company}
                {app.level ? ` · ${app.level}` : ""}
                {app.postingUrl && (
                  <>
                    {" · "}
                    <a href={app.postingUrl} target="_blank" rel="noopener" style={css("font-size:13px;")}>
                      View posting ↗
                    </a>
                  </>
                )}
                {" · "}
                <button
                  onClick={() => setEditing(true)}
                  style={css("font-family:'IBM Plex Sans'; font-size:13px; background:none; border:none; color:oklch(0.5 0.15 255); cursor:pointer; padding:0;")}
                >
                  Edit
                </button>
              </div>
            </div>
          </div>

          <div style={css("display:flex; align-items:flex-end; gap:12px;")}>
            <div>
              <div style={css("font-size:11.5px; color:oklch(0.5 0.015 260); margin-bottom:6px;")}>Current stage</div>
              <Select
                value={app.stage}
                onChange={(stage: Stage) => update.mutate({ id: app.id, patch: { stage } })}
                options={ALL_STAGES.map((s) => ({ value: s, label: s }))}
                ariaLabel="Current stage"
                style={{ width: "auto", paddingRight: "28px" }}
              />
            </div>
            <PrimaryButton
              tour="advance"
              disabled={!upcoming || update.isPending}
              onClick={() => upcoming && update.mutate({ id: app.id, patch: { stage: upcoming } })}
              style={{ padding: "11px 15px" }}
            >
              {upcoming ? `Advance to ${upcoming} →` : "End of the pipeline"}
            </PrimaryButton>
          </div>
        </div>

        {/* next action */}
        <div style={css("margin-top:14px; font-size:12.5px; color:oklch(0.5 0.015 260);")}>
          Next: <strong style={css("color:#10151c; font-weight:600;")}>{app.nextLabel}</strong>
          {app.nextActionAt && ` · ${dueLabelWithTime(app.nextActionAt)}`}
        </div>

        {/* pipeline */}
        <div style={css("display:flex; gap:6px; margin:18px 0 0;")}>
          {STAGES.map((name, i) => {
            const done = si >= 0 && i < si;
            const current = i === si;
            return (
              <div key={name} style={css("flex:1; text-align:center;")}>
                <div
                  style={{
                    height: "5px",
                    borderRadius: "3px",
                    background: current ? ACCENT : done ? "oklch(0.55 0.15 255 / 0.4)" : "oklch(0.92 0.006 260)",
                  }}
                ></div>
                <div
                  style={{
                    fontSize: "11px",
                    marginTop: "7px",
                    color: current ? ACCENT : done ? "oklch(0.4 0.02 260)" : "oklch(0.65 0.01 260)",
                    fontWeight: current ? 600 : 400,
                  }}
                >
                  {name}
                </div>
              </div>
            );
          })}
        </div>

        {si < 0 && (
          <div style={css("margin-top:10px; font-size:12px; color:oklch(0.5 0.13 25);")}>
            This role is {app.stage.toLowerCase()} — it's out of the pipeline, but its recaps still
            feed your prep.
          </div>
        )}

        {/* tabs */}
        <div data-tour="detail-tabs" style={css("display:flex; gap:4px; margin-top:20px;")}>
          {tabButton("materials", "Materials")}
          {tabButton("referrals", "Referrals", "tab-referrals")}
          {tabButton("prep", "Company prep", "tab-prep")}
          {tabButton(
            "debriefs",
            <>
              Recaps <span style={css("font-family:'IBM Plex Mono'; font-size:10px;")}>{app.recapCount}</span>
            </>,
            "tab-debriefs",
          )}
        </div>
      </div>

      <div style={css("padding:28px 40px 60px; max-width:1000px;")}>
        {tab === "materials" && <MaterialsTab app={app} />}
        {tab === "referrals" && <ReferralsTab app={app} />}
        {tab === "prep" && <CompanyPrepTab app={app} apps={apps} />}
        {tab === "debriefs" && <RecapsTab app={app} />}
      </div>

      {editing && <RoleDialog application={app} onClose={() => setEditing(false)} />}
    </div>
  );
}
