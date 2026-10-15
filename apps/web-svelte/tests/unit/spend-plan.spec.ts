import { describe, expect, it } from "vitest";
import {
  normalizeSpendBudget,
  normalizeSpendItem,
  settleSpendItem,
  spendItemFacingStatus,
  spendItemNeedsLink,
  spendItemShowsDue,
  summarizeSpendBudget,
} from "$lib/plans/spend";

describe("spend plan budget", () => {
  it("keeps a dated apartment in the budget without treating the date as money due", () => {
    const summary = summarizeSpendBudget(12_000, [
      { amount: 3_600, status: "planned" },
      { amount: 1_000, status: "estimated" },
    ]);
    expect(summary.planned).toBe(4_600);
    expect(summary.toPay).toBe(0);
    expect(summary.orientational).toBe(3_600);
    expect(summary.estimates).toBe(1_000);
    expect(summary.projectedCost).toBe(4_600);
    expect(summary.budgetLeft).toBe(7_400);
    expect(summary.cushion).toBe(7_400);
  });

  it("counts only a confirmed payment as due", () => {
    const summary = summarizeSpendBudget(12_000, [
      { amount: 3_600, status: "confirmed" },
      { amount: 1_000, status: "planned" },
    ]);
    expect(summary.planned).toBe(4_600);
    expect(summary.toPay).toBe(3_600);
    expect(summary.orientational).toBe(1_000);
    expect(summary.budgetLeft).toBe(7_400);
  });

  it("folds linked spend into projected cost and cushion", () => {
    const summary = summarizeSpendBudget(
      12_000,
      [
        { amount: 4_000, status: "confirmed", settled: 1_000 },
        { amount: 500, status: "estimated" },
      ],
      { spent: 1_000 }
    );
    expect(summary.spent).toBe(1_000);
    expect(summary.toPay).toBe(3_000);
    expect(summary.estimates).toBe(500);
    expect(summary.projectedCost).toBe(4_500);
    expect(summary.cushion).toBe(7_500);
  });

  it("counts plan-level linked payments in cushion even when no items exist", () => {
    const summary = summarizeSpendBudget(20_000, [], { spent: 3_000 });
    expect(summary.planned).toBe(0);
    expect(summary.budgetLeft).toBe(20_000);
    expect(summary.projectedCost).toBe(3_000);
    expect(summary.cushion).toBe(17_000);
  });

  it("drops cancelled lines and reports a cap overrun", () => {
    const summary = summarizeSpendBudget(1_000, [
      { amount: 800, status: "confirmed" },
      { amount: 500, status: "estimated" },
      { amount: 9_000, status: "cancelled" },
    ]);
    expect(summary.planned).toBe(1_300);
    expect(summary.toPay).toBe(800);
    expect(summary.orientational).toBe(0);
    expect(summary.estimates).toBe(500);
    expect(summary.budgetLeft).toBe(-300);
  });

  it("requires a positive budget", () => {
    expect(normalizeSpendBudget(12_000)).toBe(12_000);
    expect(() => normalizeSpendBudget(0)).toThrow("budget_required");
    expect(() => normalizeSpendBudget(null)).toThrow("budget_required");
  });

  it("plans a dated line and estimates a line without a date", () => {
    expect(
      normalizeSpendItem({ label: " Apartament ", amount: 3600, dueDate: "2026-10-25" })
    ).toMatchObject({
      label: "Apartament",
      amount: 3600,
      due_date: "2026-10-25",
      status: "planned",
    });
    expect(normalizeSpendItem({ label: "Atrakcje", amount: 1000, dueDate: "" })).toMatchObject({
      status: "estimated",
      due_date: null,
    });
  });

  it("confirms a payment only when the user says it is due", () => {
    expect(
      normalizeSpendItem({
        label: "Apartament",
        amount: 4000,
        dueDate: "2026-10-25",
        confirmed: true,
      }).status
    ).toBe("confirmed");
    expect(() =>
      normalizeSpendItem({ label: "Apartament", amount: 4000, dueDate: "", confirmed: true })
    ).toThrow("item_confirm_needs_date");
  });

  it("subtracts a real deposit from a confirmed apartment", () => {
    const summary = summarizeSpendBudget(12_000, [
      { amount: 4_000, status: "confirmed", settled: 1_000 },
    ]);
    expect(summary.planned).toBe(4_000);
    expect(summary.toPay).toBe(3_000);
    expect(summary.budgetLeft).toBe(8_000);
    expect(summary.orientational).toBe(0);
  });

  it("keeps an orientational line visible after a partial payment", () => {
    const summary = summarizeSpendBudget(12_000, [
      { amount: 3_600, status: "planned", settled: 1_000 },
    ]);
    expect(summary.toPay).toBe(0);
    expect(summary.orientational).toBe(2_600);
  });

  it("drops a cancelled partly paid line from the budget without treating the deposit as free money", () => {
    const summary = summarizeSpendBudget(12_000, [
      { amount: 4_000, status: "cancelled", settled: 1_000 },
    ]);
    expect(summary.planned).toBe(0);
    expect(summary.toPay).toBe(0);
    expect(summary.orientational).toBe(0);
    expect(summary.budgetLeft).toBe(12_000);
  });

  it("caps the remainder at zero and reports an overpayment", () => {
    expect(
      settleSpendItem(4_000, [
        { amount: 2_500, counts: true },
        { amount: 2_000, counts: true },
        { amount: 100, counts: false },
      ])
    ).toEqual({ settled: 4_500, remaining: 0, overpaid: 500 });
  });

  it("names a dated estimate without calling it a confirmed payment", () => {
    expect(spendItemFacingStatus("estimated", { settled: 0, remaining: 500 })).toBe("estimated");
    expect(spendItemFacingStatus("planned", { settled: 0, remaining: 500 })).toBe("estimated");
    expect(spendItemFacingStatus("confirmed", { settled: 0, remaining: 500 })).toBe("confirmed");
    expect(spendItemFacingStatus("confirmed", { settled: 200, remaining: 300 })).toBe("partial");
    expect(spendItemFacingStatus("confirmed", { settled: 500, remaining: 0 })).toBe("paid");
    expect(spendItemFacingStatus("cancelled", { settled: 200, remaining: 0 })).toBe("cancelled");
  });

  it("allows linking a paid transaction to estimates without confirming first", () => {
    expect(spendItemNeedsLink("estimated", { settled: 0, remaining: 500 })).toBe(true);
    expect(spendItemNeedsLink("planned", { settled: 0, remaining: 500 })).toBe(true);
    expect(spendItemNeedsLink("confirmed", { settled: 0, remaining: 500 })).toBe(true);
    expect(spendItemNeedsLink("confirmed", { settled: 200, remaining: 300 })).toBe(true);
    expect(spendItemNeedsLink("confirmed", { settled: 500, remaining: 0 })).toBe(false);
    expect(spendItemNeedsLink("cancelled", { settled: 200, remaining: 300 })).toBe(false);
  });

  it("shows due copy only for confirmed obligations", () => {
    expect(spendItemShowsDue("estimated", { settled: 0, remaining: 500 })).toBe(false);
    expect(spendItemShowsDue("planned", { settled: 0, remaining: 500 })).toBe(false);
    expect(spendItemShowsDue("confirmed", { settled: 0, remaining: 500 })).toBe(true);
    expect(spendItemShowsDue("confirmed", { settled: 200, remaining: 300 })).toBe(true);
    expect(spendItemShowsDue("confirmed", { settled: 500, remaining: 0 })).toBe(false);
  });

  it("keeps a cancelled line from becoming a due payment", () => {
    expect(
      normalizeSpendItem({
        label: "Wynajem auta",
        amount: 1400,
        dueDate: "2026-10-26",
        confirmed: true,
        cancelled: true,
      }).status
    ).toBe("cancelled");
  });
});
