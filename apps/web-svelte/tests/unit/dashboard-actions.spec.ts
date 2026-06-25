import { describe, expect, it } from "vitest";
import {
  buildDashboardActions,
  type BuildDashboardActionsInput,
} from "$lib/services/dashboard-actions";
import type { AttentionInput } from "$lib/dashboard-attention";

const healthyAttention: AttentionInput = {
  daysSinceImport: 0,
  cadenceDays: 14,
  overdueCount: 0,
  plans: [],
};

const base: BuildDashboardActionsInput = {
  attention: healthyAttention,
  anomalies: [],
  settleReady: [],
  debtDetected: [],
  periodKey: "2026-06-22",
};

describe("buildDashboardActions", () => {
  it("returns nothing when every signal is healthy", () => {
    expect(buildDashboardActions(base)).toEqual([]);
  });

  it("folds existing attention signals with stable kinds + dismiss keys", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: { ...healthyAttention, overdueCount: 2, daysSinceImport: null },
    });
    const overdue = actions.find((a) => a.kind === "overdue");
    const importStale = actions.find((a) => a.kind === "stale_import");
    expect(overdue?.tone).toBe("warn");
    expect(overdue?.dismissKey).toBe("overdue");
    expect(importStale?.dismissKey).toBe("stale_import");
  });

  it("surfaces spending anomalies with a period-scoped dismiss key and ×avg detail", () => {
    const actions = buildDashboardActions({
      ...base,
      anomalies: [{ categoryId: "c1", name: "Restauracje", total: 300, avgTotal: 100 }],
    });
    const anomaly = actions.find((a) => a.kind === "spending_anomaly");
    expect(anomaly?.dismissKey).toBe("spending_anomaly:c1:2026-06-22");
    expect(anomaly?.href).toBe("/transactions?categoryId=c1");
    expect(anomaly?.detail).toContain("3.0");
    expect(anomaly?.tone).toBe("warn");
  });

  it("skips settle-ready plans with no eligible transactions", () => {
    const actions = buildDashboardActions({
      ...base,
      settleReady: [
        { planId: "p1", planName: "Wakacje", eligibleCount: 0 },
        { planId: "p2", planName: "Auto", eligibleCount: 3 },
      ],
    });
    expect(actions.some((a) => a.dismissKey === "settle_ready:p1")).toBe(false);
    expect(actions.some((a) => a.dismissKey === "settle_ready:p2")).toBe(true);
  });

  it("surfaces detected debt payments carrying the reason as detail", () => {
    const actions = buildDashboardActions({
      ...base,
      debtDetected: [{ planId: "d1", planName: "Hipoteka", reason: "3× kwota ~1500 zł" }],
    });
    const debt = actions.find((a) => a.kind === "debt_detected");
    expect(debt?.dismissKey).toBe("debt_detected:d1");
    expect(debt?.detail).toBe("3× kwota ~1500 zł");
    expect(debt?.href).toBe("/plans/d1");
  });

  it("orders by urgency: overdue → debt_detected → import → anomaly → settle", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: { ...healthyAttention, overdueCount: 1, daysSinceImport: null },
      anomalies: [{ categoryId: "c1", name: "X", total: 300, avgTotal: 100 }],
      settleReady: [{ planId: "p2", planName: "Auto", eligibleCount: 2 }],
      debtDetected: [{ planId: "d1", planName: "Hipoteka", reason: "rata" }],
    });
    expect(actions.map((a) => a.kind)).toEqual([
      "overdue",
      "debt_detected",
      "stale_import",
      "spending_anomaly",
      "settle_ready",
    ]);
  });

  it("filters out dismissed/snoozed keys", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: { ...healthyAttention, overdueCount: 1 },
      anomalies: [{ categoryId: "c1", name: "X", total: 300, avgTotal: 100 }],
      dismissedKeys: new Set(["overdue"]),
    });
    expect(actions.some((a) => a.kind === "overdue")).toBe(false);
    expect(actions.some((a) => a.kind === "spending_anomaly")).toBe(true);
  });

  it("dedupes by stable key, keeping the most urgent variant", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: {
        ...healthyAttention,
        plans: [
          {
            planId: "s1",
            planName: "Cel",
            kind: "save",
            eligibleCount: 0,
            monthlyNeeded: 1000,
            monthlyActual: 0,
            monthlyActualBasis: "none",
          },
        ],
      },
      // planning-queue would emit the same save_off_track:s1 key — must collapse to one.
      planningActions: [
        { id: "save-s1", href: "/plans/s1", label: "dup", tone: "default" },
      ],
    });
    expect(actions.filter((a) => a.dismissKey === "save_off_track:s1")).toHaveLength(1);
  });

  it("caps the list at the limit, dropping the least urgent", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: { ...healthyAttention, overdueCount: 1, daysSinceImport: null },
      anomalies: [
        { categoryId: "c1", name: "A", total: 300, avgTotal: 100 },
        { categoryId: "c2", name: "B", total: 300, avgTotal: 100 },
      ],
      settleReady: [
        { planId: "p1", planName: "P1", eligibleCount: 1 },
        { planId: "p2", planName: "P2", eligibleCount: 1 },
      ],
      limit: 3,
    });
    expect(actions).toHaveLength(3);
    expect(actions[0].kind).toBe("overdue");
    // settle_ready (priority 4) is least urgent here and must be cut.
    expect(actions.some((a) => a.kind === "settle_ready")).toBe(false);
  });
});
