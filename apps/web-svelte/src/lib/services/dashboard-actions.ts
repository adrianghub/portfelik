// Decision-center aggregator: folds the dashboard's already-computed deterministic
// signals into ONE ranked, deep-linked, dismissible "what to do next" list. Pure
// (deterministic, DOM-free) so it unit-tests against fixtures. Labels come from
// compiled Paraglide messages, like buildAttentionItems / buildPlanningQueueActions.
//
// No new financial math: every source is a value the dashboard already derives
// (attention signals, spending-insight anomalies, plan settle-ready counts,
// detected recurring debt payments, and — future — planning-queue surplus cards).
// Dismissal memory is applied here by filtering out keys the user has hidden/snoozed.

import * as m from "$lib/paraglide/messages";
import { buildAttentionItems, type AttentionInput } from "$lib/dashboard-attention";
import type { PlanningQueueAction } from "$lib/services/planning-queue";

export type DashboardActionKind =
  | "overdue"
  | "stale_import"
  | "save_off_track"
  | "spending_anomaly"
  | "settle_ready"
  | "debt_detected"
  | "surplus"
  | "debt_due";

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

export interface SpendingAnomalyInput {
  categoryId: string;
  name: string;
  total: number;
  /** Rolling per-period average for this category; the spike is total vs this. */
  avgTotal: number;
}

export interface SettleReadyInput {
  planId: string;
  planName: string;
  eligibleCount: number;
}

export interface DebtDetectedInput {
  planId: string;
  planName: string;
  /** First human reason from groupDebtPaymentCandidates, e.g. "3× kwota ~1500 zł". */
  reason: string;
}

export interface BuildDashboardActionsInput {
  attention: AttentionInput;
  anomalies: SpendingAnomalyInput[];
  settleReady: SettleReadyInput[];
  debtDetected: DebtDetectedInput[];
  /**
   * Stable id of the current spending-insight period (e.g. its window start).
   * Scopes anomaly dismissals so a later period's spike re-surfaces instead of
   * being permanently silenced by one "Pomiń".
   */
  periodKey: string;
  /** Planning-queue surplus/debt-due cards. Empty until wired (slice 2). */
  planningActions?: PlanningQueueAction[];
  dismissedKeys?: ReadonlySet<string>;
  limit?: number;
}

const PRIORITY: Record<DashboardActionKind, number> = {
  overdue: 0,
  debt_detected: 1,
  stale_import: 2,
  spending_anomaly: 3,
  settle_ready: 4,
  save_off_track: 5,
  surplus: 6,
  debt_due: 7,
};

const DEFAULT_LIMIT = 5;

/** Map an attention item id (built by buildAttentionItems) to a stable kind + dismiss key. */
function attentionMeta(id: string): { kind: DashboardActionKind; dismissKey: string } {
  if (id === "overdue") return { kind: "overdue", dismissKey: "overdue" };
  if (id === "import") return { kind: "stale_import", dismissKey: "stale_import" };
  // "save-<planId>"
  return { kind: "save_off_track", dismissKey: `save_off_track:${id.replace(/^save-/, "")}` };
}

/** Map a planning-queue action id to a stable kind + dismiss key. */
function planningMeta(id: string): { kind: DashboardActionKind; dismissKey: string } {
  if (id === "no-income") return { kind: "surplus", dismissKey: "surplus:no_income" };
  if (id.startsWith("debt-")) return { kind: "debt_due", dismissKey: "debt_due" };
  return { kind: "save_off_track", dismissKey: `save_off_track:${id.replace(/^save-/, "")}` };
}

export function buildDashboardActions(input: BuildDashboardActionsInput): DashboardAction[] {
  const dismissed = input.dismissedKeys ?? new Set<string>();
  const limit = input.limit ?? DEFAULT_LIMIT;
  const out: DashboardAction[] = [];

  // 1. Existing attention signals (overdue / stale import / off-track save).
  for (const item of buildAttentionItems(input.attention)) {
    const { kind, dismissKey } = attentionMeta(item.id);
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

  // 2. Spending anomalies — computed by computeSpendingInsight but otherwise unsurfaced.
  for (const a of input.anomalies) {
    out.push({
      id: `anomaly-${a.categoryId}`,
      kind: "spending_anomaly",
      priority: PRIORITY.spending_anomaly,
      tone: "warn",
      title: m.dashboard_action_anomaly_title({ name: a.name }),
      detail: m.dashboard_action_anomaly_detail(),
      href: `/transactions?categoryId=${a.categoryId}`,
      // Period-scoped: a fresh spike in a later period gets a new key and re-surfaces.
      dismissKey: `spending_anomaly:${a.categoryId}:${input.periodKey}`,
    });
  }

  // 3. Plans with transactions ready to settle (eligibleCount badge, now actionable).
  for (const s of input.settleReady) {
    if (s.eligibleCount <= 0) continue;
    out.push({
      id: `settle-${s.planId}`,
      kind: "settle_ready",
      priority: PRIORITY.settle_ready,
      tone: "default",
      title: m.dashboard_action_settle_title({ name: s.planName, count: s.eligibleCount }),
      href: `/plans/${s.planId}`,
      dismissKey: `settle_ready:${s.planId}`,
    });
  }

  // 4. Detected recurring debt payments not yet linked to their plan.
  for (const d of input.debtDetected) {
    out.push({
      id: `debt-detected-${d.planId}`,
      kind: "debt_detected",
      priority: PRIORITY.debt_detected,
      tone: "default",
      title: m.dashboard_action_debt_detected_title({ name: d.planName }),
      detail: d.reason,
      href: `/plans/${d.planId}`,
      dismissKey: `debt_detected:${d.planId}`,
    });
  }

  // 5. Planning-queue surplus / debt-due cards (empty until slice 2 wires the inputs).
  for (const p of input.planningActions ?? []) {
    const { kind, dismissKey } = planningMeta(p.id);
    out.push({
      id: p.id,
      kind,
      priority: PRIORITY[kind],
      tone: p.tone,
      title: p.label,
      href: p.href,
      dismissKey,
    });
  }

  // Drop dismissed/snoozed, dedupe by stable key (keep most urgent), sort, cap.
  const byKey = new Map<string, DashboardAction>();
  for (const action of out) {
    if (dismissed.has(action.dismissKey)) continue;
    const existing = byKey.get(action.dismissKey);
    if (!existing || action.priority < existing.priority) byKey.set(action.dismissKey, action);
  }

  return [...byKey.values()].sort((a, b) => a.priority - b.priority).slice(0, limit);
}
