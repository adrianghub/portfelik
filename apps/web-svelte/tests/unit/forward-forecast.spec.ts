import { describe, expect, it } from "vitest";
import type { TransactionWithCategory } from "$lib/types";
import { forwardForecastTransactions } from "$lib/services/transaction-projections";
import { computeSummary } from "$lib/services/transaction-summary";

function tx(over: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "t-1",
    amount: 100,
    currency: "PLN",
    counterparty: null,
    description: "Row",
    date: "2026-07-10",
    type: "expense",
    status: "upcoming",
    category_id: "cat-1",
    user_id: "u1",
    is_recurring: false,
    recurring_day: null,
    recurrence_frequency: null,
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    recurring_occurrence_date: null,
    recurrence_end_date: null,
    group_id: null,
    created_at: "",
    updated_at: "",
    category_name: "Sport i rekreacja",
    category_type: "expense",
    is_hold: false,
    ...over,
  };
}

function template(over: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return tx({
    id: "tmpl-1",
    description: "Terapia",
    date: "2026-01-08",
    status: "paid",
    is_recurring: true,
    recurring_day: null,
    recurrence_frequency: "weekly",
    recurrence_weekday: 3, // Wednesday
    category_name: "Zdrowie",
    amount: 200,
    ...over,
  });
}

// Forward span: July 2026 (a purely-future window).
const START = "2026-07-01";
const END = "2026-08-01";
const NOW = new Date("2026-06-26T00:00:00.000Z");

describe("forwardForecastTransactions", () => {
  it("includes one-off upcoming rows in the window", () => {
    const oneOff = tx({ id: "sportano", date: "2026-07-20", amount: 389.99 });
    const out = forwardForecastTransactions({
      templates: [],
      existing: [oneOff],
      start: START,
      end: END,
      now: NOW,
    });
    expect(out.some((t) => t.id === "sportano")).toBe(true);
  });

  it("excludes paid (ledger) rows — forecast is scheduled-only", () => {
    const paid = tx({ id: "paid-row", status: "paid", date: "2026-07-05" });
    const out = forwardForecastTransactions({
      templates: [],
      existing: [paid],
      start: START,
      end: END,
      now: NOW,
    });
    expect(out.some((t) => t.id === "paid-row")).toBe(false);
  });

  it("includes overdue rows alongside upcoming", () => {
    const overdue = tx({ id: "od", status: "overdue", date: "2026-07-03" });
    const out = forwardForecastTransactions({
      templates: [],
      existing: [overdue],
      start: START,
      end: END,
      now: NOW,
    });
    expect(out.some((t) => t.id === "od")).toBe(true);
  });

  it("does not double-count a materialized recurring occurrence", () => {
    const tmpl = template();
    // A real, already-materialized occurrence of the weekly template on 2026-07-08.
    const materialized = tx({
      id: "real-occ",
      description: "Terapia",
      date: "2026-07-08",
      status: "upcoming",
      recurring_template_id: "tmpl-1",
      recurring_occurrence_date: "2026-07-08",
      category_name: "Zdrowie",
      amount: 200,
    });
    const out = forwardForecastTransactions({
      templates: [tmpl],
      existing: [materialized],
      start: START,
      end: END,
      now: NOW,
    });
    const onJul8 = out.filter((t) => t.date === "2026-07-08");
    expect(onJul8).toHaveLength(1);
    expect(onJul8[0].id).toBe("real-occ"); // the real row, not a projection
  });

  it("emits projected occurrences for periods with no real row", () => {
    const tmpl = template();
    const out = forwardForecastTransactions({
      templates: [tmpl],
      existing: [],
      start: START,
      end: END,
      now: NOW,
    });
    // Weekly Wednesdays in July 2026: 1, 8, 15, 22, 29.
    const projected = out.filter((t) => t.projected === true);
    expect(projected.length).toBeGreaterThanOrEqual(4);
    expect(projected.every((t) => t.recurring_template_id === "tmpl-1")).toBe(true);
  });

  it("summary must include projected rows to match the visible forecast list", () => {
    const tmpl = template();
    const oneOff = tx({ id: "sportano", date: "2026-07-20", amount: 389.99 });
    const out = forwardForecastTransactions({
      templates: [tmpl],
      existing: [oneOff],
      start: START,
      end: END,
      now: NOW,
    });
    const real = out.filter((t) => !t.projected);
    const projected = out.filter((t) => t.projected);
    const filteredOnly = computeSummary(real).total_expenses;
    const withProjected = computeSummary([...real, ...projected]).total_expenses;
    expect(withProjected).toBeGreaterThan(filteredOnly);
    expect(withProjected).toBe(out.reduce((s, t) => s + (t.type === "expense" ? t.amount : 0), 0));
  });
});
