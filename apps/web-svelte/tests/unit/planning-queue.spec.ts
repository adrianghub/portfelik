import { describe, expect, it } from "vitest";
import { buildPlanningQueueActions } from "$lib/services/planning-queue";
import { computeMonthlySurplus } from "$lib/services/financial-surplus";
import type { PlanDebtTerms, PlanSummary } from "$lib/types";

function summary(overrides: Partial<PlanSummary> = {}): PlanSummary {
  return {
    id: "p1",
    name: "Plan",
    kind: "spend",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    budget_amount: 5000,
    target_amount: null,
    category_id: null,
    group_id: null,
    user_id: "u1",
    status: "active",
    refinanced_from_plan_id: null,
    replaced_by_plan_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    spentAmount: 0,
    incomeAmount: 0,
    savedAmount: 0,
    linkedCount: 0,
    eligibleCount: 0,
    monthlyNeeded: null,
    monthlyActual: null,
    bucket: "active",
    ...overrides,
  };
}

describe("buildPlanningQueueActions", () => {
  it("prioritizes settle proposals when eligible transactions exist", () => {
    const actions = buildPlanningQueueActions({
      summaries: [summary({ id: "spend-1", name: "Wakacje", eligibleCount: 6 })],
      monthlySurplus: computeMonthlySurplus({
        totalIncome: 10_000,
        totalExpenses: 4000,
        debtMonthlyPayments: 0,
        saveMonthlyNeeded: 0,
      }),
      debtTerms: {},
    });
    expect(actions.some((a) => a.id === "settle")).toBe(true);
    expect(actions[0]?.href).toBe("/plans/spend-1/settle");
  });

  it("includes off-track save goal chip", () => {
    const actions = buildPlanningQueueActions({
      summaries: [
        summary({
          id: "save-1",
          name: "Edukacja",
          kind: "save",
          monthlyNeeded: 50_000,
          monthlyActual: 1000,
        }),
      ],
      monthlySurplus: computeMonthlySurplus({
        totalIncome: 8000,
        totalExpenses: 3000,
        debtMonthlyPayments: 0,
        saveMonthlyNeeded: 50_000,
      }),
      debtTerms: {},
    });
    expect(actions.some((a) => a.id === "save-save-1")).toBe(true);
  });

  it("ignores upcoming save goals for off-track chip", () => {
    const actions = buildPlanningQueueActions({
      summaries: [
        summary({
          id: "save-upcoming",
          name: "Przyszły cel",
          kind: "save",
          bucket: "upcoming",
          start_date: "2026-12-01",
          end_date: "2027-12-01",
          monthlyNeeded: 50_000,
          monthlyActual: 0,
        }),
      ],
      monthlySurplus: computeMonthlySurplus({
        totalIncome: 8000,
        totalExpenses: 3000,
        debtMonthlyPayments: 0,
        saveMonthlyNeeded: 0,
      }),
      debtTerms: {},
    });
    expect(actions.some((a) => a.id === "save-save-upcoming")).toBe(false);
  });

  it("debt chip uses active loans only", () => {
    const debtTerms: Record<string, PlanDebtTerms> = {
      "debt-active": {
        plan_id: "debt-active",
        original_amount: 100_000,
        current_balance: 90_000,
        annual_rate: 5,
        monthly_payment: 1200,
        anchor_balance: 90_000,
        balance_anchor_date: "2026-01-01",
        first_payment_date: null,
        first_payment_amount: null,
        created_at: "",
        updated_at: "",
      },
      "debt-future": {
        plan_id: "debt-future",
        original_amount: 200_000,
        current_balance: 200_000,
        annual_rate: 5,
        monthly_payment: 2242,
        anchor_balance: 200_000,
        balance_anchor_date: "2026-01-01",
        first_payment_date: null,
        first_payment_amount: null,
        created_at: "",
        updated_at: "",
      },
    };
    const actions = buildPlanningQueueActions({
      summaries: [
        summary({
          id: "debt-active",
          kind: "debt",
          bucket: "active",
          start_date: "2025-01-01",
          end_date: "2030-01-01",
        }),
        summary({
          id: "debt-future",
          kind: "debt",
          bucket: "upcoming",
          start_date: "2026-09-01",
          end_date: "2046-09-01",
        }),
      ],
      monthlySurplus: computeMonthlySurplus({
        totalIncome: 5000,
        totalExpenses: 4000,
        debtMonthlyPayments: 1200,
        saveMonthlyNeeded: 0,
      }),
      debtTerms,
    });
    const debtAction = actions.find((a) => a.id.startsWith("debt-"));
    expect(debtAction).toBeDefined();
    expect(debtAction?.label).not.toContain("2242");
    expect(debtAction?.label).not.toContain("3 442");
  });

  it("caps at three actions", () => {
    const debtTerms: Record<string, PlanDebtTerms> = {
      "debt-1": {
        plan_id: "debt-1",
        original_amount: 100_000,
        current_balance: 90_000,
        annual_rate: 5,
        monthly_payment: 1200,
        anchor_balance: 200_000,
        balance_anchor_date: "2026-01-01",
        first_payment_date: null,
        first_payment_amount: null,
        created_at: "",
        updated_at: "",
      },
    };
    const actions = buildPlanningQueueActions({
      summaries: [
        summary({ id: "spend-1", eligibleCount: 3 }),
        summary({
          id: "save-1",
          kind: "save",
          monthlyNeeded: 10_000,
          monthlyActual: 0,
        }),
        summary({ id: "debt-1", kind: "debt" }),
      ],
      monthlySurplus: computeMonthlySurplus({
        totalIncome: 0,
        totalExpenses: 0,
        debtMonthlyPayments: 1200,
        saveMonthlyNeeded: 10_000,
      }),
      debtTerms,
    });
    expect(actions.length).toBeLessThanOrEqual(3);
  });
});

describe("buildPlanningQueueActions save-pace basis", () => {
  const surplus = {
    totalIncome: 8000,
    totalExpenses: 5000,
    cashflowNet: 3000,
    debtMonthlyPayments: 0,
    saveMonthlyNeeded: 1000,
    surplus: 3000,
    availableForGoals: 3000,
    saveContributionsThisMonth: 0,
    unmetSaveNeed: 1000,
    afterSaveGoals: 2000,
    unreflectedDebt: 0,
    debtAssumptionVerified: false,
    hasSaveGoals: true,
    hasDebtPlans: false,
  };

  it("still warns when pace meets need only via historical average", () => {
    const actions = buildPlanningQueueActions({
      summaries: [
        summary({
          id: "save-1",
          kind: "save",
          target_amount: 60_000,
          monthlyNeeded: 1000,
          monthlyActual: 1500,
          monthlyActualBasis: "historical-average",
        }),
      ],
      monthlySurplus: surplus,
      debtTerms: {},
    });
    expect(actions.some((a) => a.id === "save-save-1")).toBe(true);
  });

  it("asks only for the remaining amount after a partial deposit this month", () => {
    const actions = buildPlanningQueueActions({
      summaries: [
        summary({
          id: "save-1",
          name: "Wakacje",
          kind: "save",
          target_amount: 60_000,
          monthlyNeeded: 1000,
          monthlyActual: 400,
          monthlyActualBasis: "current-month",
        }),
      ],
      monthlySurplus: surplus,
      debtTerms: {},
    });
    const chip = actions.find((a) => a.id === "save-save-1");
    expect(chip).toBeDefined();
    expect(chip?.label).toContain("jeszcze");
    expect(chip?.label).toContain("600");
  });

  it("does not warn when current-month deposits meet the need", () => {
    const actions = buildPlanningQueueActions({
      summaries: [
        summary({
          id: "save-1",
          kind: "save",
          target_amount: 60_000,
          monthlyNeeded: 1000,
          monthlyActual: 1500,
          monthlyActualBasis: "current-month",
        }),
      ],
      monthlySurplus: surplus,
      debtTerms: {},
    });
    expect(actions.some((a) => a.id === "save-save-1")).toBe(false);
  });
});
