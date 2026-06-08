import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import {
  applyDebtPaymentPeriod,
  consolidateDebtLinkedPayments,
  deriveDebtBalanceFromLinks,
  normalizeDebtTermsInput,
} from "$lib/services/plan-debt";
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

describe("applyDebtPaymentPeriod", () => {
  it("applies payment to interest before principal", () => {
    const after = applyDebtPaymentPeriod(206_000, 7.18, 2370);
    expect(after).toBeCloseTo(204_862.57, 0);
  });

  it("leaves balance unchanged when payment covers only part of interest", () => {
    const before = 203_718.32;
    const after = applyDebtPaymentPeriod(before, 7.18, 500);
    expect(after).toBeCloseTo(before, 0);
  });
});

describe("consolidateDebtLinkedPayments", () => {
  it("sums payments in the same calendar month", () => {
    expect(
      consolidateDebtLinkedPayments([
        { amount: 1000, date: "2026-01-05" },
        { amount: 1370, date: "2026-01-20" },
        { amount: 2370, date: "2026-02-10" },
      ])
    ).toEqual([2370, 2370]);
  });
});

describe("deriveDebtBalanceFromLinks", () => {
  it("allocates each payment to interest then principal", () => {
    expect(
      deriveDebtBalanceFromLinks(206_000, 7.18, [
        { amount: 2370 },
        { amount: 2370 },
        { amount: 500 },
      ])
    ).toBeCloseTo(203_718.32, 0);
  });

  it("never goes below zero when payment exceeds balance", () => {
    expect(deriveDebtBalanceFromLinks(10_000, 5, [{ amount: 15_000 }])).toBe(0);
  });

  it("returns original when no linked expenses", () => {
    expect(deriveDebtBalanceFromLinks(206_000, 7.18, [])).toBe(206_000);
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
