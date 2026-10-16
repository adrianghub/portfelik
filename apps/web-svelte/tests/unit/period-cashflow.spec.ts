import { describe, expect, it } from "vitest";
import { computePeriodCashflow } from "$lib/services/period-cashflow";

function row(
  amount: number,
  type: "income" | "expense",
  status: string
) {
  return { amount, type, status, currency: "PLN" as const };
}

describe("computePeriodCashflow", () => {
  it("splits realized and open legs without double-counting", () => {
    const breakdown = computePeriodCashflow([
      row(1000, "income", "paid"),
      row(200, "income", "upcoming"),
      row(400, "expense", "paid"),
      row(50, "expense", "overdue"),
      row(999, "expense", "draft"),
    ]);
    expect(breakdown.income).toEqual({ realized: 1000, open: 200, total: 1200 });
    expect(breakdown.expense).toEqual({ realized: 400, open: 50, total: 450 });
    expect(breakdown.realizedNet).toBe(600);
    expect(breakdown.projectedNet).toBe(750);
  });

  it("ignores unsupported currencies", () => {
    const breakdown = computePeriodCashflow([
      { amount: 10, type: "expense", status: "paid", currency: "EUR" },
      row(5, "expense", "paid"),
    ]);
    expect(breakdown.expense.realized).toBe(5);
  });

  it("keeps grosze exact across legs", () => {
    const breakdown = computePeriodCashflow([
      row(0.1, "expense", "paid"),
      row(0.2, "expense", "upcoming"),
    ]);
    expect(breakdown.expense.total).toBe(0.3);
  });
});
