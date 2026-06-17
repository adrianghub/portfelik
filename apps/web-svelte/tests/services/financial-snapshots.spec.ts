import { describe, expect, it, vi } from "vitest";

// financial-snapshots.ts imports supabase which imports $env/static/public.
// Mock the singleton so the SvelteKit env import never evaluates.
vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { computeNetWorth } from "$lib/services/financial-snapshots";

describe("computeNetWorth (derived cash)", () => {
  it("uses the passed-in derived cash, not snapshot.cash_amount", () => {
    const snapshot = {
      as_of_date: "2026-06-01",
      cash_amount: 99999, // must be IGNORED now
      investments_amount: 2000,
      real_estate_amount: 5000,
    };
    const result = computeNetWorth({ snapshot, derivedCash: 1300, debtBalances: [500] });
    expect(result.cash).toBe(1300);
    expect(result.totalAssets).toBe(1300 + 2000 + 5000);
    expect(result.totalDebt).toBe(500);
    expect(result.netWorth).toBe(8300 - 500);
  });

  it("works with no snapshot (assets zero) but a derived cash value", () => {
    const result = computeNetWorth({ snapshot: null, derivedCash: 400, debtBalances: [] });
    expect(result.cash).toBe(400);
    expect(result.investments).toBe(0);
    expect(result.realEstate).toBe(0);
    expect(result.netWorth).toBe(400);
    expect(result.hasData).toBe(true);
  });
});
