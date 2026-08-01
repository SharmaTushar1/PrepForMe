import { useApp } from "./store";
import { Landing } from "./components/Landing";
import { Onboarding } from "./components/Onboarding";
import { AppShell } from "./components/AppShell";
import { ContactModal } from "./components/ContactModal";

export default function App() {
  const { state } = useApp();
  const v = state.view;
  const isApp = v !== "landing" && v !== "onboarding";

  return (
    <div style={{ minHeight: "100vh" }}>
      {v === "landing" && <Landing />}
      {v === "onboarding" && <Onboarding />}
      {isApp && <AppShell />}

      {/* Contact / support overlay — available on landing and in-app */}
      {state.contactOpen && <ContactModal />}
    </div>
  );
}
