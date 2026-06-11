import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { groupDebtPaymentCandidates } from "$lib/services/debt-payment-detect";
import type { TransactionWithCategory } from "$lib/types";

let seq = 0;
function tx(overrides: Partial<TransactionWithCategory>): TransactionWithCategory {
  seq += 1;
  return {
    id: `tx-${seq}`,
    user_id: "user-1",
    category_id: "cat-1",
    category_name: "Mieszkanie",
    group_id: null,
    description: "Rata kredytu hipotecznego",
    counterparty: null,
    amount: 2370.26,
    currency: "PLN",
    type: "expense",
    status: "paid",
    date: "2026-06-10",
    is_recurring: false,
    recurring_day: null,
    recurrence_frequency: null,
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    created_at: "2026-06-10T00:00:00Z",
    updated_at: "2026-06-10T00:00:00Z",
    ...overrides,
  } as TransactionWithCategory;
}

const PAYMENT = 2370.26;

describe("groupDebtPaymentCandidates", () => {
  it("detects a recurring pattern of 2+ matching amounts with same description", () => {
    const result = groupDebtPaymentCandidates(
      [tx({ date: "2026-05-10" }), tx({ date: "2026-06-10" })],
      PAYMENT
    );
    expect(result).toHaveLength(1);
    expect(result[0].reasons.join(" ")).toContain("2×");
  });

  it("suggests the NEWEST occurrence, not the oldest", () => {
    const old = tx({ date: "2026-04-10" });
    const newest = tx({ date: "2026-06-10" });
    const result = groupDebtPaymentCandidates([old, newest, tx({ date: "2026-05-10" })], PAYMENT);
    expect(result[0].tx.id).toBe(newest.id);
  });

  it("skips already-linked occurrences and suggests the newest unlinked one", () => {
    const may = tx({ date: "2026-05-10" });
    const june = tx({ date: "2026-06-10" });
    const result = groupDebtPaymentCandidates([may, june], PAYMENT, new Set([june.id]));
    expect(result).toHaveLength(1);
    expect(result[0].tx.id).toBe(may.id);
  });

  it("returns no suggestion when every occurrence is already linked", () => {
    const may = tx({ date: "2026-05-10" });
    const june = tx({ date: "2026-06-10" });
    const result = groupDebtPaymentCandidates([may, june], PAYMENT, new Set([may.id, june.id]));
    expect(result).toHaveLength(0);
  });

  it("ignores single occurrences (no recurring pattern)", () => {
    expect(groupDebtPaymentCandidates([tx({})], PAYMENT)).toHaveLength(0);
  });

  it("ignores amounts outside the tolerance band", () => {
    const result = groupDebtPaymentCandidates(
      [tx({ amount: 1500 }), tx({ amount: 1500, date: "2026-05-10" })],
      PAYMENT
    );
    expect(result).toHaveLength(0);
  });

  it("boosts score for debt keywords in the description", () => {
    const kredyt = groupDebtPaymentCandidates(
      [tx({ date: "2026-05-10" }), tx({ date: "2026-06-10" })],
      PAYMENT
    );
    const generic = groupDebtPaymentCandidates(
      [
        tx({ description: "Przelew miesięczny", date: "2026-05-10" }),
        tx({ description: "Przelew miesięczny", date: "2026-06-10" }),
      ],
      PAYMENT
    );
    expect(kredyt[0].score).toBeGreaterThan(generic[0].score);
  });
});
