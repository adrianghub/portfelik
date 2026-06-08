import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import {
  collectNetWorthDebtBalances,
  computeNetWorth,
  debtBalanceForNetWorth,
} from "$lib/services/financial-snapshots";
import type { FinancialSnapshot, Plan, PlanDebtTerms } from "$lib/types";

const snapshot: FinancialSnapshot = {
  user_id: "u1",
  as_of_date: "2026-06-01",
  cash_amount: 42000,
  investments_amount: 51000,
  real_estate_amount: 420000,
  created_at: "2026-06-01T10:00:00Z",
  updated_at: "2026-06-01T10:00:00Z",
};

describe("computeNetWorth", () => {
  it("sums manual assets minus debt plan balances", () => {
    const result = computeNetWorth(snapshot, [206_000]);
    expect(result.totalAssets).toBe(513_000);
    expect(result.totalDebt).toBe(206_000);
    expect(result.netWorth).toBe(307_000);
    expect(result.hasSnapshot).toBe(true);
  });

  it("returns empty state when no snapshot", () => {
    const result = computeNetWorth(null, [100_000]);
    expect(result.hasSnapshot).toBe(false);
    expect(result.totalAssets).toBe(0);
    expect(result.netWorth).toBe(-100_000);
  });
});

const debtPlan = (overrides: Partial<Plan> = {}): Plan => ({
  id: "debt-1",
  name: "Hipoteka",
  user_id: "u1",
  group_id: null,
  category_id: null,
  kind: "debt",
  budget_amount: null,
  target_amount: 200_000,
  start_date: "2026-07-01",
  end_date: "2046-07-01",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  ...overrides,
});

const debtTerms = (overrides: Partial<PlanDebtTerms> = {}): PlanDebtTerms => ({
  plan_id: "debt-1",
  original_amount: 200_000,
  current_balance: 200_000,
  annual_rate: 7,
  monthly_payment: 1400,
  payment_day: null,
  anchor_transaction_id: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  ...overrides,
});

describe("debtBalanceForNetWorth", () => {
  it("counts full original for upcoming loans", () => {
    const balance = debtBalanceForNetWorth(
      debtPlan({ start_date: "2026-07-01" }),
      debtTerms({ original_amount: 200_000, current_balance: 199_000 }),
      "2026-06-08"
    );
    expect(balance).toBe(200_000);
  });

  it("falls back to plan target when terms row is missing", () => {
    const balance = debtBalanceForNetWorth(
      debtPlan({ target_amount: 150_000, start_date: "2026-08-01" }),
      undefined,
      "2026-06-08"
    );
    expect(balance).toBe(150_000);
  });

  it("excludes finished loans with zero balance", () => {
    const balance = debtBalanceForNetWorth(
      debtPlan({ start_date: "2020-01-01", end_date: "2025-12-31" }),
      debtTerms({ current_balance: 0 }),
      "2026-06-08"
    );
    expect(balance).toBe(0);
  });
});

describe("collectNetWorthDebtBalances", () => {
  it("sums active and upcoming debt plans", () => {
    const plans = [
      debtPlan({ id: "d1", start_date: "2025-01-01", end_date: "2030-01-01" }),
      debtPlan({
        id: "d2",
        start_date: "2026-09-01",
        end_date: "2046-09-01",
        target_amount: 100_000,
      }),
    ];
    const terms = {
      d1: debtTerms({
        plan_id: "d1",
        original_amount: 207_000,
        current_balance: 207_000,
        updated_at: "2026-06-08T00:00:00Z",
      }),
      d2: debtTerms({ plan_id: "d2", original_amount: 100_000, current_balance: 100_000 }),
    };
    const balances = collectNetWorthDebtBalances(plans, terms, "2026-06-08");
    expect(balances).toHaveLength(2);
    expect(balances.reduce((a, b) => a + b, 0)).toBe(307_000);
  });
});
