// Decision-center aggregator: folds the dashboard's already-computed deterministic
// signals into ONE ranked, deep-linked, dismissible "what to do next" list. Pure
// (deterministic, DOM-free) so it unit-tests against fixtures.
//
// Stale-import nudges live on DashboardImportHealth only (not duplicated here).
// Surplus/debt-due chips stay on /plans via SurplusCard (slice 2 intentionally omitted).
// Debt-detect and settle-ready use plan detail / plan progress surfaces.

import * as m from "$lib/paraglide/messages";
import { pickMostUrgentOffTrackSave } from "$lib/services/plan-save-pace";
import type { PlanKind } from "$lib/types";

export type DashboardActionKind = "overdue" | "save_off_track" | "spending_anomaly";

export type DashboardActionTone = "warn" | "default" | "muted";

export interface DashboardAction {
  id: string;
  kind: DashboardActionKind;
  /** Lower = more urgent; the list sorts ascending then caps. */
  priority: number;
  tone: DashboardActionTone;
  title: string;
  detail?: string;
  href: string;
  /** Stable key persisted in action_dismissals so the item does not re-nag. */
  dismissKey: string;
}

export interface AttentionPlan {
  planId: string;
  planName: string;
  kind: PlanKind;
  eligibleCount: number;
  monthlyNeeded: number | null;
  monthlyActual: number | null;
  monthlyActualBasis: string;
}

export interface AttentionInput {
  overdueCount: number;
  plans: AttentionPlan[];
}

export interface SpendingAnomalyInput {
  categoryId: string;
  name: string;
  total: number;
  /** Rolling per-period average for this category; the spike is total vs this. */
  avgTotal: number;
}

export interface BuildDashboardActionsInput {
  attention: AttentionInput;
  anomalies: SpendingAnomalyInput[];
  /**
   * Stable id of the current spending-insight period (e.g. its window start).
   * Scopes anomaly and overdue dismissals so a later period re-surfaces instead of
   * being permanently silenced by one "Pomiń".
   */
  periodKey: string;
  /** Inclusive end of the current period — used in anomaly deep links. */
  periodEnd: string;
  dismissedKeys?: ReadonlySet<string>;
  limit?: number;
}

const PRIORITY: Record<DashboardActionKind, number> = {
  overdue: 0,
  spending_anomaly: 1,
  save_off_track: 2,
};

const DEFAULT_LIMIT = 5;
export const DASHBOARD_ACTIONS_PREVIEW = 3;

function attentionMeta(
  id: string,
  periodKey: string
): { kind: DashboardActionKind; dismissKey: string } {
  if (id === "overdue") return { kind: "overdue", dismissKey: `overdue:${periodKey}` };
  return { kind: "save_off_track", dismissKey: `save_off_track:${id.replace(/^save-/, "")}` };
}

function buildAttentionItems(input: AttentionInput): {
  id: string;
  label: string;
  href: string;
  tone: DashboardActionTone;
}[] {
  const items: {
    id: string;
    label: string;
    href: string;
    tone: DashboardActionTone;
  }[] = [];

  if (input.overdueCount > 0) {
    items.push({
      id: "overdue",
      label: m.attention_overdue({ count: input.overdueCount }),
      href: "/transactions?status=overdue",
      tone: "warn",
    });
  }

  const offTrack = pickMostUrgentOffTrackSave(input.plans);
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

export function buildDashboardActions(input: BuildDashboardActionsInput): DashboardAction[] {
  const dismissed = input.dismissedKeys ?? new Set<string>();
  const limit = input.limit ?? DEFAULT_LIMIT;
  const out: DashboardAction[] = [];

  for (const item of buildAttentionItems(input.attention)) {
    const { kind, dismissKey } = attentionMeta(item.id, input.periodKey);
    out.push({
      id: item.id,
      kind,
      priority: PRIORITY[kind],
      tone: item.tone,
      title: item.label,
      href: item.href,
      dismissKey,
    });
  }

  for (const a of input.anomalies) {
    out.push({
      id: `anomaly-${a.categoryId}`,
      kind: "spending_anomaly",
      priority: PRIORITY.spending_anomaly,
      tone: "warn",
      title: m.dashboard_action_anomaly_title({ name: a.name }),
      detail: m.dashboard_action_anomaly_detail(),
      href: `/transactions?categoryId=${a.categoryId}&startDate=${input.periodKey}&endDate=${input.periodEnd}`,
      dismissKey: `spending_anomaly:${a.categoryId}:${input.periodKey}`,
    });
  }

  const byKey = new Map<string, DashboardAction>();
  for (const action of out) {
    if (dismissed.has(action.dismissKey)) continue;
    const existing = byKey.get(action.dismissKey);
    if (!existing || action.priority < existing.priority) byKey.set(action.dismissKey, action);
  }

  return [...byKey.values()].sort((a, b) => a.priority - b.priority).slice(0, limit);
}
