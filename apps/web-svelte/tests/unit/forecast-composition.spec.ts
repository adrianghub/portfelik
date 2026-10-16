import { describe, expect, it } from "vitest";
import {
  composeForecastExplanation,
  compositionRemainderPlanIds,
  forecastCompositionHref,
} from "$lib/services/forecast-composition";

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
    expect(composition.ledgerUpcomingExpenses).toBe(200);
    expect(composition.planRemainders).toBe(0);
    expect(composition.balanceToday).toBe(1100);
    expect(composition.openingAmount).toBe(1000);
    expect(composition.paidIncome).toBe(100);
    expect(composition.paidExpenses).toBe(0);
    expect(composition.openFrom).toBe("2026-10-02");
    expect(composition.horizonEnd).toBe("2026-10-31");
    expect(composition.result).toBe(900);
  });

  it("splits confirmed plan remainders from ledger upcoming expenses", () => {
    const composition = composeForecastExplanation({
      anchor,
      today: "2026-10-15",
      horizonEnd: "2026-10-31",
      forecastRows: [
        {
          type: "expense",
          amount: 150,
          status: "upcoming",
          date: "2026-10-18",
          currency: "PLN",
          id: "tx-rent",
        },
        {
          id: "spend-remainder:item-1",
          type: "expense",
          amount: 400,
          status: "upcoming",
          date: "2026-10-22",
          currency: "PLN",
        },
      ],
    });
    expect(composition.ledgerUpcomingExpenses).toBe(150);
    expect(composition.planRemainders).toBe(400);
    expect(composition.upcomingExpenses).toBe(550);
    expect(composition.result).toBe(1000 - 550);
  });
});

describe("forecastCompositionHref", () => {
  it("builds a transactions URL matching the composition window", () => {
    expect(
      forecastCompositionHref({
        openFrom: "2026-10-02",
        end: "2026-10-31",
        status: "upcoming,overdue",
        type: "expense",
      })
    ).toBe(
      "/transactions?startDate=2026-10-02&endDate=2026-10-31&group=own&status=upcoming%2Coverdue&type=expense"
    );
  });
});

describe("compositionRemainderPlanIds", () => {
  it("keeps only plans whose remainders fall inside the composition window", () => {
    const planIds = compositionRemainderPlanIds({
      openFrom: "2026-10-02",
      horizonEnd: "2026-10-31",
      today: "2026-10-15",
      forecastTransactionIds: new Set(),
      items: [
        {
          id: "oct",
          planId: "plan-oct",
          amount: 500,
          dueDate: "2026-10-20",
          status: "confirmed",
          groupId: null,
        },
        {
          id: "dec",
          planId: "plan-dec",
          amount: 800,
          dueDate: "2026-12-05",
          status: "confirmed",
          groupId: null,
        },
      ],
      links: [],
    });
    expect(planIds).toEqual(["plan-oct"]);
  });
});
