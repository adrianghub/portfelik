import {
  dateRatio,
  type CockpitChartCoverage,
  type CockpitChartPoint,
  type CockpitForecastChart,
} from "$lib/cockpit/forecast-chart";
import { calendarMonthBounds, calendarMonthFromIso } from "$lib/cockpit/month-window";
import { addLocalDays } from "$lib/date-local";
import { isSupportedLedgerCurrency, SUPPORTED_LEDGER_CURRENCY } from "$lib/ledger-currency";
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
  start: string;
  end: string;
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
  /** Opening of the first day to closing of the last, never a category-filtered delta. */
  balanceChange: number | null;
  income: number;
  expense: number;
  /** Dated paid flows used for bars and month detail (category-filtered). */
  flows: AnalysisFlow[];
  bars: AnalysisBar[];
  barKind: "month" | "week" | "day";
  previousIncome: number;
  previousExpense: number;
  previousAvailable: boolean;
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

export function analysisBarKind(
  start: string,
  end: string,
  grouping: "auto" | "day" | "week" | "month" = "auto"
): AnalysisOverview["barKind"] {
  if (grouping !== "auto") return grouping;
  const length = utcDay(end) - utcDay(start) + 1;
  return length <= 31 ? "day" : length <= 92 ? "week" : "month";
}

export function buildAnalysisFlowBars(
  rows: readonly AnalysisFlow[],
  start: string,
  end: string,
  kind: AnalysisOverview["barKind"]
): AnalysisBar[] {
  const bars = new Map<string, AnalysisBar>();
  let cursor = start;
  while (cursor <= end) {
    const last =
      kind === "month"
        ? calendarMonthBounds(calendarMonthFromIso(cursor)).monthEnd
        : kind === "week"
          ? addLocalDays(cursor, 6)
          : cursor;
    const to = last > end ? end : last;
    const key = kind === "month" ? monthKey(cursor) : cursor;
    bars.set(key, { key, start: cursor, end: to, income: 0, expense: 0 });
    cursor = addLocalDays(to, 1);
  }
  for (const row of rows) {
    const key =
      kind === "month"
        ? monthKey(row.date)
        : kind === "week"
          ? addLocalDays(start, Math.floor((utcDay(row.date) - utcDay(start)) / 7) * 7)
          : day(row.date);
    const bar = bars.get(key);
    if (!bar) continue;
    bar[row.type] = sumMoneyAmounts([row], bar[row.type]);
  }
  return [...bars.values()];
}

/** Drill-down preserves the inclusive range, scope, booked status and category selection. */
export function analysisTransactionsUrl(
  range: { start: string; end: string },
  scope: string,
  categoryIds: Iterable<string> = [],
  status = "paid",
  returnTo?: string | null
): string {
  const params = new URLSearchParams({
    startDate: range.start,
    endDate: range.end,
    group: scope,
    status,
    currency: SUPPORTED_LEDGER_CURRENCY,
  });
  const ids = [...categoryIds].sort();
  if (ids.length === 1 && ids[0] !== "none") params.set("categoryId", ids[0]);
  else if (ids.length > 0) params.set("categoryIds", ids.join(","));
  if (returnTo && returnTo.startsWith("/analysis")) params.set("returnTo", returnTo);
  return `/transactions?${params}`;
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

export function buildAnalysisCategories(rows: readonly AnalysisFlow[]): AnalysisCategory[] {
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
  categoryIds?: ReadonlySet<string>;
  grouping?: "auto" | "day" | "week" | "month";
}): AnalysisOverview {
  const today = day(input.today);
  const anchorDate = input.anchor ? day(input.anchor.as_of_date) : null;
  const earliest =
    input.rows
      .filter((row) => row.status === "paid" && isSupportedLedgerCurrency(row.currency))
      .map((row) => day(row.date))
      .sort()[0] ?? null;
  const window = analysisWindow(input.span, today, anchorDate, earliest, input.customRange);
  const matchesCategory = (row: AnalysisFlow) =>
    !input.categoryIds?.size || input.categoryIds.has(row.categoryId || UNCATEGORIZED);
  const current = paid(input.rows, window.start, window.end).filter(matchesCategory);
  const previous = previousAnalysisWindow(window.start, window.end);
  const previousRows = paid(input.rows, previous.start, previous.end);
  const prior = previousRows.filter(matchesCategory);
  const priorMoney = totals(prior);
  const money = totals(current);
  const barKind = analysisBarKind(window.start, window.end, input.grouping ?? "auto");

  let coverage: AnalysisCoverage;
  let chart: CockpitForecastChart | null = null;
  let reconstructed = false;
  let balanceChange: number | null = null;
  if (!input.balanceScope) {
    coverage = "private-only";
  } else if (!input.anchor || !anchorDate) {
    coverage = "missing";
  } else {
    const series = reconstructHistoricalBalances({
      anchor: input.anchor,
      transactions: input.rows.filter((row) => day(row.date) <= today),
      from: addLocalDays(window.start, -1),
      to: window.end,
      daily: true,
    });
    const points = series.points.filter((point) => point.date >= window.start).map(chartPoint);
    const opening =
      series.points.find((point) => point.date === addLocalDays(window.start, -1))?.amount ??
      (input.span === "all" && points[0]?.date === window.start ? points[0].balance : null);
    const closing = points.find((point) => point.date === window.end)?.balance ?? null;
    if (opening != null && closing != null) balanceChange = sumMoneyAmounts([], closing - opening);
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
    balanceChange,
    income: money.income,
    expense: money.expense,
    flows: current,
    bars: buildAnalysisFlowBars(current, window.start, window.end, barKind),
    previousIncome: priorMoney.income,
    previousExpense: priorMoney.expense,
    previousAvailable: previousRows.length > 0,
    barKind,
    categories: buildAnalysisCategories(current),
    shifts: previousRows.length > 0 ? shiftsOf(current, prior) : [],
  };
}
