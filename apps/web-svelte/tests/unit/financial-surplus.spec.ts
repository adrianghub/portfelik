import { describe, expect, it } from "vitest";
import {
  computeMonthlySurplus,
  currentCalendarMonthBounds,
  sumDebtMonthlyPayments,
  sumSaveMonthlyNeeded,
} from "$lib/services/financial-surplus";
import type { PlanDebtTerms } from "$lib/types";

describe("computeMonthlySurplus", () => {
  it("subtracts debt payments and save pace from month cashflow", () => {
    const result = computeMonthlySurplus({
      totalIncome: 12000,
      totalExpenses: 8500,
      debtMonthlyPayments: 2370,
      saveMonthlyNeeded: 800,
    });
    expect(result.cashflowNet).toBe(3500);
    expect(result.surplus).toBe(330);
    expect(result.hasObligations).toBe(true);
  });

  it("allows negative surplus when obligations exceed cashflow", () => {
    const result = computeMonthlySurplus({
      totalIncome: 5000,
      totalExpenses: 4800,
      debtMonthlyPayments: 2370,
      saveMonthlyNeeded: 500,
    });
    expect(result.surplus).toBe(-2670);
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
  it("counts only active save plans", () => {
    const total = sumSaveMonthlyNeeded(
      [
        { kind: "save", end_date: "2026-12-01", monthlyNeeded: 800 },
        { kind: "save", end_date: "2025-01-01", monthlyNeeded: 500 },
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
