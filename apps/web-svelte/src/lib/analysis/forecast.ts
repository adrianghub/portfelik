import { addLocalDays } from "$lib/date-local";
import {
  calendarMonthBounds,
  calendarMonthFromIso,
  shiftCalendarMonth,
} from "$lib/cockpit/month-window";
import type { CockpitChartPoint } from "$lib/cockpit/forecast-chart";
import { isSupportedLedgerCurrency } from "$lib/ledger-currency";
import {
  appendConfirmedSpendForecast,
  confirmedSpendForecastFlows,
} from "$lib/plans/spend-forecast";
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

/** Monthly bars always include the entire terminal calendar month. */
export function analysisForecastEnd(today: string, horizon: ForecastHorizon): string {
  const current = calendarMonthFromIso(today);
  if (horizon === "year") return `${current.year}-12-31`;
  if (horizon === "month") return calendarMonthBounds(current).monthEnd;
  const months = horizon === "3months" ? 3 : horizon === "6months" ? 6 : 12;
  const bounds = calendarMonthBounds(shiftCalendarMonth(current, months));
  return bounds.monthEnd;
}

export interface AnalysisForecast {
  start: string;
  end: string;
  balance: number;
  finalBalance: number;
  income: number;
  expense: number;
  points: CockpitChartPoint[];
  /** Dated upcoming/overdue ledger flows for bars and transaction drill-down. */
  flows: AnalysisFlow[];
  /**
   * Confirmed plan remainders that move the balance line but are not ledger rows.
   * Month detail folds these into expense so opening + income − expense ≈ closing.
   */
  obligationFlows: AnalysisFlow[];
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
  // Bars/categories use ledger + projected recurring only so drill-down to
  // /transactions?status=upcoming,overdue matches the stacked amounts.
  // Confirmed spend remainders still move the balance line via `at(end)`.
  const ledgerForFlows = [...real, ...projected] as Array<
    Pick<
      TransactionWithCategory,
      "id" | "type" | "amount" | "status" | "date" | "currency" | "category_id" | "category_name"
    > & { id?: string }
  >;
  const movementRows = forecastFlowRows(ledgerForFlows, end, anchor);
  const flowTotals = forecastMovementTotals(anchor, ledgerForFlows, { today, horizonEnd: end });
  const obligationFlows: AnalysisFlow[] = confirmedSpendForecastFlows({
    items: input.spend?.items ?? [],
    links: input.spend?.links ?? [],
    forecastTransactionIds: new Set(
      ledgerForFlows.map((row) => row.id).filter(Boolean) as string[]
    ),
    today,
  })
    .filter((row) => countsAfterAnchor(row.date, anchor) && row.date <= end)
    .map((row) => ({
      id: row.id,
      type: "expense" as const,
      amount: row.amount,
      status: row.status,
      date: row.date,
      currency: row.currency,
      categoryId: null,
      categoryName: null,
    }));
  // Start at the earliest counted flow so pre-today overdue rows stay in bars.
  const barsStart = movementRows.reduce(
    (earliest, row) => (row.date < earliest ? row.date : earliest),
    today
  );
  const barKind = analysisBarKind(barsStart <= end ? barsStart : end, end);
  const bars = barsStart <= end ? buildAnalysisFlowBars(movementRows, barsStart, end, barKind) : [];
  return {
    start: today,
    end,
    balance,
    finalBalance,
    income: flowTotals.upcomingIncome,
    expense: flowTotals.upcomingExpenses,
    points,
    flows: movementRows,
    obligationFlows,
    bars,
    barKind,
    categories: buildAnalysisCategories(movementRows),
  };
}
