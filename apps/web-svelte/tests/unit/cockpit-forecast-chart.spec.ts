import { describe, expect, it } from "vitest";
import { buildCockpitForecastChart, dateRatio, scrubAtRatio } from "$lib/cockpit/forecast-chart";
import { cockpitMonthIndicators, type CockpitMonthInput } from "$lib/cockpit/month";

const october = { monthStart: "2026-10-01", monthEnd: "2026-10-31" };
const anchor = { opening_amount: 10_000, as_of_date: "2026-10-01" };

function input(overrides: Partial<CockpitMonthInput> = {}): CockpitMonthInput {
  return {
    scope: { kind: "private" },
    anchor,
    transactions: [
      {
        id: "rent",
        type: "expense",
        amount: 1_000,
        status: "paid",
        date: "2026-10-05",
        currency: "PLN",
      },
      {
        id: "groceries",
        type: "expense",
        amount: 500,
        status: "paid",
        date: "2026-10-10",
        currency: "PLN",
      },
      {
        id: "power",
        type: "expense",
        amount: 2_000,
        status: "upcoming",
        date: "2026-10-20",
        currency: "PLN",
      },
    ],
    items: [],
    links: [],
    today: "2026-10-12",
    ...october,
    ...overrides,
  };
}

describe("cockpit forecast chart", () => {
  it("places today from the same day offset the axis uses", () => {
    expect(dateRatio("2026-10-01", "2026-10-01", "2026-10-31")).toBe(0);
    expect(dateRatio("2026-10-31", "2026-10-01", "2026-10-31")).toBe(1);
    expect(dateRatio("2026-10-12", "2026-10-01", "2026-10-31")).toBeCloseTo(11 / 30);
  });

  it("draws paid history and a straight run to the known end when nothing else is dated", () => {
    const chart = buildCockpitForecastChart(
      input({
        transactions: [
          {
            id: "rent",
            type: "expense",
            amount: 1_000,
            status: "paid",
            date: "2026-10-05",
            currency: "PLN",
          },
        ],
      })
    );
    expect(chart.points?.map((point) => point.date)).toEqual([
      "2026-10-01",
      "2026-10-05",
      "2026-10-12",
      "2026-10-31",
    ]);
    expect(chart.points?.map((point) => point.kind)).toEqual([
      "history",
      "history",
      "history",
      "forecast",
    ]);
    expect(chart.points?.at(-1)?.balance).toBe(9_000);
    expect(chart.todayRatio).toBeCloseTo(11 / 30);
  });

  it("bends the future only on a dated obligation", () => {
    const chart = buildCockpitForecastChart(input());
    expect(chart.points?.map((point) => point.date)).toEqual([
      "2026-10-01",
      "2026-10-05",
      "2026-10-10",
      "2026-10-12",
      "2026-10-20",
      "2026-10-31",
    ]);
    expect(chart.points?.find((point) => point.date === "2026-10-12")?.balance).toBe(8_500);
    expect(chart.points?.find((point) => point.date === "2026-10-20")?.balance).toBe(6_500);
    expect(chart.points?.filter((point) => point.date === "2026-10-15")).toEqual([]);
    expect(chart.points?.at(-1)?.balance).toBe(cockpitMonthIndicators(input()).forecast);
  });

  it("does not invent a line or a zero without an opening balance", () => {
    const chart = buildCockpitForecastChart(input({ anchor: null }));
    expect(chart.points).toBeNull();
    expect(chart.forecast).toBeNull();
    expect(chart.balance).toBeNull();
    expect(chart.forecast).not.toBe(0);
    expect(chart.balance).not.toBe(0);
  });

  it("keeps a negative forecast signed", () => {
    const chart = buildCockpitForecastChart(
      input({
        anchor: { opening_amount: 100, as_of_date: "2026-10-01" },
        transactions: [
          {
            id: "bill",
            type: "expense",
            amount: 400,
            status: "upcoming",
            date: "2026-10-20",
            currency: "PLN",
          },
        ],
      })
    );
    expect(chart.balance).toBe(100);
    expect(chart.forecast).toBe(-300);
    expect(chart.points?.at(-1)?.balance).toBe(-300);
  });

  it("compares this month with the same days of the previous month", () => {
    const chart = buildCockpitForecastChart(
      input({
        anchor: { opening_amount: 10_000, as_of_date: "2026-09-01" },
        transactions: [
          {
            id: "sep",
            type: "expense",
            amount: 1_000,
            status: "paid",
            date: "2026-09-08",
            currency: "PLN",
          },
          {
            id: "oct",
            type: "expense",
            amount: 800,
            status: "paid",
            date: "2026-10-06",
            currency: "PLN",
          },
          {
            id: "oct-late",
            type: "expense",
            amount: 5_000,
            status: "paid",
            date: "2026-10-20",
            currency: "PLN",
          },
        ],
      })
    );
    expect(chart.spent).toBe(800);
    expect(chart.comparison).toEqual({ percent: -20, month: 9 });
  });

  it("hides the comparison when the previous month is too small or uncovered", () => {
    const small = buildCockpitForecastChart(
      input({
        anchor: { opening_amount: 10_000, as_of_date: "2026-09-01" },
        transactions: [
          {
            id: "sep",
            type: "expense",
            amount: 40,
            status: "paid",
            date: "2026-09-03",
            currency: "PLN",
          },
          {
            id: "oct",
            type: "expense",
            amount: 800,
            status: "paid",
            date: "2026-10-06",
            currency: "PLN",
          },
        ],
      })
    );
    expect(small.comparison).toBeNull();

    const lateAnchor = buildCockpitForecastChart(input());
    expect(lateAnchor.comparison).toBeNull();
  });

  it("marks a scrub past today as forecast", () => {
    const chart = buildCockpitForecastChart(input());
    const history = scrubAtRatio(chart.points ?? [], 11 / 30, october.monthStart, october.monthEnd);
    const future = scrubAtRatio(chart.points ?? [], 0.7, october.monthStart, october.monthEnd);
    expect(history?.forecast).toBe(false);
    expect(history?.point.date).toBe("2026-10-12");
    expect(future?.forecast).toBe(true);
    expect(future?.point.date).toBe("2026-10-20");
  });
});
