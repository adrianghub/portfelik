import { describe, expect, it } from "vitest";
import { buildAnalysisMonthDetail } from "$lib/analysis/month-detail";

describe("buildAnalysisMonthDetail", () => {
  it("reports opening from the preceding day and flows by transaction date", () => {
    const detail = buildAnalysisMonthDetail({
      monthKey: "2026-10",
      points: [
        { date: "2026-09-30", balance: 1000 },
        { date: "2026-10-01", balance: 1000 },
        { date: "2026-10-10", balance: 400 },
        { date: "2026-10-31", balance: 700 },
      ],
      flows: [
        { date: "2026-10-02", type: "income", amount: 100 },
        { date: "2026-10-03", type: "expense", amount: 200 },
        { date: "2026-10-20", type: "income", amount: 50 },
        { date: "2026-10-25", type: "expense", amount: 250 },
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

  it("leaves opening unknown when the day before the month is missing", () => {
    const detail = buildAnalysisMonthDetail({
      monthKey: "2026-10",
      points: [
        { date: "2026-10-01", balance: 900 },
        { date: "2026-10-15", balance: 700 },
      ],
      flows: [{ date: "2026-10-02", type: "expense", amount: 200 }],
    });
    expect(detail?.opening).toBeNull();
    expect(detail?.closing).toBe(700);
    expect(detail?.expense).toBe(200);
  });

  it("keeps cross-month weeks from leaking into the selected month", () => {
    const detail = buildAnalysisMonthDetail({
      monthKey: "2026-11",
      points: [
        { date: "2026-10-31", balance: 500 },
        { date: "2026-11-01", balance: 400 },
        { date: "2026-11-30", balance: 450 },
      ],
      flows: [
        { date: "2026-10-30", type: "expense", amount: 100 },
        { date: "2026-11-02", type: "expense", amount: 40 },
        { date: "2026-11-03", type: "income", amount: 90 },
      ],
    });
    expect(detail).toMatchObject({
      opening: 500,
      income: 90,
      expense: 40,
      net: 50,
    });
  });
});
