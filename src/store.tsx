import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import type { TrackerView, UiState } from "./types";
import { TOUR_STEPS } from "./data";
import { useDecoratedApplications } from "./data/derived";

const INITIAL_STATE: UiState = {
  demo: 0,
  obStep: 0,
  trackerView: "board",
  extOpen: false,
  tourOpen: false,
  tourStep: 0,
  spot: null,
  justLeveled: null,
  contactOpen: false,
  contactSent: false,
  addRoleOpen: false,
};

const TOUR_SEEN_KEY = "jc_tour_seen";

interface Ctx {
  state: UiState;

  // onboarding
  setObStep: (n: number) => void;

  // tracker
  setTrackerView: (v: TrackerView) => void;

  // add-a-role dialog
  openAddRole: () => void;
  closeAddRole: () => void;

  // extension popup
  openExt: () => void;
  closeExt: () => void;

  // contact
  openContact: () => void;
  closeContact: () => void;
  sendContact: () => void;

  // "just leveled up" cue after a recap lands
  markLeveled: (applicationId: string) => void;
  clearLeveled: () => void;

  // tour
  openTour: () => void;
  closeTour: () => void;
  tourNext: () => void;
  tourPrev: () => void;
  positionTour: () => void;
  /** Open the tour the first time someone reaches the app. */
  maybeStartTour: () => void;
}

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}

type Patch = Partial<UiState> | ((s: UiState) => Partial<UiState>);

/**
 * UI-only state: which overlay is open, where the tour is, which view of the
 * tracker you prefer. Everything the user owns lives in Postgres and is read
 * through the hooks in `src/data`.
 */
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setRaw] = useState<UiState>(INITIAL_STATE);
  const stateRef = useRef<UiState>(state);
  stateRef.current = state;

  const navigate = useNavigate();
  const { apps, deepest } = useDecoratedApplications();
  const spotTimer = useRef<number | null>(null);

  const setState = useCallback((patch: Patch) => {
    setRaw((prev) => {
      const p = typeof patch === "function" ? patch(prev) : patch;
      const next = { ...prev, ...p };
      stateRef.current = next;
      return next;
    });
  }, []);

  useEffect(
    () => () => {
      if (spotTimer.current) window.clearTimeout(spotTimer.current);
    },
    [],
  );

  // ------------------------------------------------------------------ tour

  /** The application the tour points at. Null until the user has one. */
  const anchorId = deepest?.id ?? apps[0]?.id ?? null;
  const anchorRef = useRef<string | null>(anchorId);
  anchorRef.current = anchorId;

  const stepAvailable = useCallback((i: number): boolean => {
    const step = TOUR_STEPS[i];
    if (!step) return false;
    return !step.requiresApplication || !!anchorRef.current;
  }, []);

  const runStep = useCallback(
    (i: number) => {
      const step = TOUR_STEPS[i];
      if (!step) return;
      setState({ tourStep: i, spot: null });

      if (!step.path) return;
      const path = step.path.includes(":id")
        ? anchorRef.current
          ? step.path.replace(":id", anchorRef.current)
          : null
        : step.path;
      if (!path) return;
      navigate(step.tab ? `${path}?tab=${step.tab}` : path);
    },
    [navigate, setState],
  );

  const openTour = useCallback(() => {
    setState({ tourOpen: true });
    runStep(0);
  }, [runStep, setState]);

  const closeTour = useCallback(() => {
    try {
      localStorage.setItem(TOUR_SEEN_KEY, "1");
    } catch {
      /* private browsing — the tour just reopens next time */
    }
    setState({ tourOpen: false, spot: null });
  }, [setState]);

  const tourNext = useCallback(() => {
    let i = stateRef.current.tourStep + 1;
    while (i < TOUR_STEPS.length && !stepAvailable(i)) i++;
    if (i >= TOUR_STEPS.length) closeTour();
    else runStep(i);
  }, [closeTour, runStep, stepAvailable]);

  const tourPrev = useCallback(() => {
    let i = stateRef.current.tourStep - 1;
    while (i >= 0 && !stepAvailable(i)) i--;
    if (i >= 0) runStep(i);
  }, [runStep, stepAvailable]);

  const maybeStartTour = useCallback(() => {
    if (stateRef.current.tourOpen) return;
    let seen = false;
    try {
      seen = localStorage.getItem(TOUR_SEEN_KEY) === "1";
    } catch {
      /* treat unreadable storage as "not seen" */
    }
    if (!seen) openTour();
  }, [openTour]);

  const applySpot = useCallback(
    (el: Element) => {
      const r = el.getBoundingClientRect();
      const pad = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ttW = 330;
      const t = r.top - pad;
      const l = r.left - pad;
      const w = r.width + pad * 2;
      const h = r.height + pad * 2;
      const below = t + h < vh * 0.62;
      const ttTop = below ? t + h + 16 : t - 16;
      let ttLeft = l + w / 2 - ttW / 2;
      ttLeft = Math.max(16, Math.min(ttLeft, vw - ttW - 16));
      setState({ spot: { t, l, w, h, ttTop, ttLeft, below, ttW } });
    },
    [setState],
  );

  const positionTour = useCallback(() => {
    const s = stateRef.current;
    if (!s.tourOpen) return;
    const step = TOUR_STEPS[s.tourStep];
    if (!step || !step.sel) {
      setState({ spot: { centered: true } });
      return;
    }
    const el = document.querySelector(`[data-tour="${step.sel}"]`);
    if (!el) {
      setState({ spot: { centered: true } });
      return;
    }
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top < 100 || r.bottom > vh - 120) {
      window.scrollTo(0, Math.max(0, window.scrollY + r.top - 150));
      spotTimer.current = window.setTimeout(() => applySpot(el), 100);
    } else {
      applySpot(el);
    }
  }, [applySpot, setState]);

  // ----------------------------------------------------------------- misc

  const value = useMemo<Ctx>(
    () => ({
      state,
      setObStep: (obStep) => setState({ obStep }),
      setTrackerView: (trackerView) => setState({ trackerView }),
      openAddRole: () => setState({ addRoleOpen: true }),
      closeAddRole: () => setState({ addRoleOpen: false }),
      openExt: () => setState({ extOpen: true }),
      closeExt: () => setState({ extOpen: false }),
      openContact: () => setState({ contactOpen: true, contactSent: false }),
      closeContact: () => setState({ contactOpen: false, contactSent: false }),
      sendContact: () => setState({ contactSent: true }),
      markLeveled: (justLeveled) => setState({ justLeveled }),
      clearLeveled: () => setState({ justLeveled: null }),
      openTour,
      closeTour,
      tourNext,
      tourPrev,
      positionTour,
      maybeStartTour,
    }),
    [
      state,
      setState,
      openTour,
      closeTour,
      tourNext,
      tourPrev,
      positionTour,
      maybeStartTour,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
