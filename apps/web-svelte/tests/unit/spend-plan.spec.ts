import { describe, expect, it } from "vitest";
import { normalizeSpendBudget, normalizeSpendItem, summarizeSpendBudget } from "$lib/plans/spend";

describe("spend plan budget", () => {
  it("keeps the Malta apartment as an unpaid commitment", () => {
    const summary = summarizeSpendBudget(12_000, [
      { amount: 3_600, status: "reserved" },
      { amount: 1_000, status: "estimated" },
    ]);
    expect(summary.planned).toBe(4_600);
    expect(summary.reserved).toBe(3_600);
    expect(summary.toPay).toBe(3_600);
    expect(summary.budgetLeft).toBe(7_400);
  });

  it("drops cancelled lines and reports a cap overrun", () => {
    const summary = summarizeSpendBudget(1_000, [
      { amount: 800, status: "reserved" },
      { amount: 500, status: "estimated" },
      { amount: 9_000, status: "cancelled" },
    ]);
    expect(summary.planned).toBe(1_300);
    expect(summary.toPay).toBe(800);
    expect(summary.budgetLeft).toBe(-300);
  });

  it("requires a positive budget", () => {
    expect(normalizeSpendBudget(12_000)).toBe(12_000);
    expect(() => normalizeSpendBudget(0)).toThrow("budget_required");
    expect(() => normalizeSpendBudget(null)).toThrow("budget_required");
  });

  it("reserves a dated line and estimates a line without a date", () => {
    expect(
      normalizeSpendItem({ label: " Apartament ", amount: 3600, dueDate: "2026-10-25" })
    ).toMatchObject({
      label: "Apartament",
      amount: 3600,
      due_date: "2026-10-25",
      status: "reserved",
    });
    expect(normalizeSpendItem({ label: "Atrakcje", amount: 1000, dueDate: "" })).toMatchObject({
      status: "estimated",
      due_date: null,
    });
  });

  it("keeps a cancelled line from becoming a due payment", () => {
    expect(
      normalizeSpendItem({
        label: "Wynajem auta",
        amount: 1400,
        dueDate: "2026-10-26",
        cancelled: true,
      }).status
    ).toBe("cancelled");
  });
});
