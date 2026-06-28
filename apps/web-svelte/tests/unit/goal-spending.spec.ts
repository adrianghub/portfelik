import { describe, expect, it } from "vitest";
import { computeGoalSpendingSplit } from "$lib/services/goal-spending";
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
  it("splits cele expenses and save-linked income from other expenses", () => {
    const saveLinked = new Set(["inc-1"]);
    const split = computeGoalSpendingSplit(
      [
        tx({ id: "inc-1", type: "income", amount: 500, category_id: "inc-cat", category_type: "income" }),
        tx({ id: "e-1", type: "expense", amount: 200, category_id: "cele", category_name: "Cele" }),
        tx({ id: "e-2", type: "expense", amount: 80, category_id: "food" }),
      ],
      saveLinked,
      "cele"
    );
    expect(split.goalLinkedIncome).toBe(500);
    expect(split.celeExpenses).toBe(200);
    expect(split.otherExpenses).toBe(80);
    expect(split.hasGoalActivity).toBe(true);
  });
});
