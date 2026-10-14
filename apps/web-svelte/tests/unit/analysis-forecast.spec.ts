import { describe, expect, it } from "vitest";
import { analysisForecastEnd, buildAnalysisForecast } from "$lib/analysis/forecast";
import { cockpitMonthIndicators } from "$lib/cockpit/month";
import { recurringProjectionsForTransactionRange } from "$lib/services/transaction-projections";
import type { TransactionWithCategory } from "$lib/types";

function row(
  id: string,
  date: string,
  amount: number,
  extra: Partial<TransactionWithCategory> = {}
): TransactionWithCategory {
  return {
    id,
    date,
    amount,
    type: "expense",
    status: "upcoming",
    currency: "PLN",
    group_id: null,
    is_recurring: false,
    recurring_template_id: null,
    ...extra,
  } as TransactionWithCategory;
}
const today = "2026-10-13";
const anchor = {
  opening_amount: 9462.34,
  as_of_date: today,
  balance_semantics: "end_of_day" as const,
};
const salary = row("salary", "2026-10-26", 13076.57, {
  type: "income",
  is_recurring: true,
  recurrence_frequency: "monthly",
  recurrence_interval: 1,
  recurring_day: 26,
});
const rent = row("rent", "2026-10-15", 1500, {
  is_recurring: true,
  recurrence_frequency: "monthly",
  recurrence_interval: 1,
  recurring_day: 15,
});
const templates = [salary, rent];

function forecast(end: string, extra: Partial<Parameters<typeof buildAnalysisForecast>[0]> = {}) {
  return buildAnalysisForecast({ today, end, anchor, rows: templates, templates, ...extra })!;
}

describe("analysis forecast using Kokpit rules", () => {
  it("includes the October salary and indefinite cycles across the year boundary", () => {
    const result = forecast("2027-10-13");
    expect(result.balance).toBe(9462.34);
    expect(result.points.find((point) => point.date === "2026-10-26")?.balance).toBe(21038.91);
    expect(result.points.find((point) => point.date === "2027-01-26")?.balance).toBe(55768.62);
    expect(result.income).toBe(156918.84);
    expect(result.expense).toBe(18000);
    expect(result.finalBalance).toBe(148381.18);
    expect(result.points.at(-1)?.balance).toBe(result.finalBalance);
    expect(result.bars.some((bar) => bar.income > 0)).toBe(true);
    expect(result.bars.some((bar) => bar.expense > 0)).toBe(true);
    expect(result.bars.reduce((sum, bar) => sum + bar.income, 0)).toBeCloseTo(result.income, 2);
    expect(result.bars.reduce((sum, bar) => sum + bar.expense, 0)).toBeCloseTo(result.expense, 2);
  });
  it("deduplicates materialized occurrences, respects skips and ignores draft, foreign and household rows", () => {
    const november = row("salary-nov", "2026-11-26", 13076.57, {
      type: "income",
      recurring_template_id: "salary",
      recurring_occurrence_date: "2026-11-26",
    });
    const result = forecast("2026-12-31", {
      rows: [
        ...templates,
        november,
        row("draft", "2026-11-01", 10000, { status: "draft" }),
        row("usd", "2026-11-01", 10000, { currency: "USD" }),
        row("group", "2026-11-01", 10000, { group_id: "household" }),
      ],
      skipped: [{ recurring_template_id: "salary", occurrence_date: "2026-12-26" }],
    });
    expect(result.income).toBe(26153.14);
    expect(result.expense).toBe(4500);
    expect(result.finalBalance).toBe(31115.48);
  });
  it("matches Kokpit at month end, including paid deposits and linked plan remainders", () => {
    const end = "2026-10-31";
    const deposit = row("deposit", "2026-10-14", 100, { status: "paid" });
    const rows = [...templates, deposit, row("linked", "2026-10-21", 200)];
    const spend = {
      items: [
        {
          id: "item",
          amount: 500,
          dueDate: "2026-10-21",
          status: "confirmed" as const,
          groupId: null,
        },
      ],
      links: [
        { planItemId: "item", transactionId: "deposit", amount: 100, countsAsPaid: true },
        { planItemId: "item", transactionId: "linked", amount: 200, countsAsPaid: false },
      ],
    };
    const projected = recurringProjectionsForTransactionRange({
      templates,
      existing: rows,
      start: today,
      end: "2026-11-01",
      now: new Date(`${today}T00:00:00Z`),
    });
    const cockpit = cockpitMonthIndicators({
      scope: { kind: "private" },
      anchor,
      today,
      monthStart: "2026-10-01",
      monthEnd: end,
      transactions: [...rows, ...projected],
      items: spend.items,
      links: spend.links,
    });
    const result = forecast(end, { rows, spend });
    expect(result.balance).toBe(cockpit.balance);
    expect(result.finalBalance).toBe(cockpit.forecast);
    expect(result.expense).toBe(1900);
  });
  it("does not project a paid materialized period twice", () => {
    const result = forecast("2026-12-31", {
      rows: [
        ...templates,
        row("paid-nov", "2026-11-26", 13076.57, {
          type: "income",
          status: "paid",
          recurring_template_id: "salary",
          recurring_occurrence_date: "2026-11-26",
        }),
      ],
    });
    expect(result.income).toBe(26153.14);
    expect(result.finalBalance).toBe(44192.05);
  });
  it("honors recurrence end dates, overdue operations, and a negative starting balance", () => {
    const bounded = { ...salary, recurrence_end_date: "2026-11-26" };
    const result = forecast("2027-02-28", {
      anchor: { opening_amount: -100, as_of_date: "2026-09-01" },
      templates: [bounded],
      rows: [
        bounded,
        row("late", "2026-10-01", 20, { status: "overdue" }),
        row("one-off", "2027-01-01", 5.55),
      ],
    });
    expect(result.income).toBe(26153.14);
    expect(result.expense).toBe(25.55);
    expect(result.finalBalance).toBe(26027.59);
    expect(result.points[0].balance).toBe(-100);
  });
  it("requires a known balance on today", () => {
    expect(
      buildAnalysisForecast({ today, end: "2026-12-31", anchor: null, rows: [], templates: [] })
    ).toBeNull();
  });
});

it("uses calendar horizons and clamps leap-day anniversaries", () => {
  expect(analysisForecastEnd(today, "year")).toBe("2026-12-31");
  expect(analysisForecastEnd(today, "3months")).toBe("2027-01-13");
  expect(analysisForecastEnd(today, "6months")).toBe("2027-04-13");
  expect(analysisForecastEnd("2028-02-29", "12months")).toBe("2029-02-28");
});

it("keeps an already received future-dated occurrence in live cash without projecting it twice", () => {
  const rows = [
    ...templates,
    row("received", "2026-11-26", 13076.57, {
      type: "income",
      status: "paid",
      recurring_template_id: "salary",
      recurring_occurrence_date: "2026-11-26",
    }),
  ];
  const result = forecast("2026-10-31", { rows });
  const cockpit = cockpitMonthIndicators({
    scope: { kind: "private" },
    anchor,
    today,
    monthStart: "2026-10-01",
    monthEnd: "2026-10-31",
    transactions: rows,
    items: [],
    links: [],
  });
  expect(result.balance).toBe(22538.91);
  expect(result.balance).toBe(cockpit.balance);
  expect(result.finalBalance).toBe(cockpit.forecast);
  expect(result.points.at(-1)?.balance).toBe(result.finalBalance);
});

it("projects the October salary from an old paid template when no future real row exists", () => {
  const oldSalary = { ...salary, date: "2026-06-26", status: "paid" as const };
  const oldRent = { ...rent, date: "2026-06-15", status: "paid" as const };
  const result = forecast("2026-12-31", {
    templates: [oldSalary, oldRent],
    rows: [oldSalary, oldRent],
  });
  expect(result.balance).toBe(9462.34);
  expect(result.points.find((point) => point.date === "2026-10-26")?.balance).toBe(21038.91);
  expect(result.finalBalance).toBe(44192.05);
});

it("keeps start_of_day same-day upcoming in bars and categories with headline totals", () => {
  const sameDay = row("today-bill", today, 250, {
    category_id: "cat-bills",
    category_name: "Rachunki",
  });
  const result = buildAnalysisForecast({
    today,
    end: "2026-10-31",
    anchor: { ...anchor, balance_semantics: "start_of_day" },
    rows: [sameDay, ...templates],
    templates,
  })!;
  expect(result.expense).toBe(1750);
  expect(result.bars.reduce((sum, bar) => sum + bar.expense, 0)).toBeCloseTo(result.expense, 2);
  expect(result.categories.some((category) => category.id === "cat-bills")).toBe(true);
  expect(result.categories.find((category) => category.id === "cat-bills")?.amount).toBe(250);
});
