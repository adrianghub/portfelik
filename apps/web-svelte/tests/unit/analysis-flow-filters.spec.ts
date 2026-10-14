import { describe, expect, it } from "vitest";
import {
  analysisTransactionsUrl,
  buildAnalysisOverview,
  type AnalysisFlow,
} from "$lib/analysis/overview";

const rows: AnalysisFlow[] = [
  {
    id: "prior",
    date: "2026-09-20",
    amount: 40,
    type: "expense",
    status: "paid",
    currency: "PLN",
    categoryId: "food",
    categoryName: "Jedzenie",
  },
  {
    id: "food",
    date: "2026-10-01",
    amount: 100.01,
    type: "expense",
    status: "paid",
    currency: "PLN",
    categoryId: "food",
    categoryName: "Jedzenie",
  },
  {
    id: "transport",
    date: "2026-10-02",
    amount: 200.02,
    type: "expense",
    status: "paid",
    currency: "PLN",
    categoryId: "transport",
    categoryName: "Transport",
  },
  {
    id: "pay",
    date: "2026-10-03",
    amount: 1000,
    type: "income",
    status: "paid",
    currency: "PLN",
    categoryId: "salary",
    categoryName: "Wypłata",
  },
];
const input = {
  span: "month" as const,
  today: "2026-10-13",
  anchor: {
    opening_amount: 10000,
    as_of_date: "2026-10-13",
    balance_semantics: "end_of_day" as const,
  },
  balanceScope: true,
  rows,
};

describe("analysis flow categories and grouping", () => {
  it("filters money and the previous period without changing any balance point", () => {
    const all = buildAnalysisOverview(input);
    const food = buildAnalysisOverview({ ...input, categoryIds: new Set(["food"]) });
    expect(food.income).toBe(0);
    expect(food.expense).toBe(100.01);
    expect(food.previousExpense).toBe(40);
    expect(food.chart?.points).toEqual(all.chart?.points);
    expect(all.balanceChange).toBe(699.97);
    expect(food.balanceChange).toBe(all.balanceChange);
    const both = buildAnalysisOverview({ ...input, categoryIds: new Set(["food", "transport"]) });
    expect(both.expense).toBe(300.03);
    expect(both.chart?.points).toEqual(all.chart?.points);
  });
  it("keeps inclusive partial weekly buckets and preserves grosze", () => {
    const weekly = buildAnalysisOverview({ ...input, grouping: "week" });
    expect(weekly.barKind).toBe("week");
    expect(weekly.bars).toEqual([
      { key: "2026-10-01", start: "2026-10-01", end: "2026-10-07", income: 1000, expense: 300.03 },
      { key: "2026-10-08", start: "2026-10-08", end: "2026-10-13", income: 0, expense: 0 },
    ]);
  });
  it("adapts grouping to the report and supports an explicit monthly override", () => {
    expect(buildAnalysisOverview({ ...input, span: "30days" }).barKind).toBe("day");
    expect(buildAnalysisOverview({ ...input, span: "90days" }).barKind).toBe("week");
    expect(buildAnalysisOverview({ ...input, grouping: "month" }).bars).toHaveLength(1);
  });
  it("uses matching transfer legs without inflating the total private balance", () => {
    const transferRows = [
      ...rows,
      { ...rows[1], id: "transfer-out", date: "2026-10-10", amount: 500 },
      { ...rows[1], id: "transfer-in", date: "2026-10-10", amount: 500, type: "income" as const },
    ];
    expect(buildAnalysisOverview({ ...input, rows: transferRows }).chart?.points).toEqual(
      buildAnalysisOverview(input).chart?.points
    );
  });
});

it("links to booked transactions with the exact range, scope and category set", () => {
  const range = { start: "2026-10-01", end: "2026-10-07" };
  const url = new URL(
    analysisTransactionsUrl(range, "own", ["transport", "food"]),
    "https://example.test"
  );
  expect(url.searchParams.get("startDate")).toBe(range.start);
  expect(url.searchParams.get("endDate")).toBe(range.end);
  expect(url.searchParams.get("group")).toBe("own");
  expect(url.searchParams.get("status")).toBe("paid");
  expect(url.searchParams.get("currency")).toBe("PLN");
  expect(url.searchParams.get("categoryIds")).toBe("food,transport");
  expect(analysisTransactionsUrl(range, "all", ["none"])).toContain("categoryIds=none");
});
