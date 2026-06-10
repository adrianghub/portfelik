import { describe, expect, it } from "vitest";
import {
  computeMonthlySurplus,
  currentCalendarMonthBounds,
  gateObservedDebtCoverage,
  sumDebtMonthlyPayments,
  sumSaveMonthlyNeeded,
} from "$lib/services/financial-surplus";
import type { Plan, PlanDebtTerms } from "$lib/types";

const debtTerms = (planId: string, payment: number): PlanDebtTerms => ({
  plan_id: planId,
  original_amount: 200_000,
  current_balance: 200_000,
  annual_rate: 7,
  monthly_payment: payment,
  payment_day: null,
  anchor_transaction_id: null,
  created_at: "",
  updated_at: "",
});

const debtPlan = (id: string, start: string, end: string): Pick<Plan, "id" | "kind" | "start_date" | "end_date"> => ({
  id,
  kind: "debt",
  start_date: start,
  end_date: end,
});

describe("computeMonthlySurplus", () => {
  it("uses month cashflow as the headline surplus", () => {
    const result = computeMonthlySurplus({
      totalIncome: 12000,
      totalExpenses: 8500,
      debtMonthlyPayments: 2370,
      saveMonthlyNeeded: 800,
    });
    expect(result.cashflowNet).toBe(3500);
    expect(result.surplus).toBe(3500);
    expect(result.afterSaveGoals).toBe(2700);
    expect(result.hasSaveGoals).toBe(true);
    expect(result.hasDebtPlans).toBe(true);
  });

  it("does not subtract debt payments again from cashflow", () => {
    const result = computeMonthlySurplus({
      totalIncome: 5000,
      totalExpenses: 4800,
      debtMonthlyPayments: 2370,
      saveMonthlyNeeded: 500,
    });
    expect(result.surplus).toBe(200);
    expect(result.afterSaveGoals).toBe(-300);
  });

  it("flags the debt assumption unverified when coverage is not supplied", () => {
    const result = computeMonthlySurplus({
      totalIncome: 5000,
      totalExpenses: 4800,
      debtMonthlyPayments: 2370,
      saveMonthlyNeeded: 0,
    });
    expect(result.debtAssumptionVerified).toBe(false);
    expect(result.unreflectedDebt).toBe(0);
    // unchanged math: full payment assumed already inside expenses
    expect(result.afterSaveGoals).toBe(200);
  });

  it("subtracts the unreflected debt shortfall when coverage is partial", () => {
    const result = computeMonthlySurplus({
      totalIncome: 5000,
      totalExpenses: 4800,
      debtMonthlyPayments: 2370,
      debtPaymentsInExpenses: 1370,
      saveMonthlyNeeded: 0,
    });
    expect(result.debtAssumptionVerified).toBe(true);
    expect(result.unreflectedDebt).toBe(1000);
    // cashflow 200 − save 0 − unreflected 1000
    expect(result.afterSaveGoals).toBe(-800);
  });

  it("does not double-count when debt payments are fully reflected in expenses", () => {
    const result = computeMonthlySurplus({
      totalIncome: 12000,
      totalExpenses: 8500,
      debtMonthlyPayments: 2370,
      debtPaymentsInExpenses: 2370,
      saveMonthlyNeeded: 800,
    });
    expect(result.debtAssumptionVerified).toBe(true);
    expect(result.unreflectedDebt).toBe(0);
    expect(result.afterSaveGoals).toBe(2700);
  });

  it("keeps the estimate (no double-count) when loaded coverage is zero and gets gated", () => {
    // Imported-but-unlinked rata: progress loaded with 0 linked payments must be
    // gated to undefined so the full rata is not subtracted a second time.
    const result = computeMonthlySurplus({
      totalIncome: 5000,
      totalExpenses: 4800,
      debtMonthlyPayments: 2370,
      debtPaymentsInExpenses: gateObservedDebtCoverage(0),
      saveMonthlyNeeded: 0,
    });
    expect(result.debtAssumptionVerified).toBe(false);
    expect(result.unreflectedDebt).toBe(0);
    expect(result.afterSaveGoals).toBe(200);
  });

  it("clamps unreflected debt at zero when expenses over-report the payment", () => {
    const result = computeMonthlySurplus({
      totalIncome: 5000,
      totalExpenses: 4800,
      debtMonthlyPayments: 2370,
      debtPaymentsInExpenses: 3000,
      saveMonthlyNeeded: 0,
    });
    expect(result.unreflectedDebt).toBe(0);
    expect(result.afterSaveGoals).toBe(200);
  });
});

describe("gateObservedDebtCoverage", () => {
  it("returns undefined for zero coverage (unknown, keep estimate)", () => {
    expect(gateObservedDebtCoverage(0)).toBeUndefined();
  });

  it("passes positive coverage through", () => {
    expect(gateObservedDebtCoverage(1370)).toBe(1370);
  });
});

describe("sumDebtMonthlyPayments", () => {
  it("sums monthly_payment for active debt plans only", () => {
    const plans = [
      debtPlan("active", "2025-01-01", "2030-01-01"),
      debtPlan("upcoming", "2026-09-01", "2046-09-01"),
      debtPlan("finished", "2020-01-01", "2025-12-31"),
    ];
    const terms = {
      active: debtTerms("active", 2370),
      upcoming: debtTerms("upcoming", 2242),
      finished: debtTerms("finished", 900),
    };
    expect(sumDebtMonthlyPayments(plans, terms, "2026-06-08")).toBe(2370);
  });
});

describe("sumSaveMonthlyNeeded", () => {
  it("counts only active save plans within date range", () => {
    const total = sumSaveMonthlyNeeded(
      [
        { kind: "save", start_date: "2026-01-01", end_date: "2026-12-01", monthlyNeeded: 800 },
        { kind: "save", start_date: "2026-01-01", end_date: "2025-01-01", monthlyNeeded: 500 },
        { kind: "save", start_date: "2026-12-01", end_date: "2027-12-01", monthlyNeeded: 400 },
        { kind: "spend", end_date: "2026-12-01", monthlyNeeded: 200 },
      ],
      "2026-06-07"
    );
    expect(total).toBe(800);
  });
});

describe("currentCalendarMonthBounds", () => {
  it("returns inclusive ISO bounds for the month", () => {
    expect(currentCalendarMonthBounds(new Date("2026-06-15"))).toEqual({
      start: "2026-06-01",
      end: "2026-06-30",
    });
  });
});
