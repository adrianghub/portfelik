import { addLocalDays } from "$lib/date-local";
import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
import { sumMoneyAmounts } from "$lib/money";
import { confirmedSpendForecastFlows } from "$lib/plans/spend-forecast";
import {
  CASH_FORECAST_HORIZON_DAYS,
  forecastPosition,
  livePosition,
} from "$lib/services/cash-position";
import type { CockpitLedgerTx } from "$lib/cockpit/indicators";
import { cockpitMonthIndicators, type CockpitMonthInput } from "$lib/cockpit/month";
import { calendarMonthBounds, shiftCalendarMonth } from "$lib/cockpit/month-window";

/**
 * Same floor as the spending headline. A tiny previous month turns into a
 * loud percent, so the card shows the amount alone.
 */
const COMPARABLE_SPEND_FLOOR = 150;

export interface CockpitChartPoint {
  date: string;
  balance: number;
  kind: "history" | "forecast";
}

export interface CockpitSpendComparison {
  /** Rounded percent. Negative means less than the previous month. */
  percent: number;
  /** Previous month, 1-12. */
  month: number;
}

export interface CockpitForecastChart {
  points: CockpitChartPoint[] | null;
  /** Shared by the dashed line and the „Dziś” label. Null outside the window. */
  todayRatio: number | null;
  balance: number | null;
  forecast: number | null;
  /** Paid expenses through today. Null without an anchor. */
  spent: number | null;
  comparison: CockpitSpendComparison | null;
}

export interface CockpitScrub {
  point: CockpitChartPoint;
  forecast: boolean;
}

function day(value: string): string {
  return value.slice(0, 10);
}

function utcDay(iso: string): number {
  const [year, month, date] = day(iso).split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, date) / 86_400_000);
}

const SHORT_MONTHS = [
  "sty",
  "lut",
  "mar",
  "kwi",
  "maj",
  "cze",
  "lip",
  "sie",
  "wrz",
  "paź",
  "lis",
  "gru",
] as const;

/** `2026-10-01` becomes `1 paź`. */
export function axisDayLabel(iso: string): string {
  const [, month, date] = day(iso).split("-");
  return `${Number(date)} ${SHORT_MONTHS[Number(month) - 1] ?? ""}`;
}

/** 0 at the first day of the window, 1 at the last. */
export function dateRatio(date: string, start: string, end: string): number {
  const span = utcDay(end) - utcDay(start);
  if (span <= 0) return 0;
  return (utcDay(date) - utcDay(start)) / span;
}

function minDay(a: string, b: string): string {
  return a < b ? a : b;
}

function maxDay(a: string, b: string): string {
  return a > b ? a : b;
}

function paidOnOrBefore(input: CockpitMonthInput, inclusiveEnd: string): number {
  return livePosition(
    input.anchor,
    input.transactions.filter((tx) => day(tx.date) <= inclusiveEnd)
  );
}

function isPaidExpense(tx: CockpitLedgerTx, allocationIds: ReadonlySet<string>): boolean {
  return (
    tx.type === "expense" &&
    tx.status === "paid" &&
    isSupportedLedgerCurrency(tx.currency) &&
    !allocationIds.has(tx.id)
  );
}

function paidSpend(
  input: CockpitMonthInput,
  anchorDay: string,
  start: string,
  end: string
): number {
  return sumMoneyAmounts(
    input.transactions.filter((tx) => {
      const date = day(tx.date);
      return (
        isPaidExpense(tx, input.allocationTransactionIds ?? new Set()) &&
        date >= anchorDay &&
        date >= start &&
        date <= end
      );
    })
  );
}

function previousComparison(
  input: CockpitMonthInput,
  anchorDay: string,
  spent: number
): CockpitSpendComparison | null {
  const start = day(input.monthStart);
  const end = day(input.monthEnd);
  const today = day(input.today);
  if (!start.endsWith("-01")) return null;
  const bounds = calendarMonthBounds({
    year: Number(start.slice(0, 4)),
    month: Number(start.slice(5, 7)),
  });
  if (bounds.monthEnd !== end || today < start) return null;
  const current = { year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) };
  const previous = shiftCalendarMonth(current, -1);
  const previousBounds = calendarMonthBounds(previous);
  const alignedDay = Math.min(Number(today.slice(8)), Number(previousBounds.monthEnd.slice(8)));
  const alignedEnd =
    today > end
      ? previousBounds.monthEnd
      : `${previousBounds.monthStart.slice(0, 8)}${String(alignedDay).padStart(2, "0")}`;
  if (previousBounds.monthStart < anchorDay || alignedEnd < anchorDay) return null;
  const previousSpent = paidSpend(input, anchorDay, previousBounds.monthStart, alignedEnd);
  if (previousSpent < COMPARABLE_SPEND_FLOOR) return null;
  const percent = Math.round(((spent - previousSpent) / previousSpent) * 100);
  if (percent === 0) return null;
  return { percent, month: previous.month };
}

function forecastFlows(input: CockpitMonthInput) {
  const ledger = input.transactions;
  return confirmedSpendForecastFlows({
    items: input.items
      .filter((item) => item.groupId === null && item.status === "confirmed")
      .map((item) => ({ ...item, groupId: null })),
    links: input.links,
    forecastTransactionIds: new Set(ledger.map((tx) => tx.id)),
    today: day(input.today),
  });
}

/**
 * Balance path for one cockpit month.
 * History is the paid balance on days that actually moved.
 * The future is the dated forecast, then the month-end figure. Empty days stay out.
 */
export function buildCockpitForecastChart(input: CockpitMonthInput): CockpitForecastChart {
  const indicators = cockpitMonthIndicators(input);
  const anchor = input.scope.kind === "all" ? null : input.anchor;
  const start = day(input.monthStart);
  const end = day(input.monthEnd);
  const today = day(input.today);
  const todayRatio = today >= start && today <= end ? dateRatio(today, start, end) : null;
  if (!anchor) {
    return {
      points: null,
      todayRatio: null,
      balance: null,
      forecast: null,
      spent: null,
      comparison: null,
    };
  }

  const anchorDay = day(anchor.as_of_date);
  const spentEnd = minDay(today, end);
  const spent =
    spentEnd < maxDay(start, anchorDay) ? 0 : paidSpend(input, anchorDay, start, spentEnd);
  const comparison = previousComparison(input, anchorDay, spent);
  const visibleStart = maxDay(start, anchorDay);
  if (visibleStart > end) {
    return {
      points: null,
      todayRatio,
      balance: indicators.balance,
      forecast: indicators.forecast,
      spent,
      comparison,
    };
  }

  const points: CockpitChartPoint[] = [];
  const historyEnd = today < visibleStart ? null : minDay(today, end);
  if (historyEnd != null && historyEnd >= visibleStart) {
    const dates = new Set<string>([visibleStart, historyEnd]);
    for (const tx of input.transactions) {
      const date = day(tx.date);
      if (tx.status !== "paid" || !isSupportedLedgerCurrency(tx.currency)) continue;
      if (date >= visibleStart && date <= historyEnd) dates.add(date);
    }
    for (const date of [...dates].sort()) {
      points.push({ date, balance: paidOnOrBefore(input, date), kind: "history" });
    }
  }

  if (today < end && indicators.forecast != null) {
    const flows = forecastFlows(input);
    const horizon = addLocalDays(today, CASH_FORECAST_HORIZON_DAYS);
    const futureDates = new Set<string>();
    const scheduled = [
      ...input.transactions.filter((tx) => tx.status === "upcoming" || tx.status === "overdue"),
      ...flows,
    ];
    for (const tx of scheduled) {
      const date = day(tx.date);
      if (date > today && date <= end && date <= horizon) futureDates.add(date);
    }
    let last = points.at(-1)?.balance ?? paidOnOrBefore(input, maxDay(today, anchorDay));
    const combined = [...input.transactions, ...flows];
    for (const date of [...futureDates].sort()) {
      const balance = forecastPosition(anchor, combined, { today, horizonEnd: date });
      if (balance === last) continue;
      points.push({ date, balance, kind: "forecast" });
      last = balance;
    }
    if (points.at(-1)?.date !== end) {
      points.push({ date: end, balance: indicators.forecast, kind: "forecast" });
    }
  }

  return {
    points: points.length > 0 ? points : null,
    todayRatio,
    balance: indicators.balance,
    forecast: indicators.forecast,
    spent,
    comparison,
  };
}

/** Nearest real point. Dates after today stay forecast, never history. */
export function scrubAtRatio(
  points: readonly CockpitChartPoint[],
  ratio: number,
  start: string,
  end: string
): CockpitScrub | null {
  if (points.length === 0) return null;
  let best = points[0];
  let bestDistance = Math.abs(dateRatio(best.date, start, end) - ratio);
  for (const point of points.slice(1)) {
    const distance = Math.abs(dateRatio(point.date, start, end) - ratio);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }
  return { point: best, forecast: best.kind === "forecast" };
}
