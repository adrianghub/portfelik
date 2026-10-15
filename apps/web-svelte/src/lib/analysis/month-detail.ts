import { calendarMonthBounds, calendarMonthFromIso } from "$lib/cockpit/month-window";
import { forecastTrough } from "$lib/services/forecast-trough";
import { moneyDifference, sumMoneyAmounts } from "$lib/money";

export interface AnalysisMonthDetail {
  monthKey: string;
  start: string;
  end: string;
  opening: number | null;
  closing: number | null;
  income: number;
  expense: number;
  net: number;
  lowest: { date: string; balance: number } | null;
}

/**
 * Month-level readout from a balance series and flow bars.
 * Opening is the last point on/before month start; closing is the last in-month point.
 */
export function buildAnalysisMonthDetail(input: {
  monthKey: string;
  points: readonly { date: string; balance: number }[];
  bars: readonly { start: string; end: string; income: number; expense: number }[];
}): AnalysisMonthDetail | null {
  if (!/^\d{4}-\d{2}$/.test(input.monthKey)) return null;
  const bounds = calendarMonthBounds(calendarMonthFromIso(`${input.monthKey}-01`));
  const inMonth = input.points.filter(
    (point) => point.date >= bounds.monthStart && point.date <= bounds.monthEnd
  );
  const before = input.points.filter((point) => point.date < bounds.monthStart);
  const opening =
    before.length > 0 ? before[before.length - 1]!.balance : (inMonth[0]?.balance ?? null);
  const closing = inMonth.length > 0 ? inMonth[inMonth.length - 1]!.balance : null;
  const monthBars = input.bars.filter(
    (bar) => bar.start <= bounds.monthEnd && bar.end > bounds.monthStart
  );
  const income = sumMoneyAmounts(monthBars.map((bar) => ({ amount: bar.income })));
  const expense = sumMoneyAmounts(monthBars.map((bar) => ({ amount: bar.expense })));
  return {
    monthKey: input.monthKey,
    start: bounds.monthStart,
    end: bounds.monthEnd,
    opening,
    closing,
    income,
    expense,
    net: moneyDifference(income, expense),
    lowest: forecastTrough(inMonth),
  };
}

export function monthKeyFromIso(date: string): string {
  return date.slice(0, 7);
}
