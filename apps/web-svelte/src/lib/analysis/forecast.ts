import { addLocalDays } from "$lib/date-local";
import {
  calendarMonthBounds,
  calendarMonthFromIso,
  shiftCalendarMonth,
} from "$lib/cockpit/month-window";
import type { CockpitChartPoint } from "$lib/cockpit/forecast-chart";
import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
import { appendConfirmedSpendForecast } from "$lib/plans/spend-forecast";
import {
  analysisBarKind,
  buildAnalysisCategories,
  buildAnalysisFlowBars,
  type AnalysisBar,
  type AnalysisCategory,
  type AnalysisFlow,
} from "$lib/analysis/overview";
import {
  countsAfterAnchor,
  forecastMovementTotals,
  forecastPosition,
  livePosition,
  type CashAnchor,
} from "$lib/services/cash-position";
import type { PrivateSpendForecastSource } from "$lib/services/spend-forecast";
import { recurringProjectionsForTransactionRange } from "$lib/services/transaction-projections";
import type { TransactionWithCategory } from "$lib/types";

export type ForecastHorizon = "month" | "year" | "3months" | "6months" | "12months";

/** Same calendar day in the target month; short months clamp to their last day. */
export function analysisForecastEnd(today: string, horizon: ForecastHorizon): string {
  const current = calendarMonthFromIso(today);
  if (horizon === "year") return `${current.year}-12-31`;
  if (horizon === "month") return calendarMonthBounds(current).monthEnd;
  const months = horizon === "3months" ? 3 : horizon === "6months" ? 6 : 12;
  const bounds = calendarMonthBounds(shiftCalendarMonth(current, months));
  const date = Math.min(Number(today.slice(8, 10)), Number(bounds.monthEnd.slice(8, 10)));
  return `${bounds.monthStart.slice(0, 8)}${String(date).padStart(2, "0")}`;
}

export interface AnalysisForecast {
  start: string;
  end: string;
  balance: number;
  finalBalance: number;
  income: number;
  expense: number;
  points: CockpitChartPoint[];
  bars: AnalysisBar[];
  barKind: "month" | "week" | "day";
  categories: AnalysisCategory[];
}

/** Same upcoming/overdue window as `forecastMovementTotals` (countsAfterAnchor + horizon). */
function forecastFlowRows(
  txs: Array<
    Pick<
      TransactionWithCategory,
      "id" | "type" | "amount" | "status" | "date" | "currency" | "category_id" | "category_name"
    > & { id?: string }
  >,
  end: string,
  anchor: CashAnchor
): AnalysisFlow[] {
  const flows: AnalysisFlow[] = [];
  let synthetic = 0;
  for (const row of txs) {
    if (row.type !== "income" && row.type !== "expense") continue;
    if (!isSupportedLedgerCurrency(row.currency)) continue;
    if (row.status !== "upcoming" && row.status !== "overdue") continue;
    const date = row.date.slice(0, 10);
    if (!countsAfterAnchor(date, anchor) || date > end) continue;
    flows.push({
      id: row.id ?? `forecast-flow-${synthetic++}`,
      type: row.type,
      amount: row.amount,
      status: row.status,
      date,
      currency: row.currency,
      categoryId: "category_id" in row ? (row.category_id ?? null) : null,
      categoryName: "category_name" in row ? (row.category_name ?? null) : null,
    });
  }
  return flows;
}

/** Compose Kokpit's recurrence, plan remainder and cash rules for a longer horizon. */
export function buildAnalysisForecast(input: {
  today: string;
  end: string;
  anchor: CashAnchor | null;
  rows: TransactionWithCategory[];
  templates: TransactionWithCategory[];
  skipped?: Array<{ recurring_template_id: string; occurrence_date: string }>;
  spend?: PrivateSpendForecastSource | null;
}): AnalysisForecast | null {
  const { anchor, today, end } = input;
  if (!anchor || anchor.as_of_date.slice(0, 10) > today || end < today) return null;
  const real = input.rows.filter((row) => (row.group_id ?? null) === null);
  const projected = recurringProjectionsForTransactionRange({
    templates: input.templates.filter((row) => (row.group_id ?? null) === null),
    existing: real,
    skipped: input.skipped ?? [],
    start: today,
    end: addLocalDays(end, 1),
    now: new Date(`${today}T00:00:00Z`),
  });
  const transactions = [...real, ...projected];
  const at = (date: string) =>
    appendConfirmedSpendForecast(
      transactions.filter((row) => row.status === "paid" || row.date.slice(0, 10) <= date),
      input.spend ?? null,
      today
    );
  const balance = livePosition(anchor, real);
  const finalBalance = forecastPosition(anchor, at(end), { today, horizonEnd: end });
  const totals = forecastMovementTotals(anchor, at(end), { today, horizonEnd: end });
  // Only recalculate on movement days; carry the resulting balance over quiet days.
  // Plan links are resolved for each date, exactly as in Kokpit's forecastThrough.
  const events = new Set<string>([addLocalDays(today, 1), end]);
  for (const row of transactions) {
    if (row.status === "paid" || row.status === "upcoming" || row.status === "overdue")
      events.add(row.date.slice(0, 10));
  }
  for (const item of input.spend?.items ?? [])
    if (item.dueDate) events.add(item.dueDate.slice(0, 10));
  const amounts = new Map<string, number>();
  for (const date of events) {
    if (date > today && date <= end)
      amounts.set(date, forecastPosition(anchor, at(date), { today, horizonEnd: date }));
  }
  const points: CockpitChartPoint[] = [{ date: today, balance, kind: "history" }];
  let running = balance;
  for (let date = addLocalDays(today, 1); date <= end; date = addLocalDays(date, 1)) {
    running = amounts.get(date) ?? running;
    points.push({ date, balance: running, kind: "forecast" });
  }
  if (end === today && finalBalance !== balance)
    points[0] = { date: today, balance: finalBalance, kind: "forecast" };
  const movementRows = forecastFlowRows(
    at(end) as Array<
      Pick<
        TransactionWithCategory,
        "id" | "type" | "amount" | "status" | "date" | "currency" | "category_id" | "category_name"
      > & { id?: string }
    >,
    end,
    anchor
  );
  // Include today so start_of_day same-day upcoming matches headline income/expense.
  const barsStart = today;
  const barKind = analysisBarKind(barsStart <= end ? barsStart : end, end);
  const bars = barsStart <= end ? buildAnalysisFlowBars(movementRows, barsStart, end, barKind) : [];
  return {
    start: today,
    end,
    balance,
    finalBalance,
    income: totals.upcomingIncome,
    expense: totals.upcomingExpenses,
    points,
    bars,
    barKind,
    categories: buildAnalysisCategories(movementRows),
  };
}
