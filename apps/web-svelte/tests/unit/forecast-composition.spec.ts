import { describe, expect, it } from "vitest";
import { composeForecastExplanation } from "$lib/services/forecast-composition";

describe("composeForecastExplanation", () => {
  const anchor = {
    opening_amount: 1000,
    as_of_date: "2026-10-01",
    balance_semantics: "end_of_day" as const,
  };

  it("excludes pre-anchor overdue income from the forecast breakdown", () => {
    const composition = composeForecastExplanation({
      anchor,
      today: "2026-10-15",
      horizonEnd: "2026-10-31",
      forecastRows: [
        {
          type: "income",
          amount: 500,
          status: "overdue",
          date: "2026-09-15",
          currency: "PLN",
        },
        {
          type: "expense",
          amount: 200,
          status: "upcoming",
          date: "2026-10-20",
          currency: "PLN",
        },
        {
          type: "income",
          amount: 100,
          status: "paid",
          date: "2026-10-05",
          currency: "PLN",
        },
      ],
    });
    expect(composition.upcomingIncome).toBe(0);
    expect(composition.upcomingExpenses).toBe(200);
    expect(composition.balanceToday).toBe(1100);
    expect(composition.result).toBe(900);
  });
});
