import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../store";
import { useSession } from "../auth/SessionProvider";
import { css } from "../css";
import { ROUTES } from "../routes";
import { useProfile } from "../data/profile";
import { useSettings, useUpdateSettings } from "../data/settings";
import { useDecoratedApplications } from "../data/derived";
import { useClearCorpus, useExportData } from "../data/exportData";
import { useAiUsage, type Feature } from "../data/usage";
import { PrimaryButton, SecondaryButton, Select, Toggle } from "./ui";

export function Settings() {
  const { openExt } = useApp();
  const { session, signOut } = useSession();
  const navigate = useNavigate();

  const profile = useProfile();
  const { settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { apps } = useDecoratedApplications();
  const exportData = useExportData();
  const clearCorpus = useClearCorpus();

  const [clearing, setClearing] = useState(false);
  const [target, setTarget] = useState("");
  const [cleared, setCleared] = useState<string | null>(null);

  async function doClear() {
    const app = apps.find((a) => a.id === target);
    if (!app) return;
    await clearCorpus.mutateAsync(app.id);
    setCleared(app.company);
    setClearing(false);
    setTarget("");
  }

  return (
    <div style={css("padding:30px 40px 60px; max-width:760px; width:100%; animation:fadeIn .3s ease both;")}>
      <h1 style={css("font-family:'Space Grotesk'; font-size:26px; font-weight:600; margin:0 0 24px;")}>Settings</h1>

      <div data-tour="privacy" style={css("border:2px solid oklch(0.55 0.15 255 / 0.25); border-radius:13px; padding:20px; background:oklch(0.55 0.15 255 / 0.03); margin-bottom:18px;")}>
        <div style={css("display:flex; align-items:center; gap:9px; margin-bottom:6px;")}>
          <span style={css("font-family:'Space Grotesk'; font-size:16px; font-weight:600;")}>Privacy &amp; data</span>
          <span style={css("font-family:'IBM Plex Mono'; font-size:10.5px; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.12); padding:2px 8px; border-radius:100px;")}>you're in control</span>
        </div>
        <p style={css("font-size:13px; color:oklch(0.45 0.015 260); margin:0 0 16px; line-height:1.55;")}>
          We hold your full career history so the app can tailor, prep, and autofill for you. Export
          it as one JSON file anytime, or wipe a single company's prep space without touching the rest.
        </p>

        <div style={css("display:flex; gap:10px; flex-wrap:wrap;")}>
          <SecondaryButton onClick={() => exportData.mutate()} disabled={exportData.isPending}>
            {exportData.isPending ? "Preparing…" : "Export all my data"}
          </SecondaryButton>
          <SecondaryButton
            onClick={() => {
              setClearing((v) => !v);
              setCleared(null);
            }}
            disabled={apps.length === 0}
          >
            Clear a company's corpus
          </SecondaryButton>
        </div>

        {exportData.isError && (
          <div style={css("margin-top:12px; font-size:12.5px; color:oklch(0.5 0.14 25);")}>
            {exportData.error instanceof Error ? exportData.error.message : "Export failed."}
          </div>
        )}

        {clearing && (
          <div style={css("margin-top:14px; background:#fff; border:1px solid oklch(0.9 0.006 260); border-radius:11px; padding:14px;")}>
            <div style={css("font-size:13px; font-weight:600; margin-bottom:8px;")}>Which company?</div>
            <p style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin:0 0 12px; line-height:1.55;")}>
              This deletes that role's sources, its prep conversation, and its recaps. The application
              itself stays in your tracker. It can't be undone.
            </p>
            <div style={css("display:flex; gap:10px; align-items:center; flex-wrap:wrap;")}>
              <Select
                value={target}
                onChange={setTarget}
                options={[
                  { value: "", label: "Choose a role…" },
                  ...apps.map((a) => ({ value: a.id, label: `${a.company} · ${a.role}` })),
                ]}
                ariaLabel="Company to clear"
                style={{ width: "auto", flex: 1, minWidth: "220px" }}
              />
              <PrimaryButton
                onClick={doClear}
                disabled={!target || clearCorpus.isPending}
                style={{ background: "oklch(0.55 0.16 25)" }}
              >
                {clearCorpus.isPending ? "Clearing…" : "Clear it"}
              </PrimaryButton>
            </div>
          </div>
        )}

        {cleared && (
          <div style={css("margin-top:12px; font-size:12.5px; color:oklch(0.35 0.09 150);")}>
            {cleared}'s prep space is empty again.
          </div>
        )}
      </div>

      <div style={css("display:flex; flex-direction:column; gap:12px;")}>
        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:18px; background:#fff;")}>
          <div style={css("font-family:'Space Grotesk'; font-size:15px; font-weight:600; margin-bottom:14px;")}>Account</div>
          <Row label="Name">
            {profile.data?.fullName ?? (
              <button
                onClick={() => navigate(ROUTES.profile)}
                style={css("font-family:'IBM Plex Sans'; font-size:13px; background:none; border:none; color:oklch(0.5 0.15 255); cursor:pointer; padding:0;")}
              >
                add it on your profile
              </button>
            )}
          </Row>
          <Row label="Email">{profile.data?.email ?? session?.user.email ?? "—"}</Row>
          <Row label="Plan">
            <span style={css("color:oklch(0.4 0.13 255); font-weight:600;")}>
              {settings.plan === "pro" ? "Pro" : "Free"}
            </span>
          </Row>
        </div>

        <PlanAllowances />

        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:18px; background:#fff;")}>
          <div style={css("display:flex; align-items:center; justify-content:space-between; gap:14px;")}>
            <div>
              <div style={css("font-family:'Space Grotesk'; font-size:15px; font-weight:600;")}>Browser extension</div>
              <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-top:2px;")}>
                Autofills forms · never submits · not shipped yet
              </div>
            </div>
            <button
              onClick={openExt}
              className="pressable"
              style={css("font-family:'IBM Plex Sans'; font-size:12.5px; font-weight:600; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.1); border:none; padding:9px 14px; border-radius:8px; cursor:pointer; white-space:nowrap;")}
            >
              Preview popup
            </button>
          </div>
        </div>

        <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:18px; background:#fff;")}>
          <div style={css("font-family:'Space Grotesk'; font-size:15px; font-weight:600; margin-bottom:14px;")}>Reminders</div>
          <div style={css("display:flex; justify-content:space-between; align-items:center; gap:14px; font-size:13.5px; padding:8px 0;")}>
            <span>Flag roles with an interview logged nowhere</span>
            <Toggle
              on={settings.nudgeRecaps}
              label="Flag unlogged interviews"
              onToggle={() => updateSettings.mutate({ nudgeRecaps: !settings.nudgeRecaps })}
            />
          </div>
          <div style={css("display:flex; justify-content:space-between; align-items:center; gap:14px; font-size:13.5px; padding:8px 0;")}>
            <span style={css("display:flex; align-items:center; gap:8px; flex-wrap:wrap;")}>
              Flag stale applications after
              <input
                className="field"
                type="number"
                min={1}
                max={90}
                value={settings.flagStaleDays}
                aria-label="Days before an application is stale"
                onChange={(e) => {
                  const days = Number(e.target.value);
                  if (Number.isFinite(days) && days >= 1 && days <= 90) {
                    updateSettings.mutate({ flagStaleDays: days });
                  }
                }}
                style={{ width: "68px", padding: "6px 8px", textAlign: "center" }}
              />
              days
            </span>
            <Toggle
              on={settings.flagStaleApplications}
              label="Flag stale applications"
              onToggle={() =>
                updateSettings.mutate({ flagStaleApplications: !settings.flagStaleApplications })
              }
            />
          </div>
          <div style={css("font-size:11.5px; color:oklch(0.55 0.015 260); line-height:1.55; margin-top:8px;")}>
            These control what shows up in "Needs attention" on your home screen. Nothing is emailed
            to you yet.
          </div>
        </div>

        <button
          onClick={() => signOut().then(() => navigate(ROUTES.landing))}
          style={css("align-self:flex-start; font-family:'IBM Plex Sans'; font-size:13px; color:oklch(0.5 0.015 260); background:none; border:none; cursor:pointer; padding:8px 0;")}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/**
 * What the current plan buys, and how much of it is left.
 *
 * Every number is read through `useAiUsage`, so it comes from the same limits and
 * the same ledger the Edge Functions enforce against — this card cannot promise
 * an allowance the server will not honour.
 */
function PlanAllowances() {
  return (
    <div style={css("border:1px solid oklch(0.9 0.006 260); border-radius:12px; padding:18px; background:#fff;")}>
      <div style={css("font-family:'Space Grotesk'; font-size:15px; font-weight:600; margin-bottom:4px;")}>
        What your plan includes
      </div>
      <div style={css("font-size:12.5px; color:oklch(0.5 0.015 260); margin-bottom:12px;")}>
        These are real model calls, so they're metered. Allowances reset in UTC.
      </div>

      <AllowanceRow feature="resume_analysis" label="Resume analysis" />
      <AllowanceRow feature="resume_rewrite" label="Resume rewrites" />
      <AllowanceRow feature="chat" label="Prep chat" />
      <AllowanceRow feature="relevance_check" label="Source relevance checks" />

      <div style={css("font-size:12px; color:oklch(0.5 0.015 260); line-height:1.55; margin-top:10px; padding-top:10px; border-top:1px solid oklch(0.94 0.005 260);")}>
        {/* Said plainly rather than left to be inferred from the padlock in the
            sidebar: the chat allowance is listed so the plan is complete, but
            nothing spends it yet, so it will read as untouched. */}
        Practice chat arrives in a later version. Its allowance is listed here for completeness —
        nothing draws on it today.
      </div>
    </div>
  );
}

function AllowanceRow({ feature, label }: { feature: Feature; label: string }) {
  const { status, isSuccess } = useAiUsage(feature);

  return (
    <Row label={label}>
      <span style={css("font-family:'IBM Plex Mono'; font-size:12px;")}>
        {status.limit} a {status.periodNoun}
        {isSuccess && (
          <span
            style={css(
              `margin-left:8px; color:${
                status.remaining > 0 ? "oklch(0.45 0.015 260)" : "oklch(0.5 0.14 25)"
              };`,
            )}
          >
            · {status.remaining} left
          </span>
        )}
      </span>
    </Row>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={css("display:flex; justify-content:space-between; align-items:center; gap:14px; font-size:13.5px; padding:6px 0;")}>
      <span style={css("color:oklch(0.5 0.015 260);")}>{label}</span>
      <span>{children}</span>
    </div>
  );
}
