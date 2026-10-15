import { describe, expect, it } from "vitest";
import { buildAnalysisMonthDetail } from "$lib/analysis/month-detail";

describe("buildAnalysisMonthDetail", () => {
  it("reports opening, closing, flows and trough for a month", () => {
    const detail = buildAnalysisMonthDetail({
      monthKey: "2026-10",
      points: [
        { date: "2026-09-30", balance: 1000 },
        { date: "2026-10-01", balance: 1000 },
        { date: "2026-10-10", balance: 400 },
        { date: "2026-10-31", balance: 700 },
      ],
      bars: [
        { start: "2026-10-01", end: "2026-10-08", income: 100, expense: 200 },
        { start: "2026-10-08", end: "2026-11-01", income: 50, expense: 250 },
      ],
    });
    expect(detail).toMatchObject({
      opening: 1000,
      closing: 700,
      income: 150,
      expense: 450,
      net: -300,
      lowest: { date: "2026-10-10", balance: 400 },
    });
  });
});
