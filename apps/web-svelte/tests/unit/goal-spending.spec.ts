import { describe, expect, it } from "vitest";
import {
  computeGoalSpendingSplit,
  isAllocationExpense,
  partitionLedgerExpenses,
} from "$lib/services/goal-spending";
import type { TransactionWithCategory } from "$lib/types";

function tx(over: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "t-1",
    amount: 100,
    currency: "PLN",
    counterparty: null,
    description: "Row",
    date: "2026-06-01",
    type: "expense",
    status: "paid",
    category_id: "cat-1",
    user_id: "u1",
    is_recurring: false,
    recurring_day: null,
    recurrence_frequency: null,
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    recurring_occurrence_date: null,
    recurrence_end_date: null,
    group_id: null,
    created_at: "",
    updated_at: "",
    category_name: "Food",
    category_type: "expense",
    is_hold: false,
    ...over,
  };
}

describe("computeGoalSpendingSplit", () => {
  it("splits linked contributions and unlinked Cele expenses from other expenses", () => {
    const saveLinked = new Set(["goal-1"]);
    const split = computeGoalSpendingSplit(
      [
        tx({
          id: "goal-1",
          type: "expense",
          amount: 500,
          category_id: "cele",
          category_name: "Cele",
        }),
        tx({ id: "e-1", type: "expense", amount: 200, category_id: "cele", category_name: "Cele" }),
        tx({ id: "e-2", type: "expense", amount: 80, category_id: "food" }),
      ],
      saveLinked,
      "cele"
    );
    expect(split.goalContributions).toBe(500);
    expect(split.celeExpenses).toBe(200);
    expect(split.otherExpenses).toBe(80);
    expect(split.hasGoalActivity).toBe(true);
  });
});

describe("isAllocationExpense", () => {
  it("treats save-linked and Cele category expenses as allocation", () => {
    const linked = new Set(["a"]);
    expect(
      isAllocationExpense(
        { id: "a", type: "expense", category_id: "other" },
        linked,
        "cele"
      )
    ).toBe(true);
    expect(
      isAllocationExpense(
        { id: "b", type: "expense", category_id: "cele" },
        linked,
        "cele"
      )
    ).toBe(true);
    expect(
      isAllocationExpense(
        { id: "c", type: "expense", category_id: "food" },
        linked,
        "cele"
      )
    ).toBe(false);
  });
});

describe("partitionLedgerExpenses", () => {
  it("partitionLedgerExpenses splits consumption vs allocation", () => {
    const txs = [
      tx({ id: "1", category_id: "cele", amount: 100, category_name: "Cele" }),
      tx({ id: "2", category_id: "food", amount: 50, category_name: "Jedzenie" }),
    ];
    const { consumption, allocation } = partitionLedgerExpenses(txs, new Set(), "cele");
    expect(allocation.map((t) => t.id)).toEqual(["1"]);
    expect(consumption.map((t) => t.id)).toEqual(["2"]);
  });
});
