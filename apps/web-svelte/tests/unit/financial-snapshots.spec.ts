import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { computeNetWorth } from "$lib/services/financial-snapshots";
import type { FinancialSnapshot } from "$lib/types";

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
