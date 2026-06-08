import { describe, expect, it } from "vitest";
import {
  accrueBalanceWithDailyInterest,
  approximateDailyInterest,
  compareLumpSumOverpay,
  compareLumpSumVsInvest,
  compareOverpay,
  compareOverpayVsInvest,
  daysBetween,
  isPaymentBelowMonthlyInterest,
  monthlyInterestAmount,
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
      cmp.overpayInterestSaved +
        cmp.postPayoffInvestNetGain +
        cmp.freedPaymentInvestNetGain,
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
    expect(
      isPaymentBelowMonthlyInterest(MORTGAGE.currentBalance, MORTGAGE.annualRate, 1000)
    ).toBe(true);
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
