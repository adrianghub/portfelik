import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import {
  computePlanProgress,
  computeSaveMonthlyActual,
  computeSaveMonthlyActualDetail,
  rankPlanTransaction,
} from "$lib/services/plan-settlement";
import type { TransactionWithCategory } from "$lib/types";

function tx(overrides: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "tx-1",
    amount: 200,
    currency: "PLN",
    counterparty: null,
    description: "Test transaction",
    date: "2026-07-05",
    type: "expense",
    status: "paid",
    category_id: "cat-other",
    category_name: "Inne",
    category_type: "expense",
    user_id: "u1",
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
  budget_amount: 3000,
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
    expect(result.reasons.some((r) => r.key === "date_in_range")).toBe(true);
    expect(result.reasons.some((r) => r.key === "not_linked")).toBe(true);
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

describe("computeSaveMonthlyActual", () => {
  it("uses current-month linked deposits when present", () => {
    const actual = computeSaveMonthlyActual({
      kind: "save",
      startDate: "2026-01-01",
      savedAmount: 12_000,
      linkedIncomes: [
        tx({ type: "income", amount: 500, date: "2026-06-08" }),
        tx({ type: "income", amount: 300, date: "2026-01-15" }),
      ],
      today: "2026-06-08",
    });
    expect(actual).toBe(500);
  });

  it("falls back to elapsed-month average without current-month deposits", () => {
    const actual = computeSaveMonthlyActual({
      kind: "save",
      startDate: "2026-01-01",
      savedAmount: 6000,
      linkedIncomes: [tx({ type: "income", amount: 6000, date: "2026-03-10" })],
      today: "2026-04-10",
    });
    expect(actual).toBe(2000);
  });

  it("returns zero for upcoming save goals", () => {
    const actual = computeSaveMonthlyActual({
      kind: "save",
      startDate: "2026-12-01",
      endDate: "2027-12-01",
      savedAmount: 0,
      linkedIncomes: [],
      today: "2026-06-08",
    });
    expect(actual).toBe(0);
  });
});

describe("computeSaveMonthlyActualDetail", () => {
  it("reports a current-month basis when there is a deposit this month", () => {
    const detail = computeSaveMonthlyActualDetail({
      kind: "save",
      startDate: "2026-01-01",
      savedAmount: 12_000,
      linkedIncomes: [
        tx({ type: "income", amount: 500, date: "2026-06-08" }),
        tx({ type: "income", amount: 300, date: "2026-01-15" }),
      ],
      today: "2026-06-08",
    });
    expect(detail.amount).toBe(500);
    expect(detail.basis).toBe("current-month");
  });

  it("flags the elapsed-average fallback as a historical estimate", () => {
    const detail = computeSaveMonthlyActualDetail({
      kind: "save",
      startDate: "2026-01-01",
      savedAmount: 6000,
      linkedIncomes: [tx({ type: "income", amount: 6000, date: "2026-03-10" })],
      today: "2026-04-10",
    });
    expect(detail.amount).toBe(2000);
    expect(detail.basis).toBe("historical-average");
  });

  it("reports no basis when nothing has been saved yet", () => {
    const detail = computeSaveMonthlyActualDetail({
      kind: "save",
      startDate: "2026-01-01",
      savedAmount: 0,
      linkedIncomes: [],
      today: "2026-06-08",
    });
    expect(detail.amount).toBe(0);
    expect(detail.basis).toBe("none");
  });

  it("returns a null amount and no basis for non-save plans", () => {
    const detail = computeSaveMonthlyActualDetail({
      kind: "spend",
      savedAmount: 1000,
      linkedIncomes: [],
      today: "2026-06-08",
    });
    expect(detail.amount).toBeNull();
    expect(detail.basis).toBe("none");
  });

  it("matches computeSaveMonthlyActual for the same input", () => {
    const args = {
      kind: "save" as const,
      startDate: "2026-01-01",
      savedAmount: 6000,
      linkedIncomes: [tx({ type: "income", amount: 6000, date: "2026-03-10" })],
      today: "2026-04-10",
    };
    expect(computeSaveMonthlyActualDetail(args).amount).toBe(computeSaveMonthlyActual(args));
  });
});

describe("computePlanProgress", () => {
  it("computes save goal monthly needed and actual from linked income", () => {
    const end = new Date();
    end.setMonth(end.getMonth() + 6);
    const endDate = end.toISOString().slice(0, 10);

    const progress = computePlanProgress({
      planId: "save-1",
      planName: "Nowy samochód",
      kind: "save",
      budgetAmount: null,
      targetAmount: 60000,
      startDate: "2026-01-01",
      endDate,
      today: "2026-06-08",
      linkedTransactions: [
        tx({ type: "income", amount: 6000, description: "Wpłata na cel", date: "2026-06-05" }),
        tx({ type: "income", amount: 6000, description: "Druga wpłata", date: "2026-03-10" }),
      ],
    });

    expect(progress.savedAmount).toBe(12000);
    expect(progress.remaining).toBe(48000);
    expect(progress.monthlyNeeded).toBeGreaterThan(6000);
    expect(progress.monthlyActual).toBe(6000);
    expect(progress.monthlyActual).toBeLessThan(progress.monthlyNeeded ?? 0);
  });

  it("flags save gap when actual monthly savings lag behind needed pace", () => {
    const end = new Date();
    end.setMonth(end.getMonth() + 3);
    const endDate = end.toISOString().slice(0, 10);

    const progress = computePlanProgress({
      planId: "save-2",
      planName: "Cel",
      kind: "save",
      budgetAmount: null,
      targetAmount: 12000,
      endDate,
      linkedTransactions: [tx({ type: "income", amount: 1000 })],
    });

    expect(progress.monthlyNeeded).toBeGreaterThan(progress.monthlyActual ?? 0);
  });
});

describe("computePlanProgress linkedExpenseCurrentMonth", () => {
  it("sums current-month paid linked expenses (debt payment coverage)", () => {
    const progress = computePlanProgress({
      planId: "debt-1",
      planName: "Kredyt",
      kind: "debt",
      budgetAmount: null,
      targetAmount: null,
      startDate: "2026-01-01",
      endDate: "2030-01-01",
      linkedTransactions: [
        tx({ id: "a", type: "expense", amount: 2370, date: "2026-06-05", status: "paid" }),
        tx({ id: "b", type: "expense", amount: 2370, date: "2026-05-05", status: "paid" }),
      ],
      today: "2026-06-08",
    });
    expect(progress.linkedExpenseCurrentMonth).toBe(2370);
  });

  it("excludes non-current-month and non-paid linked expenses", () => {
    const progress = computePlanProgress({
      planId: "debt-1",
      planName: "Kredyt",
      kind: "debt",
      budgetAmount: null,
      targetAmount: null,
      startDate: "2026-01-01",
      endDate: "2030-01-01",
      linkedTransactions: [
        tx({ id: "a", type: "expense", amount: 2370, date: "2026-06-05", status: "upcoming" }),
        tx({ id: "b", type: "expense", amount: 1000, date: "2026-04-05", status: "paid" }),
      ],
      today: "2026-06-08",
    });
    expect(progress.linkedExpenseCurrentMonth).toBe(0);
  });
});
