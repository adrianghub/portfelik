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
  status: "active",
  refinanced_from_plan_id: null,
  replaced_by_plan_id: null,
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
  anchor_balance: 200_000,
  balance_anchor_date: "2026-06-01",
  first_payment_date: null,
  first_payment_amount: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  ...overrides,
});

describe("debtBalanceForNetWorth", () => {
  it("excludes upcoming loans from net worth", () => {
    const balance = debtBalanceForNetWorth(
      debtPlan({ start_date: "2026-07-01" }),
      debtTerms({ original_amount: 200_000, current_balance: 199_000 }),
      "2026-06-08"
    );
    expect(balance).toBe(0);
  });

  it("falls back to plan target when active plan has no terms row", () => {
    const balance = debtBalanceForNetWorth(
      debtPlan({ target_amount: 150_000, start_date: "2025-01-01", end_date: "2045-01-01" }),
      undefined,
      "2026-06-08"
    );
    expect(balance).toBe(150_000);
  });

  it("holds at the snapshot anchor for active loans with no forward payments", () => {
    // Engine contract: the live balance only moves when a real linked payment lands,
    // so with no forward payment it equals the snapshot anchor (no daily tick).
    const balance = debtBalanceForNetWorth(
      debtPlan({ start_date: "2025-04-30", end_date: "2028-12-31" }),
      debtTerms({
        original_amount: 330_000,
        current_balance: 207_048.67,
        anchor_balance: 207_048.67,
        balance_anchor_date: "2026-06-08",
        annual_rate: 7.18,
        updated_at: "2026-06-08T00:00:00Z",
      }),
      "2026-06-10"
    );
    expect(balance).toBeCloseTo(207_048.67, 0);
  });

  it("subtracts linked payments via flat accrual when payment data is supplied", () => {
    const withoutPayments = debtBalanceForNetWorth(
      debtPlan({ start_date: "2025-04-30", end_date: "2028-12-31" }),
      debtTerms({
        original_amount: 330_000,
        current_balance: 207_048.67,
        anchor_balance: 207_048.67,
        balance_anchor_date: "2026-06-01",
        annual_rate: 7.18,
        updated_at: "2026-06-01T00:00:00Z",
      }),
      "2026-06-10"
    );
    const withPayment = debtBalanceForNetWorth(
      debtPlan({ start_date: "2025-04-30", end_date: "2028-12-31" }),
      debtTerms({
        original_amount: 330_000,
        current_balance: 207_048.67,
        anchor_balance: 207_048.67,
        balance_anchor_date: "2026-06-01",
        annual_rate: 7.18,
        updated_at: "2026-06-01T00:00:00Z",
      }),
      "2026-06-10",
      [{ amount: 2370.26, date: "2026-06-10" }]
    );
    expect(withPayment).toBeLessThan(withoutPayments);
    expect(withoutPayments - withPayment).toBeGreaterThan(2000);
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
  it("sums active debt plans only", () => {
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
        anchor_balance: 207_000,
        balance_anchor_date: "2026-06-08",
        updated_at: "2026-06-08T00:00:00Z",
      }),
      d2: debtTerms({ plan_id: "d2", original_amount: 100_000, current_balance: 100_000 }),
    };
    const balances = collectNetWorthDebtBalances(plans, terms, "2026-06-08");
    expect(balances).toHaveLength(1);
    expect(balances[0]).toBe(207_000);
  });

  it("excludes refinanced (archived) debt plans from net worth", () => {
    const plans = [
      debtPlan({ id: "d1", start_date: "2025-01-01", end_date: "2030-01-01" }),
      debtPlan({
        id: "d-refi",
        start_date: "2025-01-01",
        end_date: "2030-01-01",
        status: "refinanced",
      }),
    ];
    const terms = {
      d1: debtTerms({
        plan_id: "d1",
        original_amount: 207_000,
        current_balance: 207_000,
        anchor_balance: 207_000,
        balance_anchor_date: "2026-06-08",
        updated_at: "2026-06-08T00:00:00Z",
      }),
      "d-refi": debtTerms({
        plan_id: "d-refi",
        original_amount: 300_000,
        current_balance: 300_000,
        anchor_balance: 300_000,
        balance_anchor_date: "2026-06-08",
        updated_at: "2026-06-08T00:00:00Z",
      }),
    };
    const balances = collectNetWorthDebtBalances(plans, terms, "2026-06-08");
    expect(balances).toHaveLength(1);
    expect(balances[0]).toBe(207_000);
  });
});
