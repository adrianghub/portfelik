import { calendarMonthBounds, calendarMonthFromIso } from "$lib/cockpit/month-window";
import { addLocalDays } from "$lib/date-local";
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

export interface AnalysisMonthFlow {
  date: string;
  type: "income" | "expense";
  amount: number;
}

/**
 * Month-level readout from a balance series and dated flows.
 * Opening is only the balance on the calendar day before the month — never an
 * in-month point. Income/expense sum transaction-level flows inside the month,
 * so weekly bars that cross month boundaries cannot leak totals.
 */
export function buildAnalysisMonthDetail(input: {
  monthKey: string;
  points: readonly { date: string; balance: number }[];
  flows: readonly AnalysisMonthFlow[];
}): AnalysisMonthDetail | null {
  if (!/^\d{4}-\d{2}$/.test(input.monthKey)) return null;
  const bounds = calendarMonthBounds(calendarMonthFromIso(`${input.monthKey}-01`));
  const dayBefore = addLocalDays(bounds.monthStart, -1);
  const inMonth = input.points.filter(
    (point) => point.date >= bounds.monthStart && point.date <= bounds.monthEnd
  );
  const openingPoint = input.points.find((point) => point.date.slice(0, 10) === dayBefore);
  const closing = inMonth.length > 0 ? inMonth[inMonth.length - 1]!.balance : null;
  const monthFlows = input.flows.filter((flow) => {
    const date = flow.date.slice(0, 10);
    return date >= bounds.monthStart && date <= bounds.monthEnd;
  });
  const income = sumMoneyAmounts(
    monthFlows.filter((flow) => flow.type === "income").map((flow) => ({ amount: flow.amount }))
  );
  const expense = sumMoneyAmounts(
    monthFlows.filter((flow) => flow.type === "expense").map((flow) => ({ amount: flow.amount }))
  );
  return {
    monthKey: input.monthKey,
    start: bounds.monthStart,
    end: bounds.monthEnd,
    opening: openingPoint?.balance ?? null,
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
