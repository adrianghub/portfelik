import { describe, expect, it } from "vitest";
import { buildAnalysisOverview, validAnalysisRange } from "$lib/analysis/overview";
import type { AnalysisFlow } from "$lib/analysis/overview";
import { cockpitMonthIndicators } from "$lib/cockpit/month";
import { livePosition, type PositionTx } from "$lib/services/cash-position";

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
    expect(overview.end).toBe("2026-10-13");
    expect(overview.coverage).toBe("clipped");
    expect(overview.chart?.domainStart).toBe("2026-08-09");
    expect(overview.chart?.points?.[0]?.kind).toBe("reconstructed");
    expect(overview.chart?.points?.[0]?.balance).toBe(10_400);
    expect(overview.chart?.points?.some((point) => point.date === "2026-01-01")).toBe(false);
    expect(overview.reconstructed).toBe(true);
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
    expect(overview.start).toBe("2026-08-09");
    expect(overview.expense).toBe(900);
    expect(overview.chart?.domainStart).toBe("2026-08-09");
    expect(overview.chart?.coverage).toBe("full");
    expect(overview.reconstructed).toBe(true);
    expect(overview.previousAvailable).toBe(false);
    expect(overview.shifts).toEqual([]);
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
    expect(missing.reconstructed).toBe(false);

    const before = buildAnalysisOverview({
      span: "month",
      today: "2026-08-20",
      anchor,
      balanceScope: true,
      rows,
    });
    expect(before.coverage).toBe("clipped");
    expect(before.chart?.points?.[0]?.date).toBe("2026-08-09");
    expect(before.chart?.points?.every((point) => point.kind === "reconstructed")).toBe(true);
    expect(before.expense).toBe(400);
    expect(before.reconstructed).toBe(true);
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

describe("confirmed balance across analysis spans", () => {
  const today = "2026-10-13";
  const anchor = {
    opening_amount: 12_000,
    as_of_date: today,
    balance_semantics: "end_of_day" as const,
  };
  const rows = [
    row({ id: "jul", date: "2026-07-31", amount: 1_500, type: "income" }),
    row({ id: "aug", date: "2026-08-31", amount: 700 }),
    row({ id: "sep", date: "2026-09-30", amount: 1_200, type: "income" }),
    row({ id: "oct", date: "2026-10-13", amount: 1_000, type: "income" }),
    row({ id: "plan", date: "2026-10-21", amount: 500, status: "upcoming" }),
  ];

  function balanceOn(span: "all" | "year" | "month" | "week", date: string) {
    const overview = buildAnalysisOverview({
      span,
      today,
      anchor,
      balanceScope: true,
      rows,
    });
    return overview.chart?.points?.find((point) => point.date === date);
  }

  it("keeps one continuous history from the first known day through today", () => {
    const overview = buildAnalysisOverview({
      span: "all",
      today,
      anchor,
      balanceScope: true,
      rows,
    });
    const points = overview.chart?.points ?? [];
    expect(points.length).toBeGreaterThan(1);
    expect(points[0]).toMatchObject({ date: "2026-07-30", balance: 9_000, kind: "reconstructed" });
    expect(balanceOn("all", "2026-07-31")).toMatchObject({
      balance: 10_500,
      kind: "reconstructed",
    });
    expect(balanceOn("all", "2026-08-31")).toMatchObject({ balance: 9_800, kind: "reconstructed" });
    expect(balanceOn("all", "2026-09-30")).toMatchObject({
      balance: 11_000,
      kind: "reconstructed",
    });
    expect(points.at(-1)).toMatchObject({ date: today, balance: 12_000, kind: "confirmed" });
    expect(points.some((point) => point.kind === "forecast")).toBe(false);
    expect(points.some((point) => point.date < "2026-07-30")).toBe(false);
  });

  it("draws a week and a month from the carried balance instead of a single dot", () => {
    const week = buildAnalysisOverview({
      span: "week",
      today,
      anchor,
      balanceScope: true,
      rows,
    });
    expect(week.chart?.points?.[0]).toMatchObject({
      date: "2026-10-07",
      balance: 11_000,
      kind: "reconstructed",
    });
    expect(week.chart?.points?.at(-1)).toMatchObject({
      date: today,
      balance: 12_000,
      kind: "confirmed",
    });
    expect(week.chart?.points?.some((point) => point.kind === "forecast")).toBe(false);

    const month = buildAnalysisOverview({
      span: "month",
      today,
      anchor,
      balanceScope: true,
      rows,
    });
    expect(month.chart?.points?.[0]).toMatchObject({
      date: "2026-10-01",
      balance: 11_000,
      kind: "reconstructed",
    });
    expect(month.chart?.points?.find((point) => point.date === today)?.kind).toBe("confirmed");
    expect(month.chart?.points?.at(-1)).toMatchObject({
      date: today,
      balance: 12_000,
      kind: "confirmed",
    });
  });

  it("starts the year at the first known day and stops at today", () => {
    const year = buildAnalysisOverview({
      span: "year",
      today,
      anchor,
      balanceScope: true,
      rows,
    });
    expect(year.chart?.domainStart).toBe("2026-07-30");
    expect(year.chart?.points?.some((point) => point.date === "2026-01-01")).toBe(false);
    expect(year.chart?.points?.at(-1)).toMatchObject({
      date: today,
      balance: 12_000,
      kind: "confirmed",
    });
    const history = year.chart?.points?.filter((point) => point.kind !== "forecast") ?? [];
    expect(history.every((point) => point.date <= today)).toBe(true);
  });
});

describe("legacy opening balance stays on the pre-change formula", () => {
  const anchor = { opening_amount: 10_000, as_of_date: "2026-09-01" };
  const rows: PositionTx[] = [
    { type: "expense", amount: 100, status: "paid", date: "2026-09-01", currency: "PLN" },
    { type: "expense", amount: 400, status: "paid", date: "2026-10-02", currency: "PLN" },
    { type: "expense", amount: 250, status: "upcoming", date: "2026-10-20", currency: "PLN" },
  ];

  function previousLive(txs: readonly PositionTx[]): number {
    const cents = txs
      .filter(
        (tx) =>
          tx.currency === "PLN" && tx.status === "paid" && tx.date.slice(0, 10) >= anchor.as_of_date
      )
      .reduce((sum, tx) => sum + Math.round(tx.amount * 100) * (tx.type === "income" ? 1 : -1), 0);
    return (Math.round(anchor.opening_amount * 100) + cents) / 100;
  }

  it("matches Cockpit and Transactions for an unedited start-of-day row", () => {
    expect(previousLive(rows)).toBe(9_500);
    expect(livePosition(anchor, rows)).toBe(9_500);
    expect(livePosition({ ...anchor, balance_semantics: "start_of_day" }, rows)).toBe(9_500);
    expect(livePosition({ ...anchor, balance_semantics: null }, rows)).toBe(9_500);
    expect(livePosition({ ...anchor, balance_semantics: "end_of_day" }, rows)).toBe(9_600);

    const flows: AnalysisFlow[] = rows.map((tx, index) => ({
      id: String(index),
      type: tx.type,
      amount: tx.amount,
      status: tx.status,
      date: tx.date,
      currency: tx.currency,
      categoryId: null,
      categoryName: null,
    }));
    const cockpit = cockpitMonthIndicators({
      scope: { kind: "private" },
      anchor,
      transactions: flows.map((flow) => ({ ...flow, id: flow.id })),
      items: [],
      links: [],
      today: "2026-10-13",
      monthStart: "2026-10-01",
      monthEnd: "2026-10-31",
    });
    const analysis = buildAnalysisOverview({
      span: "month",
      today: "2026-10-13",
      anchor,
      balanceScope: true,
      rows: flows,
    });
    expect(cockpit.balance).toBe(9_500);
    expect(cockpit.forecast).toBe(9_250);
    expect(analysis.chart?.points?.at(-1)).toMatchObject({
      date: "2026-10-13",
      balance: 9_500,
      kind: "history",
    });
    expect(analysis.chart?.points?.find((point) => point.date === "2026-10-13")?.kind).not.toBe(
      "forecast"
    );
  });
});

describe("historical date exploration", () => {
  const anchor = {
    opening_amount: -100,
    as_of_date: "2026-10-13",
    balance_semantics: "end_of_day" as const,
  };
  const rows = [
    row({ id: "first", date: "2026-08-01", amount: 1000, type: "income" }),
    row({ id: "later", date: "2026-09-10", amount: 25.55 }),
    row({ id: "today", date: "2026-10-13", amount: 1.01 }),
  ];
  it("samples quiet days, keeps negative balances and does not invent January history", () => {
    const overview = buildAnalysisOverview({
      span: "custom",
      customRange: { start: "2026-01-01", end: "2026-09-30" },
      today: "2026-10-13",
      anchor,
      balanceScope: true,
      rows,
    });
    expect(overview.chart?.domainStart).toBe("2026-07-31");
    expect(overview.chart?.domainEnd).toBe("2026-09-30");
    expect(overview.balanceChange).toBeNull();
    expect(overview.chart?.points?.find((point) => point.date === "2026-09-15")?.balance).toBe(
      -98.99
    );
    expect(overview.chart?.points?.every((point) => point.date <= "2026-09-30")).toBe(true);
  });
  it("uses daily bars for a month and isolates booked history from scheduled rows", () => {
    const overview = buildAnalysisOverview({
      span: "30days",
      today: "2026-10-13",
      anchor,
      balanceScope: true,
      rows: [
        ...rows,
        row({ id: "scheduled", date: "2026-10-12", amount: 10000, status: "upcoming" }),
      ],
    });
    expect(overview.barKind).toBe("day");
    expect(overview.bars).toHaveLength(30);
    expect(overview.chart?.points?.at(-1)?.balance).toBe(-100);
    expect(overview.chart?.forecast).toBeNull();
  });
});

it("rejects reversed, future and invalid calendar ranges", () => {
  expect(validAnalysisRange({ start: "2026-10-12", end: "2026-10-01" }, "2026-10-14")).toBe(false);
  expect(validAnalysisRange({ start: "2026-10-12", end: "2026-10-15" }, "2026-10-14")).toBe(false);
  expect(validAnalysisRange({ start: "2026-02-30", end: "2026-10-14" }, "2026-10-14")).toBe(false);
  expect(validAnalysisRange({ start: "2026-10-14", end: "2026-10-14" }, "2026-10-14")).toBe(true);
});
