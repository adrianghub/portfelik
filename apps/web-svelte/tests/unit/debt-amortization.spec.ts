import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import {
  accrueBalanceWithDailyInterest,
  approximateDailyInterest,
  compareLumpSumOverpay,
  compareLumpSumVsInvest,
  compareOverpay,
  compareOverpayVsInvest,
  daysBetween,
  debtDisplayBalance,
  isPaymentBelowMonthlyInterest,
  monthlyInterestAmount,
  simulateAmortization,
} from "$lib/services/debt-amortization";
import { estimateInterestPaidSince } from "$lib/services/debt-balance-replay";

const MORTGAGE = {
  currentBalance: 206_000,
  annualRate: 7.18,
  monthlyPayment: 2370,
};

describe("simulateAmortization", () => {
  it("payoff mortgage fixture within reasonable horizon", () => {
    const result = simulateAmortization(MORTGAGE);
    expect(result.payoffMonths).toBeGreaterThan(60);
    expect(result.payoffMonths).toBeLessThan(180);
    expect(result.totalInterest).toBeGreaterThan(50_000);
    expect(result.months.at(-1)?.balance).toBeLessThanOrEqual(0.01);
  });

  it("extra payment reduces interest and duration", () => {
    const cmp = compareOverpay(MORTGAGE, 500);
    expect(cmp.interestSaved).toBeGreaterThan(10_000);
    expect(cmp.monthsSaved).toBeGreaterThan(12);
  });

  it("lump sum reduces balance, daily interest, and total interest", () => {
    const cmp = compareLumpSumOverpay(MORTGAGE, 20_000);
    expect(cmp.interestSaved).toBeGreaterThan(0);
    expect(cmp.monthsSaved).toBeGreaterThan(0);
    expect(cmp.newDailyInterest).toBeLessThan(cmp.previousDailyInterest);
    expect(cmp.withLump.payoffMonths).toBeLessThan(cmp.baseline.payoffMonths);
  });

  it("approximate daily interest for display", () => {
    const daily = approximateDailyInterest(206_000, 7.18);
    expect(daily).toBeGreaterThan(35);
    expect(daily).toBeLessThan(45);
  });

  it("overpay vs invest comparison picks overpay at low invest return", () => {
    const cmp = compareOverpayVsInvest(MORTGAGE, 500, 3);
    expect(cmp.overpayInterestSaved).toBeGreaterThan(0);
    expect(cmp.overpayTotalBenefit).toBeGreaterThan(cmp.investTotalBenefit);
    expect(cmp.recommendation).toBe("overpay");
  });

  it("overpay vs invest comparison picks invest when return exceeds loan rate", () => {
    const cmp = compareOverpayVsInvest(MORTGAGE, 500, 10);
    expect(cmp.investTotalBenefit).toBeGreaterThan(cmp.overpayTotalBenefit);
    expect(cmp.recommendation).toBe("invest");
  });

  it("computes break-even gross return after Belka", () => {
    const cmp = compareOverpayVsInvest(MORTGAGE, 500, 7);
    expect(cmp.breakEvenGrossReturn).toBeGreaterThan(8.8);
    expect(cmp.breakEvenGrossReturn).toBeLessThan(9);
    expect(cmp.effectiveInvestReturnPct).toBeCloseTo(5.67, 1);
  });

  it("compares both paths to baseline loan maturity", () => {
    const overpay = compareOverpay(MORTGAGE, 500);
    const cmp = compareOverpayVsInvest(MORTGAGE, 500, 10);
    expect(cmp.baselineLoanMonths).toBe(overpay.baseline.payoffMonths);
    expect(cmp.overpayActiveMonths).toBe(overpay.withExtra.payoffMonths);
    expect(cmp.investHorizonMonths).toBe(overpay.baseline.payoffMonths);
    expect(cmp.overpayTotalBenefit).toBeCloseTo(
      cmp.overpayInterestSaved + cmp.postPayoffInvestNetGain + cmp.freedPaymentInvestNetGain,
      0
    );
  });

  it("includes freed minimum payment invested after early payoff", () => {
    const cmp = compareOverpayVsInvest(MORTGAGE, 500, 7);
    if (cmp.postPayoffInvestMonths > 0) {
      expect(cmp.freedPaymentInvestNetGain).toBeGreaterThan(0);
    }
  });

  it("invest net gain is profit above contributions after Belka, not taxed future value", () => {
    const cmp = compareOverpayVsInvest(MORTGAGE, 500, 7);
    expect(cmp.investNetGain).toBeLessThan(cmp.investFutureValue);
    expect(cmp.investNominalGain).toBeCloseTo(
      cmp.investFutureValue - cmp.investTotalContributed,
      0
    );
    expect(cmp.investNetGain).toBeCloseTo(cmp.investNominalGain * 0.81, 0);
    expect(cmp.investTotalBenefit).toBe(cmp.investNetGain);
  });

  it("lump sum vs invest compares one-time overpay to lump investment", () => {
    const cmp = compareLumpSumVsInvest(MORTGAGE, 20_000, 7);
    expect(cmp.interestSaved).toBeGreaterThan(0);
    expect(cmp.investNetGain).toBeGreaterThan(0);
    expect(cmp.overpayTotalBenefit).toBeGreaterThan(cmp.interestSaved);
    expect(cmp.breakEvenGrossReturn).toBeGreaterThan(8.8);
    expect(["overpay", "invest", "tie"]).toContain(cmp.recommendation);
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

  it("accrues daily compound interest from anchor date", () => {
    const base = 200_000;
    const afterWeek = accrueBalanceWithDailyInterest(base, 7.18, "2026-06-01", "2026-06-08");
    expect(afterWeek).toBeGreaterThan(base);
    expect(afterWeek).toBeLessThan(base + approximateDailyInterest(base, 7.18) * 8);
  });
});

describe("debtDisplayBalance", () => {
  const input = {
    currentBalance: 207_048.67,
    annualRate: 7.18,
    anchorDateIso: "2026-06-08",
    asOfDateIso: "2026-06-10",
  };

  it("accrues daily interest to the as-of date from the balance anchor", () => {
    const balance = debtDisplayBalance(input);
    expect(balance).toBeGreaterThan(input.currentBalance + 80);
    expect(balance).toBeLessThan(input.currentBalance + 85);
  });

  it("returns the stored balance when as-of equals the anchor", () => {
    expect(debtDisplayBalance({ ...input, asOfDateIso: "2026-06-08" })).toBe(input.currentBalance);
  });
});

describe("estimateInterestPaidSince", () => {
  const anchored = {
    originalAmount: 330_000,
    annualRate: 7.18,
    anchorBalance: 207_048.67,
    balanceAnchorDate: "2026-06-08",
    currentBalance: 207_048.67,
    linkedExpenses: [] as { amount: number; date?: string }[],
  };
  const start = "2025-04-30";

  it("freezes the pre-anchor segment and accrues flat after the anchor", () => {
    const interest = estimateInterestPaidSince(anchored, start, "2026-06-10");
    // avg(330000, 207048.67) × 7.18%/365 × 404d ≈ 21.3k + 2 days of ~40 zł
    expect(interest).toBeGreaterThan(20_000);
    expect(interest).toBeLessThan(23_000);
  });

  it("never decreases when a payment is linked (monotonic)", () => {
    const before = estimateInterestPaidSince(anchored, start, "2026-06-10");
    const after = estimateInterestPaidSince(
      {
        ...anchored,
        currentBalance: 204_800.15,
        linkedExpenses: [{ amount: 2370.26, date: "2026-06-10" }],
      },
      start,
      "2026-06-10"
    );
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("keeps growing day over day after a payment", () => {
    const input = {
      ...anchored,
      currentBalance: 204_800.15,
      linkedExpenses: [{ amount: 2370.26, date: "2026-06-10" }],
    };
    const day1 = estimateInterestPaidSince(input, start, "2026-06-10");
    const day2 = estimateInterestPaidSince(input, start, "2026-06-11");
    expect(day2).toBeGreaterThan(day1);
  });

  it("falls back to average-balance estimate without anchor or payments", () => {
    const interest = estimateInterestPaidSince(
      {
        originalAmount: 330_000,
        annualRate: 7.18,
        currentBalance: 207_130,
        linkedExpenses: [],
      },
      start,
      "2026-06-10"
    );
    const avg = (330_000 + 207_130) / 2;
    expect(interest).toBeCloseTo(avg * (7.18 / 100 / 365) * daysBetween(start, "2026-06-10"), 0);
  });

  it("uses monthly replay interest without anchor when payments exist", () => {
    const interest = estimateInterestPaidSince(
      {
        originalAmount: 10_000,
        annualRate: 12,
        currentBalance: 9_000,
        linkedExpenses: [{ amount: 600, date: "2026-05-10" }, { amount: 600, date: "2026-06-10" }],
      },
      "2026-04-30",
      "2026-06-10"
    );
    // two monthly periods at 1%/mo on ~10k → ≈ 195 zł
    expect(interest).toBeGreaterThan(150);
    expect(interest).toBeLessThan(250);
  });

  it("returns 0 before the start date or at zero rate", () => {
    expect(estimateInterestPaidSince(anchored, "2026-06-10", "2026-06-10")).toBe(0);
    expect(
      estimateInterestPaidSince({ ...anchored, annualRate: 0 }, "2025-04-30", "2026-06-10")
    ).toBe(0);
  });
});
