import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { deriveDebtBalanceFromLinks, normalizeDebtTermsInput } from "$lib/services/plan-debt";
import { canManagePlan } from "$lib/services/plans";
import type { GroupMemberRole } from "$lib/types";

describe("normalizeDebtTermsInput", () => {
  it("accepts whole-number amounts and defaults balance to original", () => {
    expect(
      normalizeDebtTermsInput({
        original_amount: 300_000,
        current_balance: undefined as unknown as number,
        annual_rate: 7.18,
        monthly_payment: 2370,
      })
    ).toMatchObject({
      original_amount: 300_000,
      current_balance: 300_000,
      annual_rate: 7.18,
      monthly_payment: 2370,
    });
  });

  it("rejects missing payment", () => {
    expect(() =>
      normalizeDebtTermsInput({
        original_amount: 300_000,
        current_balance: 300_000,
        annual_rate: 7.18,
        monthly_payment: 0,
      })
    ).toThrow("debt_payment_required");
  });

  it("rejects balance above original", () => {
    expect(() =>
      normalizeDebtTermsInput({
        original_amount: 100_000,
        current_balance: 150_000,
        annual_rate: 5,
        monthly_payment: 900,
      })
    ).toThrow("debt_balance_exceeds_original");
  });
});

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

describe("canManagePlan", () => {
  const roles = new Map<string, GroupMemberRole>([["g1", "member"], ["g2", "co_owner"]]);

  it("allows plan owner on private plan", () => {
    expect(canManagePlan({ user_id: "u1", group_id: null }, "u1", roles)).toBe(true);
  });

  it("blocks non-owner on another users private plan", () => {
    expect(canManagePlan({ user_id: "u1", group_id: null }, "u2", roles)).toBe(false);
  });

  it("blocks plain group member on shared plan they did not create", () => {
    expect(canManagePlan({ user_id: "u1", group_id: "g1" }, "u2", roles)).toBe(false);
  });

  it("allows co-owner on shared plan", () => {
    expect(canManagePlan({ user_id: "u1", group_id: "g2" }, "u2", roles)).toBe(true);
  });
});
