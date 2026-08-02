import { useMemo } from "react";
import type { FunnelMetrics, Stage } from "../types";
import { CLOSED_STAGES, INTERVIEW_STAGES, RESPONDED_STAGES, ROUND_STAGES } from "../data";
import { extractKeywords, covers } from "../lib/ai/keywords";
import { readinessIndex, readinessLabel } from "../lib/depth";
import { isThisWeek } from "../lib/format";
import { useStageEvents } from "./applications";
import { useDecoratedApplications, type DecoratedApp } from "./derived";
import { useProfileContext } from "./profile";
import { useSettings } from "./settings";

const DAY = 86_400_000;

/**
 * The funnel, computed from stage history rather than the current stage — a role
 * that was screened and then rejected still counts as a response.
 */
export function useFunnelMetrics(): { metrics: FunnelMetrics; isLoading: boolean } {
  const { apps, isLoading: appsLoading } = useDecoratedApplications();
  const events = useStageEvents();

  const metrics = useMemo<FunnelMetrics>(() => {
    const reached = new Map<string, Set<Stage>>();
    for (const event of events.data ?? []) {
      const set = reached.get(event.application_id) ?? new Set<Stage>();
      set.add(event.to_stage);
      reached.set(event.application_id, set);
    }

    const everReached = (app: DecoratedApp, stages: Stage[]) => {
      const set = reached.get(app.id);
      if (set && stages.some((s) => set.has(s))) return true;
      // Fall back to the current stage if history is somehow missing.
      return stages.includes(app.stage);
    };

    const applied = apps.filter((a) => a.appliedAt !== null || a.stage !== "Saved");
    const responded = applied.filter((a) => everReached(a, RESPONDED_STAGES));
    const interviewed = applied.filter((a) => everReached(a, INTERVIEW_STAGES));
    const offers = apps.filter((a) => everReached(a, ["Offer"]));

    return {
      total: apps.length,
      active: apps.filter((a) => !CLOSED_STAGES.includes(a.stage)).length,
      applied: applied.length,
      responded: responded.length,
      interviewed: interviewed.length,
      offers: offers.length,
      responseRate: applied.length ? responded.length / applied.length : null,
      interviewRate: applied.length ? interviewed.length / applied.length : null,
    };
  }, [apps, events.data]);

  return { metrics, isLoading: appsLoading || events.isLoading };
}

/** Roles with an interview booked inside the current Monday–Sunday window. */
export function useInterviewsThisWeek(): DecoratedApp[] {
  const { apps } = useDecoratedApplications();
  return useMemo(
    () =>
      apps
        .filter(
          (a) =>
            !CLOSED_STAGES.includes(a.stage) &&
            a.nextActionAt !== null &&
            isThisWeek(a.nextActionAt),
        )
        .sort((a, b) => (a.nextActionAt ?? "").localeCompare(b.nextActionAt ?? "")),
    [apps],
  );
}

/** Prep strength across the roles still in play. */
export function useReadiness(): { index: number; label: string; segments: number } {
  const { apps } = useDecoratedApplications();
  return useMemo(() => {
    const live = apps.filter((a) => !CLOSED_STAGES.includes(a.stage));
    const scores = live.map((a) => a.depthScore);
    return { index: readinessIndex(scores), label: readinessLabel(scores), segments: 4 };
  }, [apps]);
}

export type AttentionKind = "recap" | "prep" | "tailor" | "stale" | "offer";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  app: DecoratedApp;
  title: string;
  detail: string;
  /** Short right-aligned chip: a day, an age, or a count. */
  chip: string;
  urgent: boolean;
  tab: "materials" | "prep" | "debriefs";
}

/**
 * What needs the user next, in the order it needs them. Every item states a
 * fact drawn from their own data — no scores, no guesses.
 */
export function useNeedsAttention(): { items: AttentionItem[]; isLoading: boolean } {
  const { apps, isLoading } = useDecoratedApplications();
  const events = useStageEvents();
  const { settings } = useSettings();
  const context = useProfileContext();

  return useMemo(() => {
    const now = Date.now();
    const items: AttentionItem[] = [];

    // How many interview rounds each role has actually been through.
    const rounds = new Map<string, number>();
    for (const event of events.data ?? []) {
      if (!ROUND_STAGES.includes(event.to_stage)) continue;
      rounds.set(event.application_id, (rounds.get(event.application_id) ?? 0) + 1);
    }

    const resumeText = [
      ...context.experiences.flatMap((e) => [e.title, e.summary ?? "", ...e.bullets.filter((b) => b.enabled).map((b) => b.text)]),
      ...context.skills.map((s) => s.name),
    ].join("\n");

    for (const app of apps) {
      if (CLOSED_STAGES.includes(app.stage)) continue;

      const roundsDone = rounds.get(app.id) ?? 0;
      const unlogged = roundsDone - app.recapCount;
      if (settings.nudgeRecaps && unlogged > 0) {
        items.push({
          id: `recap-${app.id}`,
          kind: "recap",
          app,
          title: `Log your ${app.company} recap`,
          detail:
            unlogged === 1
              ? `You've been through a ${app.stage.toLowerCase()} round — capture it while it's fresh`
              : `${unlogged} rounds logged nowhere yet — capture them while they're fresh`,
          chip: app.updatedLabel,
          urgent: true,
          tab: "debriefs",
        });
      }

      if (app.nextActionAt) {
        const due = new Date(app.nextActionAt).getTime();
        const days = (due - now) / DAY;
        if (days >= -1 && days <= 7) {
          items.push({
            id: `prep-${app.id}`,
            kind: "prep",
            app,
            title: `Prep · ${app.company} ${app.stage.toLowerCase()}`,
            detail: app.prepStarted
              ? `${app.sourceCount} source${app.sourceCount === 1 ? "" : "s"} · ${app.recapCount} recap${app.recapCount === 1 ? "" : "s"} in this space`
              : "Nothing in this prep space yet — add a source or log a recap",
            chip: new Date(app.nextActionAt).toLocaleDateString("en-US", { weekday: "short" }),
            urgent: days <= 2,
            tab: "prep",
          });
        }
      }

      if (!app.resumeTailored && (app.stage === "Saved" || app.stage === "Applied")) {
        const missing = app.jobDescription
          ? extractKeywords(app.jobDescription).filter((k) => !covers(resumeText, k)).length
          : 0;
        items.push({
          id: `tailor-${app.id}`,
          kind: "tailor",
          app,
          title: `Tailor resume · ${app.company} ${app.role}`,
          detail: app.jobDescription
            ? missing > 0
              ? `${missing} keyword gap${missing === 1 ? "" : "s"} from the posting`
              : "The posting is saved — run a tailoring pass"
            : "No job description saved yet — paste it in to tailor against it",
          chip: app.updatedLabel,
          urgent: false,
          tab: "materials",
        });
      }

      if (
        settings.flagStaleApplications &&
        app.stage === "Applied" &&
        now - new Date(app.updatedAt).getTime() > settings.flagStaleDays * DAY
      ) {
        const days = Math.round((now - new Date(app.updatedAt).getTime()) / DAY);
        items.push({
          id: `stale-${app.id}`,
          kind: "stale",
          app,
          title: `No word from ${app.company} in ${days} days`,
          detail: "Follow up, or move it out of the way",
          chip: `${days}d`,
          urgent: false,
          tab: "materials",
        });
      }

      if (app.stage === "Offer") {
        items.push({
          id: `offer-${app.id}`,
          kind: "offer",
          app,
          title: `Offer from ${app.company}`,
          detail: app.nextAction ?? "Decide, and log what got you here",
          chip: app.updatedLabel,
          urgent: true,
          tab: "debriefs",
        });
      }
    }

    const order: Record<AttentionKind, number> = {
      offer: 0,
      recap: 1,
      prep: 2,
      tailor: 3,
      stale: 4,
    };
    items.sort((a, b) => order[a.kind] - order[b.kind]);

    return { items: items.slice(0, 6), isLoading: isLoading || events.isLoading };
  }, [apps, events.data, events.isLoading, isLoading, settings, context.experiences, context.skills]);
}
