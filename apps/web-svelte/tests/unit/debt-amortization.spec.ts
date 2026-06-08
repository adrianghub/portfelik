import { describe, expect, it } from "vitest";
import {
  approximateDailyInterest,
  compareLumpSumOverpay,
  compareOverpay,
  compareOverpayVsInvest,
  simulateAmortization,
} from "$lib/services/debt-amortization";

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
    expect(cmp.recommendation).toBe("overpay");
  });

  it("overpay vs invest comparison picks invest when return exceeds loan rate", () => {
    const cmp = compareOverpayVsInvest(MORTGAGE, 500, 10);
    expect(cmp.recommendation).toBe("invest");
  });

  it("computes break-even gross return after Belka", () => {
    const cmp = compareOverpayVsInvest(MORTGAGE, 500, 7);
    expect(cmp.breakEvenGrossReturn).toBeGreaterThan(8.8);
    expect(cmp.breakEvenGrossReturn).toBeLessThan(9);
    expect(cmp.effectiveInvestReturnPct).toBeCloseTo(5.67, 1);
  });

  it("invest horizon uses baseline payoff months when user does not overpay", () => {
    const overpay = compareOverpay(MORTGAGE, 500);
    const cmp = compareOverpayVsInvest(MORTGAGE, 500, 10);
    const monthlyRate = 10 / 100 / 12;
    const expectedGain =
      500 * ((Math.pow(1 + monthlyRate, overpay.baseline.payoffMonths) - 1) / monthlyRate);
    expect(cmp.investNominalGain).toBeCloseTo(expectedGain, 0);
  });
});
