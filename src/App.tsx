import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useApp } from "./store";
import { useSession } from "./auth/SessionProvider";
import { css } from "./css";
import { ROUTES } from "./routes";
import { Landing } from "./components/Landing";
import { Login } from "./components/Login";
import { Onboarding } from "./components/Onboarding";
import { AppShell } from "./components/AppShell";
import { Home } from "./components/Home";
import { Applications } from "./components/Applications";
import { AppDetail } from "./components/AppDetail";
import { Debrief } from "./components/Debrief";
import { Profile } from "./components/Profile";
import { ResumeReport } from "./components/ResumeReport";
import { Discover } from "./components/Discover";
import { Practice } from "./components/Practice";
import { Settings } from "./components/Settings";
import { ContactModal } from "./components/ContactModal";
import { Spinner } from "./components/ui";

function FullPageSpinner() {
  return (
    <div style={css("min-height:100vh; display:flex; align-items:center; justify-content:center;")}>
      <Spinner size={30} />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!session) {
    return <Navigate to={ROUTES.login} replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

/** Each screen starts at the top, the way a page navigation should. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const { state } = useApp();

  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path={ROUTES.landing} element={<Landing />} />
        <Route path={ROUTES.login} element={<Login />} />
        <Route
          path={ROUTES.onboarding}
          element={
            <RequireAuth>
              <Onboarding />
            </RequireAuth>
          }
        />
        <Route
          path={ROUTES.home}
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Home />} />
          <Route path="applications" element={<Applications />} />
          <Route path="applications/:id" element={<AppDetail />} />
          <Route path="applications/:id/recap/new" element={<Debrief />} />
          <Route path="profile" element={<Profile />} />
          <Route path="resume" element={<ResumeReport />} />
          <Route path="discover" element={<Discover />} />
          <Route path="practice" element={<Practice />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to={ROUTES.landing} replace />} />
      </Routes>

      {/* Contact / support overlay — available on the marketing site and in-app */}
      {state.contactOpen && <ContactModal />}
    </>
  );
}
