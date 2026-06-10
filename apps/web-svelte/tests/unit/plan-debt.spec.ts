import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import {
  applyDebtPaymentPeriod,
  consolidateDebtLinkedPayments,
  deriveDebtBalanceFromLinks,
  filterPreAnchorPayments,
  resolveDebtReplay,
} from "$lib/services/debt-balance-replay";
import { normalizeDebtTermsInput } from "$lib/services/plan-debt";
import { canManagePlan } from "$lib/services/plans";
import type { GroupMemberRole } from "$lib/types";

const fullReplay = (
  originalAmount: number,
  annualRate: number,
  linkedExpenses: { amount: number; date?: string }[]
) =>
  deriveDebtBalanceFromLinks({
    originalAmount,
    annualRate,
    linkedExpenses,
    anchorBalance: null,
    balanceAnchorDate: null,
  });

const snapshotReplay = (
  anchorBalance: number,
  anchorDate: string,
  annualRate: number,
  linkedExpenses: { amount: number; date?: string }[]
) =>
  deriveDebtBalanceFromLinks({
    originalAmount: 330_000,
    annualRate,
    linkedExpenses,
    anchorBalance,
    balanceAnchorDate: anchorDate,
  });

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

  it("still groups dated rows by month when some rows are undated", () => {
    expect(
      consolidateDebtLinkedPayments([
        { amount: 1000, date: "2026-01-05" },
        { amount: 1370, date: "2026-01-20" },
        { amount: 2370, date: "2026-02-10" },
        { amount: 500 },
      ])
    ).toEqual([2370, 2370, 500]);
  });

  it("appends undated periods after dated months", () => {
    expect(
      consolidateDebtLinkedPayments([
        { amount: 800 },
        { amount: 1000, date: "2026-03-01" },
      ])
    ).toEqual([1000, 800]);
  });

  it("is deterministic regardless of input order", () => {
    const a = consolidateDebtLinkedPayments([
      { amount: 2370, date: "2026-02-10" },
      { amount: 500 },
      { amount: 1370, date: "2026-01-20" },
      { amount: 1000, date: "2026-01-05" },
    ]);
    const b = consolidateDebtLinkedPayments([
      { amount: 1000, date: "2026-01-05" },
      { amount: 2370, date: "2026-02-10" },
      { amount: 1370, date: "2026-01-20" },
      { amount: 500 },
    ]);
    expect(a).toEqual([2370, 2370, 500]);
    expect(a).toEqual(b);
  });
});

describe("filterPreAnchorPayments", () => {
  it("splits dated payments around anchor date", () => {
    const { forward, ignored } = filterPreAnchorPayments(
      [
        { amount: 2370, date: "2026-05-01" },
        { amount: 15_000, date: "2026-06-10" },
        { amount: 500 },
      ],
      "2026-06-01"
    );
    expect(ignored).toHaveLength(1);
    expect(forward).toHaveLength(2);
    expect(forward.find((p) => p.amount === 15_000)).toBeDefined();
  });
});

describe("resolveDebtReplay", () => {
  it("uses snapshot start when anchor fields are set", () => {
    const resolved = resolveDebtReplay({
      originalAmount: 330_000,
      annualRate: 7.18,
      linkedExpenses: [{ amount: 2370, date: "2026-06-10" }],
      anchorBalance: 207_000,
      balanceAnchorDate: "2026-06-01",
    });
    expect(resolved.mode).toBe("snapshot");
    expect(resolved.startBalance).toBe(207_000);
    expect(resolved.forwardExpenses).toHaveLength(1);
  });

  it("uses full replay when anchor fields are null", () => {
    const resolved = resolveDebtReplay({
      originalAmount: 330_000,
      annualRate: 7.18,
      linkedExpenses: [{ amount: 15_000, date: "2026-05-01" }],
      anchorBalance: null,
      balanceAnchorDate: null,
    });
    expect(resolved.mode).toBe("full");
    expect(resolved.startBalance).toBe(330_000);
    expect(resolved.forwardExpenses).toHaveLength(1);
  });
});

describe("deriveDebtBalanceFromLinks", () => {
  it("allocates each payment to interest then principal (full replay)", () => {
    expect(
      fullReplay(206_000, 7.18, [
        { amount: 2370 },
        { amount: 2370 },
        { amount: 500 },
      ])
    ).toBeCloseTo(203_718.32, 0);
  });

  it("never goes below zero when payment exceeds balance", () => {
    expect(fullReplay(10_000, 5, [{ amount: 15_000 }])).toBe(0);
  });

  it("returns start balance when no linked expenses (full replay)", () => {
    expect(fullReplay(206_000, 7.18, [])).toBe(206_000);
  });

  it("snapshot: 15k forward overpay reduces from anchor not original", () => {
    const after = snapshotReplay(207_000, "2026-06-01", 7.18, [
      { amount: 15_000, date: "2026-06-10" },
    ]);
    expect(after).toBeLessThan(207_000);
    expect(after).toBeGreaterThan(190_000);
    expect(after).toBeLessThan(320_000);
  });

  it("snapshot: forward 2370 rata reduces modestly from 207k anchor", () => {
    const after = snapshotReplay(207_000, "2026-06-01", 7.18, [
      { amount: 2370, date: "2026-06-10" },
    ]);
    expect(after).toBeCloseTo(205_868.55, 0);
  });

  it("snapshot: pre-anchor links ignored for balance math", () => {
    const withPreAnchor = snapshotReplay(207_000, "2026-06-01", 7.18, [
      { amount: 15_000, date: "2026-05-01" },
      { amount: 2370, date: "2026-06-10" },
    ]);
    const forwardOnly = snapshotReplay(207_000, "2026-06-01", 7.18, [
      { amount: 2370, date: "2026-06-10" },
    ]);
    expect(withPreAnchor).toBe(forwardOnly);
  });

  it("snapshot: returns anchor when only pre-anchor links exist", () => {
    expect(
      snapshotReplay(207_000, "2026-06-01", 7.18, [{ amount: 2370, date: "2026-05-01" }])
    ).toBe(207_000);
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
