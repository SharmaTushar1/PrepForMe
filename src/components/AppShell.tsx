import { useApp } from "../store";
import { Sidebar } from "./Sidebar";
import { Home } from "./Home";
import { Applications } from "./Applications";
import { AppDetail } from "./AppDetail";
import { Debrief } from "./Debrief";
import { Profile } from "./Profile";
import { Discover } from "./Discover";
import { Practice } from "./Practice";
import { Settings } from "./Settings";
import { Tour } from "./Tour";
import { ExtensionPopup } from "./ExtensionPopup";

export function AppShell() {
  const { state } = useApp();
  const v = state.view;

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />

      {/* main scroll area */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {v === "home" && <Home />}
        {v === "applications" && <Applications />}
        {v === "appDetail" && <AppDetail />}
        {v === "debrief" && <Debrief />}
        {v === "profile" && <Profile />}
        {v === "discover" && <Discover />}
        {v === "practice" && <Practice />}
        {v === "settings" && <Settings />}
      </div>

      {/* overlays scoped to the app shell */}
      {state.tourOpen && <Tour />}
      {state.extOpen && <ExtensionPopup />}
    </div>
  );
}
