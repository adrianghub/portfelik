import { describe, expect, it } from "vitest";
import { computeSpendingInsight } from "$lib/services/spending-insight";
import type { TransactionWithCategory } from "$lib/types";

function tx(
  o: Partial<TransactionWithCategory> & { id: string; amount: number }
): TransactionWithCategory {
  return {
    currency: "PLN",
    counterparty: null,
    description: "tx",
    date: "2026-06-10",
    type: "expense" as const,
    status: "paid" as const,
    category_id: "c1",
    category_name: "Jedzenie",
    category_type: (o.type ?? "expense") as TransactionWithCategory["category_type"],
    is_hold: false,
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
    created_at: "2026-06-10T00:00:00Z",
    updated_at: "2026-06-10T00:00:00Z",
    ...o,
  } as TransactionWithCategory;
}

describe("computeSpendingInsight", () => {
  it("sums expenses per category and computes net", () => {
    const out = computeSpendingInsight({
      current: [
        tx({ id: "a", amount: 100, category_id: "food", category_name: "Jedzenie" }),
        tx({ id: "b", amount: 50, category_id: "food", category_name: "Jedzenie" }),
        tx({ id: "c", amount: 200, type: "income", category_id: "sal", category_name: "Wypłata" }),
      ],
      previous: [],
      rolling: [],
      periodsInRolling: 3,
      budgets: [],
    });
    expect(out.spent).toBe(150);
    expect(out.net).toBe(50); // 200 income - 150 expense
    const food = out.categories.find((c) => c.categoryId === "food")!;
    expect(food.total).toBe(150);
  });

  it("ignores non-ledger rows in spending totals, deltas, and biggest expenses", () => {
    const out = computeSpendingInsight({
      current: [
        tx({ id: "paid-food", amount: 100, category_id: "food", category_name: "Jedzenie" }),
        tx({
          id: "future-rent",
          amount: 900,
          status: "upcoming",
          category_id: "rent",
          category_name: "Czynsz",
        }),
        tx({
          id: "draft-income",
          amount: 1000,
          type: "income",
          status: "draft",
          category_id: "salary",
          category_name: "Wypłata",
        }),
      ],
      previous: [
        tx({
          id: "overdue-prev",
          amount: 80,
          status: "overdue",
          category_id: "food",
          category_name: "Jedzenie",
        }),
      ],
      rolling: [
        tx({
          id: "draft-roll",
          amount: 300,
          status: "draft",
          category_id: "food",
          category_name: "Jedzenie",
        }),
      ],
      periodsInRolling: 3,
      budgets: [],
    });

    expect(out.spent).toBe(100);
    expect(out.net).toBe(-100);
    expect(out.prevSpent).toBe(0);
    expect(out.categories.map((c) => c.categoryId)).toEqual(["food"]);
    expect(out.categories[0].prevTotal).toBe(0);
    expect(out.categories[0].avgTotal).toBe(0);
    expect(out.biggestExpenses.map((e) => e.id)).toEqual(["paid-food"]);
  });

  it("computes delta vs previous, null deltaPct when prevTotal is 0", () => {
    const out = computeSpendingInsight({
      current: [tx({ id: "a", amount: 140, category_id: "food" })],
      previous: [tx({ id: "p", amount: 100, category_id: "food" })],
      rolling: [],
      periodsInRolling: 3,
      budgets: [],
    });
    const food = out.categories.find((c) => c.categoryId === "food")!;
    expect(food.prevTotal).toBe(100);
    expect(food.deltaAbs).toBe(40);
    expect(food.deltaPct).toBe(40);

    const fresh = computeSpendingInsight({
      current: [tx({ id: "a", amount: 30, category_id: "new" })],
      previous: [],
      rolling: [],
      periodsInRolling: 3,
      budgets: [],
    });
    expect(fresh.categories[0].deltaPct).toBeNull();
  });

  it("flags anomaly when total >= 1.5x rolling average and the baseline is meaningful", () => {
    // rolling has 3 periods worth: 600 total over 3 periods => avg 200 (above the floor)
    const rolling = [
      tx({ id: "r1", amount: 200, category_id: "food", date: "2026-03-10" }),
      tx({ id: "r2", amount: 200, category_id: "food", date: "2026-04-10" }),
      tx({ id: "r3", amount: 200, category_id: "food", date: "2026-05-10" }),
    ];
    const hot = computeSpendingInsight({
      current: [tx({ id: "a", amount: 300, category_id: "food" })],
      previous: [],
      rolling,
      periodsInRolling: 3,
      budgets: [],
    });
    expect(hot.categories[0].avgTotal).toBe(200);
    expect(hot.categories[0].anomaly).toBe(true);

    const calm = computeSpendingInsight({
      current: [tx({ id: "a", amount: 250, category_id: "food" })],
      previous: [],
      rolling,
      periodsInRolling: 3,
      budgets: [],
    });
    expect(calm.categories[0].anomaly).toBe(false); // 250 < 1.5 * 200
  });

  it("suppresses anomaly when the rolling baseline is below the noise floor", () => {
    // avg 100/period is too small a base — a single spend trips 1.5x trivially,
    // so we must NOT flag it (avoids week-view false positives off near-empty history).
    const rolling = [
      tx({ id: "r1", amount: 100, category_id: "food", date: "2026-03-10" }),
      tx({ id: "r2", amount: 100, category_id: "food", date: "2026-04-10" }),
      tx({ id: "r3", amount: 100, category_id: "food", date: "2026-05-10" }),
    ];
    const out = computeSpendingInsight({
      current: [tx({ id: "a", amount: 300, category_id: "food" })], // 3x the avg
      previous: [],
      rolling,
      periodsInRolling: 3,
      budgets: [],
    });
    expect(out.categories[0].avgTotal).toBe(100);
    expect(out.categories[0].anomaly).toBe(false);
  });

  it("computes budget usage only when a budget exists", () => {
    const out = computeSpendingInsight({
      current: [tx({ id: "a", amount: 104, category_id: "food" })],
      previous: [],
      rolling: [],
      periodsInRolling: 3,
      budgets: [{ categoryId: "food", budgetAmount: 100 }],
    });
    const food = out.categories.find((c) => c.categoryId === "food")!;
    expect(food.budgetAmount).toBe(100);
    expect(food.budgetUsedPct).toBe(104);

    const noBudget = computeSpendingInsight({
      current: [tx({ id: "a", amount: 50, category_id: "x" })],
      previous: [],
      rolling: [],
      periodsInRolling: 3,
      budgets: [],
    });
    expect(noBudget.categories[0].budgetAmount).toBeNull();
    expect(noBudget.categories[0].budgetUsedPct).toBeNull();
  });

  it("ranks biggest movers by |deltaAbs| and biggest expenses by amount", () => {
    const out = computeSpendingInsight({
      current: [
        tx({ id: "a", amount: 300, category_id: "food", category_name: "Jedzenie" }),
        tx({ id: "b", amount: 90, category_id: "fun", category_name: "Rozrywka" }),
      ],
      previous: [
        tx({ id: "pa", amount: 100, category_id: "food" }),
        tx({ id: "pb", amount: 80, category_id: "fun" }),
      ],
      rolling: [],
      periodsInRolling: 3,
      budgets: [],
    });
    expect(out.biggestMovers[0].categoryId).toBe("food"); // delta 200 > 10
    expect(out.biggestExpenses[0].id).toBe("a"); // 300 first
    expect(out.biggestExpenses[0].categoryName).toBe("Jedzenie");
  });

  it("marks first period when previous and rolling are empty", () => {
    const out = computeSpendingInsight({
      current: [tx({ id: "a", amount: 10 })],
      previous: [],
      rolling: [],
      periodsInRolling: 3,
      budgets: [],
    });
    expect(out.isFirstPeriod).toBe(true);
  });
});
