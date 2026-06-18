import { describe, expect, it, vi } from "vitest";

// financial-snapshots.ts imports supabase which imports $env/static/public.
// Mock the singleton so the SvelteKit env import never evaluates.
vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { computeNetWorth } from "$lib/services/financial-snapshots";
import type { NetWorthItemValued } from "$lib/types";

describe("computeNetWorth (derived cash)", () => {
  it("sums derived cash with PLN-valued items", () => {
    const items: NetWorthItemValued[] = [
      { label: "Inwestycje", currency: "PLN", amount: 2000, amountPln: 2000 },
      { label: "Nieruchomość", currency: "PLN", amount: 5000, amountPln: 5000 },
    ];
    const result = computeNetWorth({
      asOfDate: "2026-06-01",
      items,
      derivedCash: 1300,
      debtBalances: [500],
    });
    expect(result.cash).toBe(1300);
    expect(result.otherAssets).toBe(7000);
    expect(result.totalAssets).toBe(1300 + 2000 + 5000);
    expect(result.totalDebt).toBe(500);
    expect(result.netWorth).toBe(8300 - 500);
  });

  it("works with no items (assets zero) but a derived cash value", () => {
    const result = computeNetWorth({
      asOfDate: null,
      items: [],
      derivedCash: 400,
      debtBalances: [],
    });
    expect(result.cash).toBe(400);
    expect(result.otherAssets).toBe(0);
    expect(result.netWorth).toBe(400);
    expect(result.hasData).toBe(true);
  });
});
