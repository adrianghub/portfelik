import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import {
  normalizeDebtTermsInput,
  deriveDebtDisplayBalance,
  upsertPlanDebtTerms,
} from "$lib/services/plan-debt";
import { canManagePlan } from "$lib/services/plans";
import { supabase } from "$lib/supabase";
import type { GroupMemberRole, PlanDebtTerms } from "$lib/types";

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

describe("deriveDebtDisplayBalance", () => {
  const planStart = "2026-06-01";
  const snapshotTerms = {
    original_amount: 330_000,
    annual_rate: 7.18,
    monthly_payment: 2370,
    first_payment_date: null,
    first_payment_amount: null,
    anchor_balance: 207_048.67,
    balance_anchor_date: "2026-06-08",
  };

  it("returns the snapshot anchor balance when no forward linked raty", () => {
    const balance = deriveDebtDisplayBalance(snapshotTerms, planStart, [], "2026-06-10");
    // No payment landed after the anchor, so the live balance stays put (no daily tick).
    expect(balance).toBeCloseTo(207_048.67, 0);
  });

  it("subtracts the linked rata after the anchor", () => {
    const withRata = deriveDebtDisplayBalance(
      snapshotTerms,
      planStart,
      [{ amount: 2370.26, date: "2026-06-09" }],
      "2026-06-10"
    );
    const withoutRata = deriveDebtDisplayBalance(snapshotTerms, planStart, [], "2026-06-10");
    expect(withRata).toBeLessThan(withoutRata - 2300);
  });

  it("ignores linked payments dated on or before the anchor", () => {
    const withPreAnchor = deriveDebtDisplayBalance(
      snapshotTerms,
      planStart,
      [
        { amount: 15_000, date: "2026-06-05" },
        { amount: 2370, date: "2026-06-09" },
      ],
      "2026-06-10"
    );
    const forwardOnly = deriveDebtDisplayBalance(
      snapshotTerms,
      planStart,
      [{ amount: 2370, date: "2026-06-09" }],
      "2026-06-10"
    );
    expect(withPreAnchor).toBeCloseTo(forwardOnly, 0);
  });

  it("starts from the original amount when no anchor is set", () => {
    const noAnchor = {
      ...snapshotTerms,
      anchor_balance: null,
      balance_anchor_date: null,
    };
    const balance = deriveDebtDisplayBalance(noAnchor, planStart, [], "2026-06-10");
    expect(balance).toBeCloseTo(330_000, 0);
  });
});

describe("canManagePlan", () => {
  const roles = new Map<string, GroupMemberRole>([
    ["g1", "member"],
    ["g2", "co_owner"],
  ]);

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

describe("upsertPlanDebtTerms first-payment merge", () => {
  // Minimal chainable mock: fetch (.select().eq().maybeSingle()) and
  // upsert (.upsert().select().single()) share one builder. single() returns
  // the captured upsert payload so we can assert what was persisted.
  function mockSupabase(existing: Partial<PlanDebtTerms> | null) {
    let capturedPayload: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: existing, error: null }),
      upsert: (payload: Record<string, unknown>) => {
        capturedPayload = payload;
        return builder;
      },
      single: async () => ({ data: capturedPayload, error: null }),
    };
    (supabase as unknown as { from: () => unknown }).from = () => builder;
    return () => capturedPayload;
  }

  const baseInput = {
    original_amount: 207000,
    current_balance: 207000,
    annual_rate: 5.96,
    monthly_payment: 2255.01,
  };

  it("preserves stored first-payment terms when the caller omits them", async () => {
    const captured = mockSupabase({
      first_payment_date: "2026-08-10",
      first_payment_amount: 3115.38,
      anchor_balance: 207000,
      balance_anchor_date: "2026-06-12",
    } as Partial<PlanDebtTerms>);

    await upsertPlanDebtTerms("plan-1", { ...baseInput });

    expect(captured().first_payment_date).toBe("2026-08-10");
    expect(captured().first_payment_amount).toBe(3115.38);
  });

  it("lets an explicit value overwrite the stored first-payment terms", async () => {
    const captured = mockSupabase({
      first_payment_date: "2026-08-10",
      first_payment_amount: 3115.38,
    } as Partial<PlanDebtTerms>);

    await upsertPlanDebtTerms("plan-1", {
      ...baseInput,
      first_payment_date: "2026-09-01",
      first_payment_amount: 2255.01,
    });

    expect(captured().first_payment_date).toBe("2026-09-01");
    expect(captured().first_payment_amount).toBe(2255.01);
  });

  it("lets an explicit null clear the stored first-payment terms", async () => {
    const captured = mockSupabase({
      first_payment_date: "2026-08-10",
      first_payment_amount: 3115.38,
    } as Partial<PlanDebtTerms>);

    await upsertPlanDebtTerms("plan-1", {
      ...baseInput,
      first_payment_date: null,
      first_payment_amount: null,
    });

    expect(captured().first_payment_date).toBeNull();
    expect(captured().first_payment_amount).toBeNull();
  });
});
