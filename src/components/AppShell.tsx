import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useApp } from "../store";
import { Sidebar } from "./Sidebar";
import { Tour } from "./Tour";
import { ExtensionPopup } from "./ExtensionPopup";
import { AddRoleModal } from "./RoleDialog";

export function AppShell() {
  const { state, maybeStartTour } = useApp();

  // First arrival gets the tour; after that it's opt-in from the sidebar.
  useEffect(() => {
    maybeStartTour();
  }, [maybeStartTour]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <Sidebar />

      {/* main scroll area */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Outlet />
      </div>

      {/* overlays scoped to the app shell */}
      {state.tourOpen && <Tour />}
      {state.extOpen && <ExtensionPopup />}
      {state.addRoleOpen && <AddRoleModal />}
    </div>
  );
}
