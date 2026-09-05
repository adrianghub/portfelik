import { describe, expect, it } from "vitest";
import {
  buildDashboardActions,
  type AttentionPlan,
  type BuildDashboardActionsInput,
} from "$lib/services/dashboard-actions";
import { formatCurrency } from "$lib/utils";

const plan = (overrides: Partial<AttentionPlan> = {}): AttentionPlan => ({
  planId: "p1",
  planName: "Poduszka",
  kind: "save",
  groupId: null,
  eligibleCount: 0,
  monthlyNeeded: null,
  monthlyActual: null,
  monthlyActualBasis: "none",
  ...overrides,
});

const base: BuildDashboardActionsInput = {
  overdue: null,
  plans: [],
  groupFilter: "own",
};

describe("buildDashboardActions", () => {
  it("returns no action when there is nothing concrete to resolve", () => {
    expect(buildDashboardActions(base)).toEqual([]);
  });

  it("describes overdue scale and deep-links to the exact scope and date range", () => {
    const [action] = buildDashboardActions({
      ...base,
      groupFilter: "group-1",
      overdue: {
        count: 2,
        total: 1250,
        oldestDays: 18,
        startDate: "2026-06-01",
        endDate: "2026-08-31",
      },
    });

    expect(action.kind).toBe("overdue");
    expect(action.title).toContain("2");
    expect(action.title).toContain(formatCurrency(1250));
    expect(action.detail).toContain("18");
    expect(action.href).toBe(
      "/transactions?startDate=2026-06-01&endDate=2026-08-31&group=group-1&status=overdue"
    );
    expect(action).not.toHaveProperty("dismissKey");
  });

  it("keeps an overdue action even when its total is zero", () => {
    const actions = buildDashboardActions({
      ...base,
      overdue: {
        count: 1,
        total: 0,
        oldestDays: 1,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      },
    });

    expect(actions.map((action) => action.kind)).toEqual(["overdue"]);
  });

  it("shows the largest monthly goal shortfall with the amount and scope", () => {
    const [action] = buildDashboardActions({
      ...base,
      plans: [
        plan({
          planId: "smaller",
          monthlyNeeded: 600,
          monthlyActual: 400,
          monthlyActualBasis: "current-month",
        }),
        plan({
          planId: "larger",
          monthlyNeeded: 1500,
          monthlyActual: 250,
          monthlyActualBasis: "current-month",
        }),
      ],
    });

    expect(action.kind).toBe("save_shortfall");
    expect(action.id).toBe("save-larger");
    expect(action.title).toContain(formatCurrency(1250));
    expect(action.href).toBe("/plans/larger?group=own");
  });

  it("does not surface on-pace or non-saving plans", () => {
    const actions = buildDashboardActions({
      ...base,
      plans: [
        plan({ monthlyNeeded: 1000, monthlyActual: 1000, monthlyActualBasis: "current-month" }),
        plan({ planId: "debt", kind: "debt", monthlyNeeded: 1000, monthlyActual: 0 }),
      ],
    });

    expect(actions).toEqual([]);
  });

  it.each([
    { scope: "own", expectedId: "private" },
    { scope: "all", expectedId: "other" },
    { scope: "g1", expectedId: "group" },
  ] as const)("filters goal candidates for the $scope scope", ({ scope, expectedId }) => {
    const actions = buildDashboardActions({
      ...base,
      groupFilter: scope,
      plans: [
        plan({ planId: "private", groupId: null, monthlyNeeded: 500, monthlyActual: 0 }),
        plan({ planId: "group", groupId: "g1", monthlyNeeded: 1000, monthlyActual: 0 }),
        plan({ planId: "other", groupId: "g2", monthlyNeeded: 1500, monthlyActual: 0 }),
      ],
    });

    expect(actions[0]?.id).toBe(`save-${expectedId}`);
    expect(actions[0]?.href).toContain(`group=${scope}`);
  });

  it("returns at most the two supported action types in urgency order", () => {
    const actions = buildDashboardActions({
      groupFilter: "own",
      overdue: {
        count: 1,
        total: 100,
        oldestDays: 3,
        startDate: "2026-08-01",
        endDate: "2026-08-31",
      },
      plans: [plan({ monthlyNeeded: 1000, monthlyActual: 0 })],
    });

    expect(actions.map((action) => action.kind)).toEqual(["overdue", "save_shortfall"]);
  });
});
