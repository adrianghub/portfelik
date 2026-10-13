import {
  buildCockpitForecastChart,
  dateRatio,
  type CockpitChartCoverage,
  type CockpitChartPoint,
  type CockpitForecastChart,
} from "$lib/cockpit/forecast-chart";
import type { CockpitLedgerTx } from "$lib/cockpit/indicators";
import { calendarMonthBounds, calendarMonthFromIso } from "$lib/cockpit/month-window";
import { addLocalDays } from "$lib/date-local";
import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
import { sumMoneyAmounts } from "$lib/money";
import type { CashAnchor } from "$lib/services/cash-position";
import {
  reconstructHistoricalBalances,
  type HistoricalBalancePoint,
} from "$lib/services/reconstruct-balances";

export type AnalysisSpan = "all" | "year" | "month" | "week";

export interface AnalysisFlow {
  id: string;
  type: "income" | "expense";
  amount: number;
  status: string;
  date: string;
  currency: string;
  categoryId: string | null;
  categoryName: string | null;
}

export interface AnalysisBar {
  key: string;
  income: number;
  expense: number;
}

export interface AnalysisCategory {
  id: string;
  name: string;
  amount: number;
  share: number;
}

export interface AnalysisShift {
  id: string;
  name: string;
  delta: number;
}

/** `private-only` means this scope has no single balance to draw. */
export type AnalysisCoverage = CockpitChartCoverage | "private-only";

export interface AnalysisOverview {
  start: string;
  end: string;
  coverage: AnalysisCoverage;
  anchorDate: string | null;
  /** True when the balance line uses history calculated backward from the anchor. */
  reconstructed: boolean;
  chart: CockpitForecastChart | null;
  income: number;
  expense: number;
  bars: AnalysisBar[];
  barKind: "month" | "day";
  categories: AnalysisCategory[];
  shifts: AnalysisShift[];
}

const UNCATEGORIZED = "none";

function day(value: string): string {
  return value.slice(0, 10);
}

function utcDay(iso: string): number {
  const [year, month, date] = day(iso).split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, date) / 86_400_000);
}

function monthKey(iso: string): string {
  return day(iso).slice(0, 7);
}

/** Inclusive window for one analysis span. `all` starts at the anchor, or the first paid day. */
export function analysisWindow(
  span: AnalysisSpan,
  today: string,
  anchorDate: string | null,
  earliest: string | null
): { start: string; end: string } {
  const now = day(today);
  if (span === "week") return { start: addLocalDays(now, -6), end: now };
  if (span === "month") {
    const bounds = calendarMonthBounds(calendarMonthFromIso(now));
    return { start: bounds.monthStart, end: bounds.monthEnd };
  }
  if (span === "year") {
    const year = now.slice(0, 4);
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  return { start: day(anchorDate ?? earliest ?? now), end: now };
}

/** Same length, ending the day before `start`. Used for category shifts. */
export function previousAnalysisWindow(start: string, end: string): { start: string; end: string } {
  const length = Math.max(1, utcDay(end) - utcDay(start) + 1);
  const prevEnd = addLocalDays(start, -1);
  return { start: addLocalDays(prevEnd, -(length - 1)), end: prevEnd };
}

function paid(
  rows: readonly AnalysisFlow[],
  start: string,
  end: string,
  type?: "income" | "expense"
): AnalysisFlow[] {
  return rows.filter((row) => {
    const date = day(row.date);
    return (
      row.status === "paid" &&
      isSupportedLedgerCurrency(row.currency) &&
      date >= start &&
      date <= end &&
      (type == null || row.type === type)
    );
  });
}

function totals(rows: readonly AnalysisFlow[]): { income: number; expense: number } {
  return {
    income: sumMoneyAmounts(rows.filter((row) => row.type === "income")),
    expense: sumMoneyAmounts(rows.filter((row) => row.type === "expense")),
  };
}

function dayBars(rows: readonly AnalysisFlow[], start: string, end: string): AnalysisBar[] {
  const bars: AnalysisBar[] = [];
  for (let date = start; date <= end; date = addLocalDays(date, 1)) {
    bars.push({ key: date, ...totals(paid(rows, date, date)) });
  }
  return bars;
}

function monthBars(rows: readonly AnalysisFlow[], start: string, end: string): AnalysisBar[] {
  const bars: AnalysisBar[] = [];
  let cursor = `${monthKey(start)}-01`;
  const last = monthKey(end);
  while (monthKey(cursor) <= last) {
    const bounds = calendarMonthBounds(calendarMonthFromIso(cursor));
    const from = bounds.monthStart < start ? start : bounds.monthStart;
    const to = bounds.monthEnd > end ? end : bounds.monthEnd;
    bars.push({ key: monthKey(cursor), ...totals(paid(rows, from, to)) });
    cursor = addLocalDays(bounds.monthEnd, 1);
  }
  return bars;
}

function categoryTotals(
  rows: readonly AnalysisFlow[]
): Map<string, { name: string; amount: number }> {
  const totalsById = new Map<string, { name: string; amount: number }>();
  for (const row of rows) {
    if (row.type !== "expense") continue;
    const id = row.categoryId || UNCATEGORIZED;
    const name = row.categoryName?.trim() || "";
    const current = totalsById.get(id);
    if (current) current.amount = sumMoneyAmounts([current, row]);
    else totalsById.set(id, { name, amount: row.amount });
  }
  return totalsById;
}

function categoriesOf(rows: readonly AnalysisFlow[]): AnalysisCategory[] {
  const expense = sumMoneyAmounts(rows.filter((row) => row.type === "expense"));
  return [...categoryTotals(rows).entries()]
    .map(([id, entry]) => ({
      id,
      name: entry.name,
      amount: entry.amount,
      share: expense > 0 ? Math.round((entry.amount / expense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

function shiftsOf(
  current: readonly AnalysisFlow[],
  previous: readonly AnalysisFlow[]
): AnalysisShift[] {
  const before = categoryTotals(previous);
  const now = categoryTotals(current);
  const ids = new Set([...before.keys(), ...now.keys()]);
  const shifts: AnalysisShift[] = [];
  for (const id of ids) {
    const next = now.get(id);
    const prev = before.get(id);
    const delta = sumMoneyAmounts([], (next?.amount ?? 0) - (prev?.amount ?? 0));
    if (delta === 0) continue;
    shifts.push({ id, name: next?.name || prev?.name || "", delta });
  }
  return shifts.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3);
}

function asLedger(rows: readonly AnalysisFlow[]): CockpitLedgerTx[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount,
    status: row.status,
    date: row.date,
    currency: row.currency,
  }));
}

function chartPoint(point: HistoricalBalancePoint): CockpitChartPoint {
  return {
    date: point.date,
    balance: point.amount,
    kind: point.quality === "booked" ? "history" : point.quality,
  };
}

function withTodayRatio(chart: CockpitForecastChart, today: string): CockpitForecastChart {
  const start = chart.domainStart;
  const end = chart.domainEnd;
  return {
    ...chart,
    todayRatio:
      start != null && end != null && today >= start && today <= end
        ? dateRatio(today, start, end)
        : null,
  };
}

/**
 * Prepend balances calculated before the anchor. The cockpit chart still owns
 * the booked and forecast path, so Kokpit's month line stays where it was.
 */
function mergeReconstruction(input: {
  forward: CockpitForecastChart;
  anchor: CashAnchor;
  rows: readonly AnalysisFlow[];
  from: string;
  to: string;
  today: string;
  windowStart: string;
}): { chart: CockpitForecastChart | null; coverage: AnalysisCoverage; reconstructed: boolean } {
  const series = reconstructHistoricalBalances({
    anchor: input.anchor,
    transactions: input.rows,
    from: input.from,
    to: input.to,
  });
  const leadCutoff = input.forward.domainStart ?? "9999-12-31";
  const lead = series.points
    .filter((point) => point.date < leadCutoff && point.date <= input.to)
    .map(chartPoint);
  const reconstructed = lead.some((point) => point.kind === "reconstructed");

  if (input.forward.points && input.forward.domainStart) {
    const rest = input.forward.points.map((point) =>
      point.date === series.confirmedDate && point.kind === "history"
        ? { ...point, kind: "confirmed" as const }
        : point
    );
    const points = [...lead, ...rest];
    const domainStart = points[0]?.date ?? null;
    const domainEnd = points.at(-1)?.date ?? null;
    const coverage: AnalysisCoverage =
      domainStart != null && domainStart > input.windowStart ? "clipped" : "full";
    return {
      chart: withTodayRatio(
        { ...input.forward, points, domainStart, domainEnd, coverage },
        input.today
      ),
      coverage,
      reconstructed,
    };
  }

  if (lead.length < 2) {
    return { chart: null, coverage: input.forward.coverage, reconstructed: false };
  }
  const domainStart = lead[0]?.date ?? null;
  const domainEnd = lead.at(-1)?.date ?? null;
  const coverage: AnalysisCoverage =
    domainStart != null && domainStart > input.windowStart ? "clipped" : "full";
  return {
    chart: withTodayRatio(
      {
        ...input.forward,
        points: lead,
        domainStart,
        domainEnd,
        coverage,
        balance: lead.at(-1)?.balance ?? input.forward.balance,
        forecast: null,
      },
      input.today
    ),
    coverage,
    reconstructed,
  };
}

export function buildAnalysisOverview(input: {
  span: AnalysisSpan;
  today: string;
  anchor: CashAnchor | null;
  /** False for a household or Wszystkie. Flows still count. */
  balanceScope: boolean;
  rows: readonly AnalysisFlow[];
}): AnalysisOverview {
  const today = day(input.today);
  const anchorDate = input.anchor ? day(input.anchor.as_of_date) : null;
  const earliest =
    input.rows
      .filter((row) => row.status === "paid" && isSupportedLedgerCurrency(row.currency))
      .map((row) => day(row.date))
      .sort()[0] ?? null;
  const window = analysisWindow(input.span, today, anchorDate, earliest);
  const current = paid(input.rows, window.start, window.end);
  const previous = previousAnalysisWindow(window.start, window.end);
  const prior = paid(input.rows, previous.start, previous.end);
  const money = totals(current);
  const barKind = input.span === "week" ? "day" : "month";

  let coverage: AnalysisCoverage;
  let chart: CockpitForecastChart | null = null;
  let reconstructed = false;
  if (!input.balanceScope) {
    coverage = "private-only";
  } else if (!input.anchor || !anchorDate) {
    coverage = "missing";
  } else {
    const balanceFrom =
      input.span === "all" && earliest != null && earliest < window.start
        ? addLocalDays(earliest, -1)
        : window.start;
    const forward = buildCockpitForecastChart({
      scope: { kind: "private" },
      anchor: input.anchor,
      transactions: asLedger(input.rows),
      items: [],
      links: [],
      today,
      monthStart: window.start,
      monthEnd: window.end,
    });
    const merged = mergeReconstruction({
      forward,
      anchor: input.anchor,
      rows: input.rows,
      from: balanceFrom,
      to: today < window.end ? today : window.end,
      today,
      windowStart: window.start,
    });
    chart = merged.chart;
    coverage = merged.coverage;
    reconstructed = merged.reconstructed;
  }

  return {
    start: window.start,
    end: window.end,
    coverage,
    anchorDate,
    reconstructed,
    chart,
    income: money.income,
    expense: money.expense,
    bars:
      barKind === "day"
        ? dayBars(input.rows, window.start, window.end)
        : monthBars(input.rows, window.start, window.end),
    barKind,
    categories: categoriesOf(current),
    shifts: shiftsOf(current, prior),
  };
}
