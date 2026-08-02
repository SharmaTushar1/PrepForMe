import { useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../store";
import { useSession } from "../auth/SessionProvider";
import { useProfile } from "../data/profile";
import { useSettings } from "../data/settings";
import { css } from "../css";
import { ACCENT } from "../data";
import { ROUTES } from "../routes";
import { LogoMark } from "./Logo";

interface NavDef {
  key: string;
  label: string;
  path: string;
  tag?: string;
}

const NAV_DEF: NavDef[] = [
  { key: "home", label: "Home", path: ROUTES.home },
  { key: "applications", label: "Applications", path: ROUTES.applications },
  { key: "profile", label: "Profile", path: ROUTES.profile },
  { key: "discover", label: "Discover", path: ROUTES.discover, tag: "v2" },
  { key: "practice", label: "Practice", path: ROUTES.practice, tag: "🔒" },
  { key: "settings", label: "Settings", path: ROUTES.settings },
];

/** Initials for the avatar, from whatever name we actually have. */
function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Sidebar() {
  const { openTour, openContact, openExt } = useApp();
  const { session } = useSession();
  const profile = useProfile();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const activeKey =
    NAV_DEF.filter((n) => n.path !== ROUTES.home)
      .find((n) => pathname.startsWith(n.path))?.key ??
    (pathname.startsWith(ROUTES.applications) ? "applications" : "home");

  const email = profile.data?.email ?? session?.user.email ?? null;
  const name = profile.data?.fullName ?? null;

  return (
    <div style={css("width:230px; flex:0 0 auto; background:#fff; border-right:1px solid oklch(0.92 0.006 260); padding:22px 16px; display:flex; flex-direction:column; gap:8px; position:sticky; top:0; height:100vh;")}>
      <div onClick={() => navigate(ROUTES.home)} style={css("display:flex; align-items:center; gap:9px; padding:4px 8px 16px; cursor:pointer;")}>
        <LogoMark size={24} />
        <span style={css("font-family:'Space Grotesk'; font-weight:600; font-size:16px; letter-spacing:-0.01em;")}>
          PrepFor<span style={css("color:oklch(0.55 0.15 255);")}>.Me</span>
        </span>
      </div>

      {NAV_DEF.map((n) => {
        const active = n.key === activeKey;
        return (
          <div
            key={n.key}
            onClick={() => navigate(n.path)}
            data-tour={"nav-" + n.key}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "11px",
              padding: "10px 11px",
              borderRadius: "9px",
              cursor: "pointer",
              fontSize: "14px",
              background: active ? "oklch(0.55 0.15 255 / 0.1)" : "transparent",
              color: active ? "oklch(0.4 0.13 255)" : "oklch(0.42 0.015 260)",
              fontWeight: active ? 600 : 400,
            }}
          >
            <span style={{ width: "7px", height: "7px", borderRadius: "2px", background: active ? ACCENT : "oklch(0.82 0.008 260)" }}></span>
            {n.label}
            <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono'", fontSize: "10px", color: "oklch(0.65 0.01 260)" }}>{n.tag || ""}</span>
          </div>
        );
      })}

      <div data-tour="sidebar-help" style={css("margin-top:auto; display:flex; flex-direction:column; gap:8px;")}>
        <button onClick={openTour} style={css("display:flex; align-items:center; gap:9px; width:100%; text-align:left; font-family:'IBM Plex Sans'; font-size:13px; color:oklch(0.4 0.13 255); background:oklch(0.55 0.15 255 / 0.08); border:1px solid oklch(0.55 0.15 255 / 0.25); padding:11px 12px; border-radius:10px; cursor:pointer;")}>🎬 Take the tour</button>
        <button onClick={openContact} style={css("display:flex; align-items:center; gap:9px; width:100%; text-align:left; font-family:'IBM Plex Sans'; font-size:13px; color:oklch(0.4 0.015 260); background:oklch(0.98 0.003 260); border:1px solid oklch(0.92 0.006 260); padding:11px 12px; border-radius:10px; cursor:pointer;")}>💬 Contact us</button>
        <button onClick={openExt} style={css("display:flex; align-items:center; gap:9px; width:100%; text-align:left; font-family:'IBM Plex Sans'; font-size:13px; color:oklch(0.4 0.015 260); background:oklch(0.98 0.003 260); border:1px solid oklch(0.92 0.006 260); padding:11px 12px; border-radius:10px; cursor:pointer;")}>🧩 Browser extension</button>
        <div
          onClick={() => navigate(ROUTES.settings)}
          style={css("display:flex; align-items:center; gap:10px; padding:8px; border-top:1px solid oklch(0.94 0.006 260); cursor:pointer;")}
        >
          <div style={css("width:32px;height:32px;border-radius:50%;background:oklch(0.55 0.15 255 / 0.15);color:oklch(0.4 0.13 255);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;flex:0 0 auto;")}>
            {initials(name, email)}
          </div>
          <div style={css("line-height:1.2; min-width:0;")}>
            <div style={css("font-size:13px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;")}>
              {name ?? email ?? "Your account"}
            </div>
            <div style={css("font-size:11.5px; color:oklch(0.55 0.015 260); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;")}>
              {profile.data?.headline ?? (settings.plan === "pro" ? "Pro" : "Free plan")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
