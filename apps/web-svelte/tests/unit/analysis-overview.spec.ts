import { describe, expect, it } from "vitest";
import { buildAnalysisOverview } from "$lib/analysis/overview";
import type { AnalysisFlow } from "$lib/analysis/overview";

const anchor = { opening_amount: 10_000, as_of_date: "2026-09-01" };

function row(
  partial: Partial<AnalysisFlow> & Pick<AnalysisFlow, "id" | "date" | "amount">
): AnalysisFlow {
  return {
    type: "expense",
    status: "paid",
    currency: "PLN",
    categoryId: "food",
    categoryName: "Jedzenie",
    ...partial,
  };
}

describe("analysis overview", () => {
  const rows = [
    row({ id: "aug", date: "2026-08-10", amount: 400, categoryId: "rent", categoryName: "Czynsz" }),
    row({ id: "sep", date: "2026-09-10", amount: 300 }),
    row({ id: "oct", date: "2026-10-04", amount: 200 }),
    row({
      id: "pay",
      date: "2026-10-01",
      amount: 5_000,
      type: "income",
      categoryId: null,
      categoryName: null,
    }),
  ];

  it("keeps a yearly balance chart inside the reliable domain", () => {
    const overview = buildAnalysisOverview({
      span: "year",
      today: "2026-10-13",
      anchor,
      balanceScope: true,
      rows,
    });
    expect(overview.start).toBe("2026-01-01");
    expect(overview.end).toBe("2026-12-31");
    expect(overview.coverage).toBe("clipped");
    expect(overview.chart?.domainStart).toBe("2026-09-01");
    expect(overview.chart?.points?.[0]?.date).not.toBe("2026-01-01");
    expect(overview.income).toBe(5_000);
    expect(overview.expense).toBe(900);
  });

  it("still counts transactions from before the opening balance", () => {
    const overview = buildAnalysisOverview({
      span: "all",
      today: "2026-10-13",
      anchor,
      balanceScope: true,
      rows,
    });
    expect(overview.start).toBe("2026-09-01");
    expect(overview.expense).toBe(500);
    expect(overview.chart?.coverage).toBe("full");
    expect(overview.shifts.some((shift) => shift.id === "rent")).toBe(true);
  });

  it("withholds the balance line without an anchor and before the anchor date", () => {
    const missing = buildAnalysisOverview({
      span: "month",
      today: "2026-10-13",
      anchor: null,
      balanceScope: true,
      rows,
    });
    expect(missing.coverage).toBe("missing");
    expect(missing.chart).toBeNull();
    expect(missing.expense).toBe(200);

    const before = buildAnalysisOverview({
      span: "month",
      today: "2026-08-20",
      anchor,
      balanceScope: true,
      rows,
    });
    expect(before.coverage).toBe("before");
    expect(before.chart).toBeNull();
    expect(before.expense).toBe(400);
  });

  it("does not draw a household balance", () => {
    const overview = buildAnalysisOverview({
      span: "month",
      today: "2026-10-13",
      anchor,
      balanceScope: false,
      rows,
    });
    expect(overview.coverage).toBe("private-only");
    expect(overview.chart).toBeNull();
    expect(overview.categories[0]?.name).toBe("Jedzenie");
  });
});
