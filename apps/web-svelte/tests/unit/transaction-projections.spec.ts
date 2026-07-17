import { describe, expect, it } from "vitest";
import type { TransactionWithCategory } from "$lib/types";
import {
  recurringProjectionsForTransactionRange,
  shouldShowProjectedRows,
} from "$lib/services/transaction-projections";

function tx(over: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "tmpl-1",
    amount: 100,
    currency: "PLN",
    counterparty: null,
    description: "Czynsz",
    date: "2026-01-01",
    type: "expense",
    status: "paid",
    category_id: "cat-1",
    user_id: "u1",
    is_recurring: true,
    recurring_day: 1,
    recurrence_frequency: "monthly",
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    recurring_occurrence_date: null,
    recurrence_end_date: null,
    group_id: null,
    created_at: "",
    updated_at: "",
    category_name: "Dom",
    category_type: "expense",
    is_hold: false,
    ...over,
  };
}

describe("transaction projections", () => {
  it("shows projections only for unset or upcoming status filters", () => {
    expect(shouldShowProjectedRows(null)).toBe(true);
    expect(shouldShowProjectedRows(new Set(["upcoming"]))).toBe(true);
    expect(shouldShowProjectedRows(new Set(["paid"]))).toBe(false);
  });

  it("includes a projection on the first day of a future range", () => {
    const out = recurringProjectionsForTransactionRange({
      templates: [tx()],
      existing: [],
      start: "2026-07-01",
      end: "2026-08-01",
      now: new Date("2026-06-24T12:00:00Z"),
    });
    expect(out.map((r) => r.date)).toEqual(["2026-07-01"]);
  });

  it("does not backfill old occurrences inside the current visible range", () => {
    const out = recurringProjectionsForTransactionRange({
      templates: [tx()],
      existing: [],
      start: "2026-06-01",
      end: "2026-07-01",
      now: new Date("2026-06-24T12:00:00Z"),
    });
    expect(out.map((r) => r.date)).toEqual([]);
  });

  it("includes today's occurrence when the range starts today", () => {
    const out = recurringProjectionsForTransactionRange({
      templates: [tx({ date: "2026-01-15", recurring_day: 15 })],
      existing: [],
      start: "2026-06-15",
      end: "2026-07-15",
      now: new Date("2026-06-15T12:00:00Z"),
    });
    expect(out.map((r) => r.date)).toEqual(["2026-06-15"]);
  });
});
