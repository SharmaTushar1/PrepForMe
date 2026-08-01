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
import type {
  AppState,
  Application,
  ReferralChannel,
  Tab,
  View,
} from "./types";
import {
  ACCENT,
  COL_COLORS,
  INITIAL_APPS,
  STAGES,
  TOUR_STEPS,
  logo,
  stageStyle,
} from "./data";

const DEMO_INTERVAL = 3400;

const INITIAL_STATE: AppState = {
  view: "landing",
  demo: 0,
  obStep: 0,
  selectedAppId: "stripe",
  tab: "materials",
  trackerView: "board",
  tailoring: false,
  debriefSaved: false,
  extOpen: false,
  roundType: "Technical",
  referralChannel: "invite",
  premium: false,
  charLimit: 200,
  tourOpen: false,
  tourStep: 0,
  spot: null,
  justLeveled: null,
  contactOpen: false,
  contactSent: false,
  apps: INITIAL_APPS,
};

/** An application decorated with the presentation values the design derives. */
export interface DecoratedApp extends Application {
  initial: string;
  logoBg: string;
  logoFg: string;
  stageColor: string;
  stageBg: string;
  resumeDot: string;
  prepDot: string;
  open: () => void;
}

export interface Column {
  name: string;
  color: string;
  count: number;
  apps: DecoratedApp[];
}

interface Ctx {
  state: AppState;
  /** Shared derivations (mirror the design's renderVals). */
  apps: DecoratedApp[];
  columns: Column[];
  selectedApp: DecoratedApp;

  // navigation
  go: (view: View) => void;
  goHome: () => void;
  goApplications: () => void;
  goProfile: () => void;
  openApp: (id: string) => void;
  signOut: () => void;

  // landing demo
  setDemo: (i: number) => void;
  enterApp: () => void;
  startOnboarding: () => void;

  // onboarding
  setObStep: (n: number) => void;
  obUpload: () => void;
  finishOnboarding: () => void;

  // tracker
  setTrackerView: (v: "board" | "table") => void;

  // detail
  setTab: (t: Tab) => void;
  advance: () => void;
  tailorNow: () => void;
  /** Switch the active company prep room (design: same coach, different dossier). */
  switchRoom: (id: string) => void;

  // referrals
  setChannel: (c: ReferralChannel) => void;
  togglePremium: () => void;
  incLimit: () => void;
  decLimit: () => void;

  // debrief
  setRoundType: (t: string) => void;
  saveDebrief: () => void;
  goDebrief: () => void;
  openStripeDebrief: () => void;
  backFromDebrief: () => void;

  // shortcuts used on Home
  openStripe: () => void;
  openFigma: () => void;

  // extension
  openExt: () => void;
  closeExt: () => void;

  // tour
  openTour: () => void;
  closeTour: () => void;
  tourNext: () => void;
  tourPrev: () => void;
  positionTour: () => void;

  // contact
  openContact: () => void;
  closeContact: () => void;
  sendContact: () => void;
}

const AppContext = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within <AppProvider>");
  return ctx;
}

type Patch = Partial<AppState> | ((s: AppState) => Partial<AppState>);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setRaw] = useState<AppState>(INITIAL_STATE);
  const stateRef = useRef<AppState>(state);
  stateRef.current = state;

  const demoTimer = useRef<number | null>(null);
  const tailorTimer = useRef<number | null>(null);
  const obTimer = useRef<number | null>(null);
  const spotTimer = useRef<number | null>(null);

  const setState = useCallback((patch: Patch) => {
    setRaw((prev) => {
      const p = typeof patch === "function" ? patch(prev) : patch;
      const next = { ...prev, ...p };
      stateRef.current = next;
      return next;
    });
  }, []);

  // ---- landing demo auto-rotate (design: setInterval every 3400ms) ----
  const stopDemo = useCallback(() => {
    if (demoTimer.current !== null) {
      clearInterval(demoTimer.current);
      demoTimer.current = null;
    }
  }, []);
  const startDemo = useCallback(() => {
    stopDemo();
    demoTimer.current = window.setInterval(
      () => setState((s) => ({ demo: (s.demo + 1) % 4 })),
      DEMO_INTERVAL,
    );
  }, [setState, stopDemo]);

  useEffect(() => {
    startDemo();
    return () => {
      stopDemo();
      if (tailorTimer.current) clearTimeout(tailorTimer.current);
      if (obTimer.current) clearTimeout(obTimer.current);
      if (spotTimer.current) clearTimeout(spotTimer.current);
    };
  }, [startDemo, stopDemo]);

  const scrollTop = () => {
    try {
      window.scrollTo(0, 0);
    } catch {
      /* noop */
    }
  };

  // ---- navigation ----
  const go = useCallback(
    (view: View) => {
      scrollTop();
      setState({ view });
    },
    [setState],
  );
  const openApp = useCallback(
    (id: string) => {
      scrollTop();
      setState({ selectedAppId: id, view: "appDetail", tab: "materials" });
    },
    [setState],
  );

  // ---- tour ----
  const stepPatch = useCallback((i: number): Partial<AppState> => {
    const step = TOUR_STEPS[i];
    const patch: Partial<AppState> = { tourStep: i, spot: null };
    if (step.view) patch.view = step.view;
    if (step.appId) patch.selectedAppId = step.appId;
    if (step.tab) patch.tab = step.tab;
    return patch;
  }, []);

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

  const openTour = useCallback(() => {
    setState({ tourOpen: true, ...stepPatch(0) });
  }, [setState, stepPatch]);

  const closeTour = useCallback(() => {
    try {
      localStorage.setItem("jc_tour_seen", "1");
    } catch {
      /* noop */
    }
    setState({ tourOpen: false, spot: null });
  }, [setState]);

  const runStep = useCallback(
    (i: number) => {
      setState(stepPatch(i));
    },
    [setState, stepPatch],
  );

  const tourNext = useCallback(() => {
    const s = stateRef.current;
    if (s.tourStep >= TOUR_STEPS.length - 1) closeTour();
    else runStep(s.tourStep + 1);
  }, [closeTour, runStep]);

  const tourPrev = useCallback(() => {
    const s = stateRef.current;
    if (s.tourStep > 0) runStep(s.tourStep - 1);
  }, [runStep]);

  const maybeTour = useCallback(() => {
    let seen = false;
    try {
      seen = localStorage.getItem("jc_tour_seen") === "1";
    } catch {
      /* noop */
    }
    if (!seen) openTour();
  }, [openTour]);

  // ---- landing / onboarding ----
  const setDemo = useCallback(
    (i: number) => {
      stopDemo();
      setState({ demo: i });
      startDemo();
    },
    [setState, startDemo, stopDemo],
  );
  const enterApp = useCallback(() => {
    go("home");
    maybeTour();
  }, [go, maybeTour]);
  const startOnboarding = useCallback(() => go("onboarding"), [go]);
  const setObStep = useCallback((n: number) => setState({ obStep: n }), [setState]);
  const obUpload = useCallback(() => {
    setState({ obStep: 1 });
    obTimer.current = window.setTimeout(() => setState({ obStep: 2 }), 2200);
  }, [setState]);
  const finishOnboarding = useCallback(() => {
    go("home");
    maybeTour();
  }, [go, maybeTour]);

  // ---- detail ----
  const setTab = useCallback((tab: Tab) => setState({ tab }), [setState]);
  const switchRoom = useCallback(
    (id: string) => setState({ selectedAppId: id, tab: "prep" }),
    [setState],
  );
  const advance = useCallback(() => {
    setState((s) => ({
      apps: s.apps.map((a) => {
        if (a.id !== s.selectedAppId) return a;
        const i = STAGES.indexOf(a.stage as (typeof STAGES)[number]);
        return i >= 0 && i < STAGES.length - 1
          ? { ...a, stage: STAGES[i + 1] }
          : a;
      }),
    }));
  }, [setState]);
  const tailorNow = useCallback(() => {
    setState({ tailoring: true });
    tailorTimer.current = window.setTimeout(
      () => setState({ tailoring: false }),
      1600,
    );
  }, [setState]);

  // ---- referrals ----
  const setChannel = useCallback(
    (c: ReferralChannel) => setState({ referralChannel: c }),
    [setState],
  );
  const togglePremium = useCallback(() => {
    setState((s) => {
      const np = !s.premium;
      return { premium: np, charLimit: np ? s.charLimit : Math.min(s.charLimit, 200) };
    });
  }, [setState]);
  const incLimit = useCallback(() => {
    setState((s) => ({ charLimit: Math.min(s.premium ? 300 : 200, s.charLimit + 20) }));
  }, [setState]);
  const decLimit = useCallback(() => {
    setState((s) => ({ charLimit: Math.max(120, s.charLimit - 20) }));
  }, [setState]);

  // ---- debrief ----
  const setRoundType = useCallback(
    (t: string) => setState({ roundType: t }),
    [setState],
  );
  const saveDebrief = useCallback(() => {
    setState((s) => ({
      debriefSaved: true,
      justLeveled: s.selectedAppId,
      apps: s.apps.map((a) =>
        a.id === s.selectedAppId ? { ...a, debriefs: a.debriefs + 1 } : a,
      ),
    }));
  }, [setState]);
  const goDebrief = useCallback(
    () => setState({ debriefSaved: false, justLeveled: null, view: "debrief" }),
    [setState],
  );
  const openStripeDebrief = useCallback(
    () =>
      setState({
        selectedAppId: "stripe",
        debriefSaved: false,
        justLeveled: null,
        view: "debrief",
      }),
    [setState],
  );
  const backFromDebrief = useCallback(
    () => setState({ view: "appDetail", tab: "prep" }),
    [setState],
  );

  // ---- misc ----
  const openExt = useCallback(() => setState({ extOpen: true }), [setState]);
  const closeExt = useCallback(() => setState({ extOpen: false }), [setState]);
  const openContact = useCallback(
    () => setState({ contactOpen: true, contactSent: false }),
    [setState],
  );
  const closeContact = useCallback(
    () => setState({ contactOpen: false, contactSent: false }),
    [setState],
  );
  const sendContact = useCallback(() => setState({ contactSent: true }), [setState]);

  // ---- shared derivations (mirror renderVals) ----
  const apps = useMemo<DecoratedApp[]>(
    () =>
      state.apps.map((a) => {
        const [lb, lf] = logo(a);
        const [sc, sb] = stageStyle(a.stage);
        return {
          ...a,
          initial: a.company[0],
          logoBg: lb,
          logoFg: lf,
          stageColor: sc,
          stageBg: sb,
          resumeDot: a.resume ? ACCENT : "oklch(0.88 0.006 260)",
          prepDot: a.prep ? "oklch(0.6 0.13 150)" : "oklch(0.88 0.006 260)",
          open: () => openApp(a.id),
        };
      }),
    [state.apps, openApp],
  );

  const columns = useMemo<Column[]>(
    () =>
      STAGES.map((name) => {
        const list = apps.filter((a) => a.stage === name);
        return { name, color: COL_COLORS[name], count: list.length, apps: list };
      }),
    [apps],
  );

  const selectedApp = useMemo<DecoratedApp>(
    () => apps.find((a) => a.id === state.selectedAppId) || apps[0],
    [apps, state.selectedAppId],
  );

  const value: Ctx = {
    state,
    apps,
    columns,
    selectedApp,
    go,
    goHome: useCallback(() => go("home"), [go]),
    goApplications: useCallback(() => go("applications"), [go]),
    goProfile: useCallback(() => go("profile"), [go]),
    openApp,
    signOut: useCallback(() => go("landing"), [go]),
    setDemo,
    enterApp,
    startOnboarding,
    setObStep,
    obUpload,
    finishOnboarding,
    setTrackerView: useCallback((v) => setState({ trackerView: v }), [setState]),
    setTab,
    advance,
    tailorNow,
    switchRoom,
    setChannel,
    togglePremium,
    incLimit,
    decLimit,
    setRoundType,
    saveDebrief,
    goDebrief,
    openStripeDebrief,
    backFromDebrief,
    openStripe: useCallback(() => openApp("stripe"), [openApp]),
    openFigma: useCallback(() => openApp("figma"), [openApp]),
    openExt,
    closeExt,
    openTour,
    closeTour,
    tourNext,
    tourPrev,
    positionTour,
    openContact,
    closeContact,
    sendContact,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
