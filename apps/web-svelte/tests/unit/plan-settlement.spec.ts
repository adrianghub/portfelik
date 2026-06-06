import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { rankPlanTransaction } from "$lib/services/plan-settlement";
import type { TransactionWithCategory } from "$lib/types";

function tx(overrides: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "tx-1",
    amount: 200,
    currency: "PLN",
    description: "Test transaction",
    date: "2026-07-05",
    type: "expense",
    status: "paid",
    category_id: "cat-other",
    category_name: "Inne",
    category_type: "expense",
    user_id: "u1",
    shopping_list_id: null,
    is_recurring: false,
    recurring_day: null,
    recurrence_frequency: null,
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    group_id: null,
    created_at: "2026-07-05T10:00:00Z",
    updated_at: "2026-07-05T10:00:00Z",
    ...overrides,
  };
}

const basePlan = {
  category_id: "cat-travel",
  planned_for: "2026-07-14",
  total_amount: 3000,
  name: "Wakacje Chorwacja",
};

describe("rankPlanTransaction", () => {
  it("assigns high rank when category matches and keyword found", () => {
    const result = rankPlanTransaction(
      basePlan,
      tx({ category_id: "cat-travel", description: "Booking wakacje hotel", amount: 500 }),
      0
    );
    expect(result.rankLabel).toBe("high");
    expect(result.reasons.some((r) => r.key === "category" && r.signal === "match")).toBe(true);
    expect(result.reasons.some((r) => r.key === "keyword" && r.signal === "match")).toBe(true);
  });

  it("keyword match alone boosts rank above low", () => {
    const result = rankPlanTransaction(
      basePlan,
      tx({ category_id: "cat-other", description: "Wakacje rezerwacja", amount: 500 }),
      0
    );
    // baseline(25) + keyword(25) = 50 → medium
    expect(result.rankLabel).toBe("medium");
    expect(result.reasons.some((r) => r.key === "keyword")).toBe(true);
  });

  it("mismatched category produces warn signal", () => {
    const result = rankPlanTransaction(
      basePlan,
      tx({ category_id: "cat-food", category_name: "Jedzenie", description: "Restaurant bill" }),
      0
    );
    expect(result.reasons.some((r) => r.key === "other_category" && r.signal === "warn")).toBe(
      true
    );
  });

  it("amount exceeding remaining budget skips amount bonus", () => {
    const withBudget = rankPlanTransaction(basePlan, tx({ amount: 200 }), 2900);
    const overBudget = rankPlanTransaction(basePlan, tx({ amount: 200 }), 2850);
    // remaining = 3000 - 2900 = 100, tx.amount=200 > 100 → no bonus
    expect(withBudget.reasons.some((r) => r.key === "amount")).toBe(false);
    // remaining = 3000 - 2850 = 150, tx.amount=200 > 150 → no bonus
    expect(overBudget.reasons.some((r) => r.key === "amount")).toBe(false);

    // When amount fits: remaining = 3000 - 0 = 3000, tx.amount=200 ≤ 3000 → bonus
    const fits = rankPlanTransaction(basePlan, tx({ amount: 200 }), 0);
    expect(fits.reasons.some((r) => r.key === "amount")).toBe(true);
  });
});
