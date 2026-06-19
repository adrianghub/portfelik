// Decision-center aggregator: turns already-loaded dashboard signals into one ranked,
// verb-first "what needs attention today" list. Pure (deterministic, DOM-free) so it
// unit-tests against fixtures; labels come from compiled Paraglide messages like
// buildPlanningQueueActions. No new state - it only reads signals the dashboard already has.

import * as m from "$lib/paraglide/messages";
import type { PlanKind } from "$lib/types";

export interface AttentionItem {
  id: string;
  label: string;
  href: string;
  tone: "warn" | "default";
}

export interface AttentionPlan {
  planId: string;
  planName: string;
  kind: PlanKind;
  eligibleCount: number;
  monthlyNeeded: number | null;
  /** Only a current-month deposit counts as keeping pace; a historical average does not. */
  monthlyActual: number | null;
  monthlyActualBasis: string;
}

export interface AttentionInput {
  /** Days since the last committed import, or null when nothing was ever imported. */
  daysSinceImport: number | null;
  cadenceDays: number;
  overdueCount: number;
  plans: AttentionPlan[];
}

const currentMonthPace = (p: AttentionPlan): number =>
  p.monthlyActualBasis === "current-month" ? (p.monthlyActual ?? 0) : 0;

export function buildAttentionItems(input: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  // 1. Overdue transactions - money action already late, highest urgency.
  if (input.overdueCount > 0) {
    items.push({
      id: "overdue",
      label: m.attention_overdue({ count: input.overdueCount }),
      href: "/transactions?status=overdue",
      tone: "warn",
    });
  }

  // 2. Stale / never-run import - fresh data gates everything downstream.
  const stale = input.daysSinceImport === null || input.daysSinceImport >= input.cadenceDays;
  if (stale) {
    items.push({
      id: "import",
      label:
        input.daysSinceImport === null
          ? m.attention_import_never()
          : m.attention_import_stale({ days: input.daysSinceImport }),
      href: "/import",
      tone: "warn",
    });
  }

  // 3. Save goal below this month's pace - a nudge, not an alarm.
  const offTrack = input.plans
    .filter(
      (p) =>
        p.kind === "save" &&
        p.monthlyNeeded != null &&
        p.monthlyNeeded > 0 &&
        currentMonthPace(p) < p.monthlyNeeded - 0.01
    )
    .sort((a, b) => (b.monthlyNeeded ?? 0) - (a.monthlyNeeded ?? 0))[0];
  if (offTrack) {
    items.push({
      id: `save-${offTrack.planId}`,
      label: m.attention_save_offtrack({ name: offTrack.planName }),
      href: `/plans/${offTrack.planId}`,
      tone: "default",
    });
  }

  return items.slice(0, 4);
}
