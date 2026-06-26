import type { TransactionStatus, TransactionWithCategory } from "$lib/types";
import { projectRecurringOccurrences } from "$lib/services/recurring-forecast";
import {
  FORECAST_EXTRA_STATUSES,
  filterTransactionsByStatuses,
} from "$lib/services/transaction-cashflow";

function dateOnly(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toISOString().slice(0, 10);
}

function dayBeforeIso(value: string): string {
  const d = new Date(value);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString();
}

function projectionSpanStart(rangeStart: string, now: Date): string {
  const beforeRangeStart = dayBeforeIso(rangeStart);
  return new Date(beforeRangeStart).getTime() > now.getTime()
    ? beforeRangeStart
    : now.toISOString();
}

export function shouldShowProjectedRows(statuses: Set<string> | null): boolean {
  return !statuses || statuses.has("upcoming" satisfies TransactionStatus);
}

export function recurringProjectionsForTransactionRange({
  templates,
  existing,
  skipped = [],
  start,
  end,
  now = new Date(),
}: {
  templates: TransactionWithCategory[];
  existing: TransactionWithCategory[];
  skipped?: Array<{ recurring_template_id: string; occurrence_date: string }>;
  start: string;
  end: string;
  now?: Date;
}): TransactionWithCategory[] {
  const projected = projectRecurringOccurrences(
    templates,
    projectionSpanStart(start, now),
    end,
    existing,
    skipped
  );
  const startKey = dateOnly(start);
  const endMs = new Date(end).getTime();
  return projected.filter((tx) => tx.date >= startKey && new Date(tx.date).getTime() < endMs);
}

/**
 * Source rows for the dashboard forecast (forward) buckets: scheduled real rows
 * (upcoming/overdue) UNIONed with deduped recurring projections. Real
 * materialized occurrences carry `recurring_template_id`, so
 * `projectRecurringOccurrences` dedups them out — they survive once via the
 * scheduled set, never double-counted. One-off upcoming rows (no template)
 * survive once too. Paid/ledger rows are intentionally dropped — forecast is
 * scheduled-only. Pure; caller scopes templates+existing beforehand and buckets
 * the result with `bucketPeriodHistory`. This is what makes the chart's forecast
 * region agree with the `/transactions` upcoming list for the same window.
 */
export function forwardForecastTransactions(args: {
  templates: TransactionWithCategory[];
  existing: TransactionWithCategory[];
  skipped?: Array<{ recurring_template_id: string; occurrence_date: string }>;
  start: string;
  end: string;
  now?: Date;
}): TransactionWithCategory[] {
  const scheduled = filterTransactionsByStatuses(args.existing, FORECAST_EXTRA_STATUSES);
  const projected = recurringProjectionsForTransactionRange(args);
  return [...scheduled, ...projected];
}
