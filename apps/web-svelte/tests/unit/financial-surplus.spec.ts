import { describe, expect, it } from "vitest";
import {
  computeMonthlySurplus,
  currentCalendarMonthBounds,
  sumDebtMonthlyPayments,
  sumSaveMonthlyNeeded,
} from "$lib/services/financial-surplus";
import type { PlanDebtTerms } from "$lib/types";

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
});

describe("sumDebtMonthlyPayments", () => {
  it("sums monthly_payment across debt terms", () => {
    const terms: Record<string, PlanDebtTerms> = {
      a: {
        plan_id: "a",
        original_amount: 330000,
        current_balance: 206000,
        annual_rate: 7.18,
        monthly_payment: 2370,
        payment_day: null,
        anchor_transaction_id: null,
        created_at: "",
        updated_at: "",
      },
      b: {
        plan_id: "b",
        original_amount: 50000,
        current_balance: 40000,
        annual_rate: 5,
        monthly_payment: 900,
        payment_day: null,
        anchor_transaction_id: null,
        created_at: "",
        updated_at: "",
      },
    };
    expect(sumDebtMonthlyPayments(terms)).toBe(3270);
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
