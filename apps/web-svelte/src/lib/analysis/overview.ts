import {
  dateRatio,
  type CockpitChartCoverage,
  type CockpitChartPoint,
  type CockpitForecastChart,
} from "$lib/cockpit/forecast-chart";
import { calendarMonthBounds, calendarMonthFromIso } from "$lib/cockpit/month-window";
import { addLocalDays } from "$lib/date-local";
import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
import { sumMoneyAmounts } from "$lib/money";
import type { CashAnchor } from "$lib/services/cash-position";
import {
  reconstructHistoricalBalances,
  type HistoricalBalancePoint,
} from "$lib/services/reconstruct-balances";

export type AnalysisSpan = "all" | "year" | "month" | "week" | "30days" | "90days" | "custom";

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

export function validAnalysisRange(range: { start: string; end: string }, today: string): boolean {
  const valid = (date: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  return valid(range.start) && valid(range.end) && range.start <= range.end && range.end <= today;
}

/** Historical windows are inclusive and never extend beyond today. */
export function analysisWindow(
  span: AnalysisSpan,
  today: string,
  anchorDate: string | null,
  earliest: string | null,
  custom?: { start: string; end: string } | null
): { start: string; end: string } {
  const now = day(today);
  if (span === "custom" && custom && validAnalysisRange(custom, now)) return custom;
  if (span === "30days" || span === "custom") return { start: addLocalDays(now, -29), end: now };
  if (span === "90days") return { start: addLocalDays(now, -89), end: now };
  if (span === "week") return { start: addLocalDays(now, -6), end: now };
  if (span === "month") {
    const bounds = calendarMonthBounds(calendarMonthFromIso(now));
    return { start: bounds.monthStart, end: now };
  }
  if (span === "year") {
    const year = now.slice(0, 4);
    return { start: `${year}-01-01`, end: now };
  }
  return {
    start: [anchorDate, earliest ? addLocalDays(earliest, -1) : null, now]
      .filter((date): date is string => !!date)
      .sort()[0],
    end: now,
  };
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

function chartPoint(point: HistoricalBalancePoint): CockpitChartPoint {
  return {
    date: point.date,
    balance: point.amount,
    kind: point.quality === "booked" ? "history" : point.quality,
  };
}

export function buildAnalysisOverview(input: {
  span: AnalysisSpan;
  today: string;
  anchor: CashAnchor | null;
  /** False for a household or Wszystkie. Flows still count. */
  balanceScope: boolean;
  rows: readonly AnalysisFlow[];
  customRange?: { start: string; end: string } | null;
}): AnalysisOverview {
  const today = day(input.today);
  const anchorDate = input.anchor ? day(input.anchor.as_of_date) : null;
  const earliest =
    input.rows
      .filter((row) => row.status === "paid" && isSupportedLedgerCurrency(row.currency))
      .map((row) => day(row.date))
      .sort()[0] ?? null;
  const window = analysisWindow(input.span, today, anchorDate, earliest, input.customRange);
  const current = paid(input.rows, window.start, window.end);
  const previous = previousAnalysisWindow(window.start, window.end);
  const prior = paid(input.rows, previous.start, previous.end);
  const money = totals(current);
  const barKind = utcDay(window.end) - utcDay(window.start) < 92 ? "day" : "month";

  let coverage: AnalysisCoverage;
  let chart: CockpitForecastChart | null = null;
  let reconstructed = false;
  if (!input.balanceScope) {
    coverage = "private-only";
  } else if (!input.anchor || !anchorDate) {
    coverage = "missing";
  } else {
    const series = reconstructHistoricalBalances({
      anchor: input.anchor,
      transactions: input.rows.filter((row) => day(row.date) <= today),
      from: window.start,
      to: window.end,
      daily: true,
    });
    const points = series.points.map(chartPoint);
    const domainStart = points[0]?.date ?? null;
    const domainEnd = points.at(-1)?.date ?? null;
    reconstructed = series.reconstructed;
    coverage = domainStart == null ? "before" : domainStart > window.start ? "clipped" : "full";
    if (points.length > 0)
      chart = {
        points,
        domainStart,
        domainEnd,
        coverage,
        todayRatio:
          domainStart && domainEnd && today >= domainStart && today <= domainEnd
            ? dateRatio(today, domainStart, domainEnd)
            : null,
        balance: points.at(-1)?.balance ?? null,
        forecast: null,
        spent: null,
        comparison: null,
      };
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
