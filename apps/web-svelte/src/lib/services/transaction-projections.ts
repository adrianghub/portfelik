import type { TransactionStatus, TransactionWithCategory } from "$lib/types";
import { projectRecurringOccurrences } from "$lib/services/recurring-forecast";

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
  start,
  end,
  now = new Date(),
}: {
  templates: TransactionWithCategory[];
  existing: TransactionWithCategory[];
  start: string;
  end: string;
  now?: Date;
}): TransactionWithCategory[] {
  const projected = projectRecurringOccurrences(
    templates,
    projectionSpanStart(start, now),
    end,
    existing
  );
  const startKey = dateOnly(start);
  const endMs = new Date(end).getTime();
  return projected.filter((tx) => tx.date >= startKey && new Date(tx.date).getTime() < endMs);
}
