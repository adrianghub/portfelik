// Pure aggregator for the dashboard's concrete next actions. This intentionally
// excludes observations (for example spending anomalies): the attention surface
// only contains issues that have an explicit resolution path.

import * as m from "$lib/paraglide/messages";
import { pickMostUrgentOffTrackSave, savePlanShortfall } from "$lib/services/plan-save-pace";
import type { PlanKind } from "$lib/types";
import { formatCurrency } from "$lib/utils";
import type { ScopeFilter } from "$lib/utils/list-view-url";

export type DashboardActionKind = "overdue" | "save_shortfall";
export type DashboardActionTone = "warn" | "default";

export interface DashboardAction {
  id: string;
  kind: DashboardActionKind;
  tone: DashboardActionTone;
  title: string;
  detail: string;
  href: string;
}

export interface OverdueAttentionSummary {
  count: number;
  total: number;
  oldestDays: number;
  /** Inclusive range guaranteed to contain the overdue rows in the target list. */
  startDate: string;
  endDate: string;
}

export interface AttentionPlan {
  planId: string;
  planName: string;
  kind: PlanKind;
  groupId: string | null;
  eligibleCount: number;
  monthlyNeeded: number | null;
  monthlyActual: number | null;
  monthlyActualBasis: string;
}

export interface BuildDashboardActionsInput {
  overdue: OverdueAttentionSummary | null;
  plans: AttentionPlan[];
  groupFilter: ScopeFilter;
}

function matchesScope(plan: AttentionPlan, scope: ScopeFilter): boolean {
  if (scope === "all") return true;
  if (scope === "own") return plan.groupId === null;
  return plan.groupId === scope;
}

function overdueHref(summary: OverdueAttentionSummary, scope: ScopeFilter): string {
  const params = new URLSearchParams();
  params.set("startDate", summary.startDate);
  params.set("endDate", summary.endDate);
  params.set("group", scope);
  params.set("status", "overdue");
  return `/transactions?${params.toString()}`;
}

function planHref(planId: string, scope: ScopeFilter): string {
  const params = new URLSearchParams({ group: scope });
  return `/plans/${encodeURIComponent(planId)}/settle?${params.toString()}`;
}

export function buildDashboardActions(input: BuildDashboardActionsInput): DashboardAction[] {
  const actions: DashboardAction[] = [];

  if (input.overdue && input.overdue.count > 0) {
    actions.push({
      id: "overdue",
      kind: "overdue",
      tone: "warn",
      title: m.dashboard_task_overdue_title({
        count: input.overdue.count,
        amount: formatCurrency(input.overdue.total),
      }),
      detail: m.dashboard_task_overdue_detail({ days: input.overdue.oldestDays }),
      href: overdueHref(input.overdue, input.groupFilter),
    });
  }

  const offTrack = pickMostUrgentOffTrackSave(input.plans, (plan) =>
    matchesScope(plan, input.groupFilter)
  );
  if (offTrack) {
    actions.push({
      id: `save-${offTrack.planId}`,
      kind: "save_shortfall",
      tone: "default",
      title: m.dashboard_task_goal_title({
        name: offTrack.planName,
        amount: formatCurrency(savePlanShortfall(offTrack)),
      }),
      detail: m.dashboard_task_goal_detail(),
      href: planHref(offTrack.planId, input.groupFilter),
    });
  }

  return actions;
}
