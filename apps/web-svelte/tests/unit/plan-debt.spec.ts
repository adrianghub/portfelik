import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { deriveDebtBalanceFromLinks } from "$lib/services/plan-debt";

describe("deriveDebtBalanceFromLinks", () => {
  it("subtracts linked payment totals from original amount", () => {
    expect(
      deriveDebtBalanceFromLinks(206_000, [{ amount: 2370 }, { amount: 2370 }, { amount: 500 }])
    ).toBe(200_760);
  });

  it("never goes below zero", () => {
    expect(deriveDebtBalanceFromLinks(10_000, [{ amount: 15_000 }])).toBe(0);
  });
});
