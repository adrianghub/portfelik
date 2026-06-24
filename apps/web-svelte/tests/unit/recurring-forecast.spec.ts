import { describe, expect, it } from "vitest";
import type { TransactionWithCategory } from "$lib/types";
import { projectRecurringOccurrences } from "$lib/services/recurring-forecast";
import { ledgerTransactions } from "$lib/services/transaction-cashflow";

function template(over: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "tmpl-1",
    amount: 100,
    currency: "PLN",
    counterparty: null,
    description: "Subskrypcja",
    date: "2026-01-10",
    type: "expense",
    status: "paid",
    category_id: "cat-1",
    user_id: "u1",
    is_recurring: true,
    recurring_day: 10,
    recurrence_frequency: "monthly",
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    group_id: null,
    created_at: "",
    updated_at: "",
    category_name: "Subskrypcje",
    category_type: "expense",
    is_hold: false,
    ...over,
  };
}

const SPAN_START = "2026-06-23";
const SPAN_END = "2026-09-23"; // ~3 months forward

describe("projectRecurringOccurrences — monthly", () => {
  it("emits one occurrence per month in span, on the recurring_day", () => {
    const out = projectRecurringOccurrences([template()], SPAN_START, SPAN_END);
    expect(out.map((t) => t.date)).toEqual(["2026-07-10", "2026-08-10", "2026-09-10"]);
    expect(out.every((t) => t.projected === true)).toBe(true);
    expect(out.every((t) => t.status === "upcoming")).toBe(true);
    expect(out.every((t) => t.amount === 100 && t.category_name === "Subskrypcje")).toBe(true);
  });

  it("respects recurrence_interval > 1 (every 2 months)", () => {
    const out = projectRecurringOccurrences(
      [template({ recurrence_interval: 2 })],
      "2026-06-23",
      "2026-12-23"
    );
    // July is anchor-phase: Jan,Mar,May,Jul,Sep,Nov -> in span: Jul, Sep, Nov
    expect(out.map((t) => t.date)).toEqual(["2026-07-10", "2026-09-10", "2026-11-10"]);
  });

  it("clamps recurring_day to the last day of short months", () => {
    const out = projectRecurringOccurrences(
      [template({ recurring_day: 31, date: "2026-01-31" })],
      "2026-01-15",
      "2026-04-15"
    );
    expect(out.map((t) => t.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
});

describe("projectRecurringOccurrences — weekly / daily / yearly", () => {
  it("weekly steps every interval*7 days on the weekday", () => {
    const t = template({
      recurrence_frequency: "weekly",
      recurrence_interval: 1,
      recurrence_weekday: 1, // Monday
      recurring_day: null,
      date: "2026-06-01", // a Monday
    });
    const out = projectRecurringOccurrences([t], "2026-06-23", "2026-07-14");
    // Mondays after 06-23 and before 07-14: 06-29, 07-06, 07-13
    expect(out.map((x) => x.date)).toEqual(["2026-06-29", "2026-07-06", "2026-07-13"]);
  });

  it("yearly steps on recurrence_month/recurring_day", () => {
    const t = template({
      recurrence_frequency: "yearly",
      recurrence_interval: 1,
      recurrence_month: 3,
      recurring_day: 15,
    });
    const out = projectRecurringOccurrences([t], "2026-06-23", "2029-06-23");
    expect(out.map((x) => x.date)).toEqual(["2027-03-15", "2028-03-15", "2029-03-15"]);
  });
});

describe("projectRecurringOccurrences — stale anchor", () => {
  it("daily template anchored >400 days before spanStart still emits occurrences", () => {
    // Anchor well over 400 days before span start to exercise the arithmetic fast-forward.
    const t = template({
      recurrence_frequency: "daily",
      recurrence_interval: 1,
      recurring_day: null,
      date: "2024-01-01", // ~900+ days before span
    });
    const out = projectRecurringOccurrences([t], "2026-06-20", "2026-06-25");
    expect(out.map((x) => x.date)).toEqual([
      "2026-06-21",
      "2026-06-22",
      "2026-06-23",
      "2026-06-24",
    ]);
  });

  it("weekly template anchored far in the past still emits occurrences", () => {
    const t = template({
      recurrence_frequency: "weekly",
      recurrence_interval: 1,
      recurrence_weekday: 1, // Monday
      recurring_day: null,
      date: "2023-01-02", // a Monday, ~3.5 years before span
    });
    const out = projectRecurringOccurrences([t], "2026-06-20", "2026-07-07");
    // Mondays after 06-20 and before 07-07: 06-22, 06-29, 07-06
    expect(out.map((x) => x.date)).toEqual(["2026-06-22", "2026-06-29", "2026-07-06"]);
  });
});

describe("projectRecurringOccurrences — bounds, dedup, ledger exclusion", () => {
  it("excludes occurrences on/before spanStart and on/after spanEnd", () => {
    const out = projectRecurringOccurrences([template()], "2026-07-10", "2026-09-10");
    // 07-10 excluded (== start), 09-10 excluded (== end) -> only 08-10
    expect(out.map((t) => t.date)).toEqual(["2026-08-10"]);
  });

  it("dedupes against a real row already linked to the template in that period", () => {
    const real = template({
      id: "real-aug",
      recurring_template_id: "tmpl-1",
      date: "2026-08-10",
      projected: false,
    });
    const out = projectRecurringOccurrences([template()], SPAN_START, SPAN_END, [real]);
    expect(out.map((t) => t.date)).toEqual(["2026-07-10", "2026-09-10"]); // Aug folded
  });

  it("projected rows are excluded from the ledger", () => {
    const out = projectRecurringOccurrences([template()], SPAN_START, SPAN_END);
    expect(ledgerTransactions(out)).toHaveLength(0);
  });

  it("ignores non-recurring templates and missing frequency", () => {
    expect(
      projectRecurringOccurrences(
        [template({ is_recurring: false }), template({ recurrence_frequency: null })],
        SPAN_START,
        SPAN_END
      )
    ).toHaveLength(0);
  });
});
