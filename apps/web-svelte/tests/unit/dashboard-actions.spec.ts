import { describe, expect, it } from "vitest";
import {
  buildDashboardActions,
  type AttentionInput,
  type BuildDashboardActionsInput,
} from "$lib/services/dashboard-actions";

const plan = (
  o: Partial<AttentionInput["plans"][number]> = {}
): AttentionInput["plans"][number] => ({
  planId: "p1",
  planName: "Plan",
  kind: "save",
  eligibleCount: 0,
  monthlyNeeded: null,
  monthlyActual: null,
  monthlyActualBasis: "none",
  ...o,
});

const healthyAttention: AttentionInput = {
  overdueCount: 0,
  plans: [],
};

const base: BuildDashboardActionsInput = {
  attention: healthyAttention,
  anomalies: [],
  periodKey: "2026-06-22",
  periodEnd: "2026-06-28",
};

describe("buildDashboardActions", () => {
  it("returns nothing when every signal is healthy", () => {
    expect(buildDashboardActions(base)).toEqual([]);
  });

  it("folds overdue with period-scoped dismiss key", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: { ...healthyAttention, overdueCount: 2 },
    });
    const overdue = actions.find((a) => a.kind === "overdue");
    expect(overdue?.tone).toBe("warn");
    expect(overdue?.dismissKey).toBe("overdue:2026-06-22");
    expect(overdue?.href).toBe("/transactions?status=overdue");
  });

  it("surfaces save off-track from current-month pace", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: {
        plans: [
          plan({
            planId: "s",
            kind: "save",
            monthlyNeeded: 1000,
            monthlyActual: 0,
            monthlyActualBasis: "none",
          }),
        ],
        overdueCount: 0,
      },
    });
    expect(actions.some((a) => a.dismissKey === "save_off_track:s")).toBe(true);
  });

  it("does not flag on-pace save plans", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: {
        plans: [
          plan({
            planId: "s",
            kind: "save",
            monthlyNeeded: 1000,
            monthlyActual: 1000,
            monthlyActualBasis: "current-month",
          }),
        ],
        overdueCount: 0,
      },
    });
    expect(actions.some((a) => a.kind === "save_off_track")).toBe(false);
  });

  it("surfaces spending anomalies with a period-scoped dismiss key and date range", () => {
    const actions = buildDashboardActions({
      ...base,
      anomalies: [{ categoryId: "c1", name: "Restauracje", total: 300, avgTotal: 100 }],
    });
    const anomaly = actions.find((a) => a.kind === "spending_anomaly");
    expect(anomaly?.dismissKey).toBe("spending_anomaly:c1:2026-06-22");
    expect(anomaly?.href).toBe(
      "/transactions?categoryId=c1&startDate=2026-06-22&endDate=2026-06-28"
    );
    expect(anomaly?.title).toContain("Restauracje");
    expect(anomaly?.detail).toBeTruthy();
    expect(anomaly?.tone).toBe("warn");
  });

  it("orders by urgency: overdue before anomaly before save off-track", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: {
        overdueCount: 1,
        plans: [
          plan({
            planId: "s1",
            kind: "save",
            monthlyNeeded: 500,
            monthlyActual: 0,
            monthlyActualBasis: "none",
          }),
        ],
      },
      anomalies: [{ categoryId: "c1", name: "X", total: 300, avgTotal: 100 }],
    });
    expect(actions.map((a) => a.kind)).toEqual([
      "overdue",
      "spending_anomaly",
      "save_off_track",
    ]);
  });

  it("filters out dismissed keys", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: { ...healthyAttention, overdueCount: 1 },
      anomalies: [{ categoryId: "c1", name: "X", total: 300, avgTotal: 100 }],
      dismissedKeys: new Set(["overdue:2026-06-22"]),
    });
    expect(actions.some((a) => a.kind === "overdue")).toBe(false);
    expect(actions.some((a) => a.kind === "spending_anomaly")).toBe(true);
  });

  it("caps the list at the limit", () => {
    const actions = buildDashboardActions({
      ...base,
      attention: {
        overdueCount: 1,
        plans: [
          plan({
            planId: "s1",
            kind: "save",
            monthlyNeeded: 500,
            monthlyActual: 0,
            monthlyActualBasis: "none",
          }),
        ],
      },
      anomalies: [
        { categoryId: "c1", name: "A", total: 300, avgTotal: 100 },
        { categoryId: "c2", name: "B", total: 300, avgTotal: 100 },
      ],
      limit: 2,
    });
    expect(actions).toHaveLength(2);
    expect(actions[0].kind).toBe("overdue");
  });
});
