import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import {
  approximateDailyInterest,
  daysBetween,
  isPaymentBelowMonthlyInterest,
  monthlyInterestAmount,
} from "$lib/services/debt-amortization";

const MORTGAGE = {
  currentBalance: 206_000,
  annualRate: 7.18,
  monthlyPayment: 2370,
};

describe("debt-amortization helpers", () => {
  it("approximate daily interest for display", () => {
    const daily = approximateDailyInterest(206_000, 7.18);
    expect(daily).toBeGreaterThan(35);
    expect(daily).toBeLessThan(45);
  });

  it("detects payment below monthly interest", () => {
    const interest = monthlyInterestAmount(MORTGAGE.currentBalance, MORTGAGE.annualRate);
    expect(interest).toBeGreaterThan(1200);
    expect(isPaymentBelowMonthlyInterest(MORTGAGE.currentBalance, MORTGAGE.annualRate, 1000)).toBe(
      true
    );
    expect(
      isPaymentBelowMonthlyInterest(
        MORTGAGE.currentBalance,
        MORTGAGE.annualRate,
        MORTGAGE.monthlyPayment
      )
    ).toBe(false);
  });

  it("counts whole days between ISO dates", () => {
    expect(daysBetween("2026-06-01", "2026-06-01")).toBe(0);
    expect(daysBetween("2026-06-01", "2026-06-08")).toBe(7);
  });
});
