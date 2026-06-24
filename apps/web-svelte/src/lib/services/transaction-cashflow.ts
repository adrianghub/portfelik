import { computeSummary } from "$lib/services/transaction-summary";
import type { MonthlySummary, TransactionStatus, TransactionWithCategory } from "$lib/types";

/** Committed ledger truth - realized cashflow only. */
export const LEDGER_STATUSES = ["paid"] as const satisfies readonly TransactionStatus[];

/** Scheduled / past-due rows layered on top of ledger for projection. */
export const FORECAST_EXTRA_STATUSES = [
  "upcoming",
  "overdue",
] as const satisfies readonly TransactionStatus[];

export type CashflowSummaryMode = "ledger" | "forecast";

/** Today as an ISO `YYYY-MM-DD` string (UTC), matching the form's date field. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Suggest a transaction status from its date: a future date is `upcoming`,
 * today or past is `paid`. `overdue` / `draft` are never auto-suggested — they
 * express intent the date can't infer. Pure; `today` is injectable for tests.
 */
export function suggestStatusForDate(date: string, today: string = todayIso()): TransactionStatus {
  return date > today ? "upcoming" : "paid";
}

export function filterTransactionsByStatuses(
  transactions: TransactionWithCategory[],
  statuses: readonly TransactionStatus[]
): TransactionWithCategory[] {
  const allowed = new Set(statuses);
  return transactions.filter((tx) => allowed.has(tx.status));
}

export function ledgerTransactions(
  transactions: TransactionWithCategory[]
): TransactionWithCategory[] {
  return filterTransactionsByStatuses(transactions, LEDGER_STATUSES);
}

export function forecastTransactions(
  transactions: TransactionWithCategory[]
): TransactionWithCategory[] {
  return filterTransactionsByStatuses(transactions, [
    ...LEDGER_STATUSES,
    ...FORECAST_EXTRA_STATUSES,
  ]);
}

export function computeLedgerSummary(transactions: TransactionWithCategory[]): MonthlySummary {
  return computeSummary(ledgerTransactions(transactions));
}

export function computeForecastSummary(transactions: TransactionWithCategory[]): MonthlySummary {
  return computeSummary(forecastTransactions(transactions));
}

/** Default summary for dashboards and planning - paid only. */
export function computeCashflowSummary(
  transactions: TransactionWithCategory[],
  mode: CashflowSummaryMode = "ledger"
): MonthlySummary {
  return mode === "forecast"
    ? computeForecastSummary(transactions)
    : computeLedgerSummary(transactions);
}
