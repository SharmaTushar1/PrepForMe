import { useMemo } from "react";
import type { Application, Stage } from "../types";
import { ACCENT, COL_COLORS, MUTED_DOT, STAGES, logoPalette, stageStyle } from "../data";
import { depthIndex, depthLabel, depthScore } from "../lib/depth";
import { relativeTime } from "../lib/format";
import { useApplications } from "./applications";

/** An application plus the presentation values every screen needs. */
export interface DecoratedApp extends Application {
  initial: string;
  logoBg: string;
  logoFg: string;
  stageColor: string;
  stageBg: string;
  resumeDot: string;
  prepDot: string;
  /** The user's next action, or the obvious one for this stage. */
  nextLabel: string;
  updatedLabel: string;
  prepStarted: boolean;
  depthScore: number;
  depthIndex: number;
  depthLabel: string;
}

export interface Column {
  name: Stage;
  color: string;
  count: number;
  apps: DecoratedApp[];
}

/** What to do next when the user hasn't written it down themselves. */
export function suggestedNext(app: Application): string {
  if (app.nextAction) return app.nextAction;
  switch (app.stage) {
    case "Saved":
      return app.resumeTailored ? "Apply" : "Tailor & apply";
    case "Applied":
      return app.resumeTailored ? "Awaiting response" : "Tailor resume";
    case "Screen":
    case "Technical":
    case "Onsite":
      return app.recapCount > 0 ? "Prep the next round" : "Prep this round";
    case "Offer":
      return "Review the offer";
    case "Rejected":
      return "What did you learn?";
    case "Withdrawn":
      return "Closed";
  }
}

export function decorate(app: Application, now = Date.now()): DecoratedApp {
  const [logoBg, logoFg] = logoPalette(app.company);
  const [stageColor, stageBg] = stageStyle(app.stage);
  const score = depthScore(app.sourceCount, app.recapCount);
  const prepStarted = app.sourceCount > 0 || app.recapCount > 0;

  return {
    ...app,
    initial: app.company.trim().charAt(0).toUpperCase() || "?",
    logoBg,
    logoFg,
    stageColor,
    stageBg,
    resumeDot: app.resumeTailored ? ACCENT : MUTED_DOT,
    prepDot: prepStarted ? "oklch(0.6 0.13 150)" : MUTED_DOT,
    nextLabel: suggestedNext(app),
    updatedLabel: relativeTime(app.updatedAt, now),
    prepStarted,
    depthScore: score,
    depthIndex: depthIndex(score),
    depthLabel: depthLabel(score),
  };
}

/** Applications with presentation values, plus the kanban grouping. */
export function useDecoratedApplications() {
  const query = useApplications();

  const apps = useMemo<DecoratedApp[]>(() => {
    const now = Date.now();
    return (query.data ?? []).map((a) => decorate(a, now));
  }, [query.data]);

  const columns = useMemo<Column[]>(
    () =>
      STAGES.map((name) => {
        const list = apps.filter((a) => a.stage === name);
        return { name, color: COL_COLORS[name], count: list.length, apps: list };
      }),
    [apps],
  );

  /** The company whose prep space knows the most — the Home dossier card. */
  const deepest = useMemo<DecoratedApp | null>(() => {
    let best: DecoratedApp | null = null;
    for (const app of apps) {
      if (!best || app.depthScore > best.depthScore) best = app;
    }
    return best && best.depthScore > 0 ? best : (apps[0] ?? null);
  }, [apps]);

  return {
    apps,
    columns,
    deepest,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Look up one application by id, without assuming it exists. */
export function useDecoratedApplication(id: string | undefined) {
  const { apps, isLoading, isError, error, refetch } = useDecoratedApplications();
  const app = useMemo(
    () => (id ? apps.find((a) => a.id === id) ?? null : null),
    [apps, id],
  );
  return { app, apps, isLoading, isError, error, refetch };
}
