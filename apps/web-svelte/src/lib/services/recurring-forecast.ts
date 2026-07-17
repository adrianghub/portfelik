import type { TransactionWithCategory } from "$lib/types";
import {
  MAX_RECURRENCE_OCCURRENCES,
  recurringOccurrenceDates,
  type RecurrenceDateParams,
} from "$lib/services/recurrence-dates";

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function recurrenceParamsFromTemplate(
  t: TransactionWithCategory
): RecurrenceDateParams | null {
  const freq = t.recurrence_frequency;
  if (!t.is_recurring || !freq) return null;
  return {
    anchorDate: t.date.slice(0, 10),
    frequency: freq,
    interval: t.recurrence_interval,
    weekday: t.recurrence_weekday,
    day: t.recurring_day,
    month: t.recurrence_month,
    endDate: t.recurrence_end_date,
  };
}

/** Dedup key for an existing real row vs a generated occurrence. */
export function recurringPeriodKey(freq: string, d: Date): string {
  if (freq === "monthly") return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  if (freq === "yearly") return String(d.getUTCFullYear());
  return isoDate(d);
}

/**
 * Build the ordered list of occurrence dates for one template within
 * (afterExclusive, beforeExclusive) — both exclusive.
 */
export function occurrenceDates(
  t: TransactionWithCategory,
  afterMs: number,
  beforeMs: number
): Date[] {
  const params = recurrenceParamsFromTemplate(t);
  if (!params) return [];
  const dates = recurringOccurrenceDates(
    params,
    isoDate(new Date(afterMs)),
    isoDate(new Date(beforeMs)),
    MAX_RECURRENCE_OCCURRENCES
  );
  return dates.map((date) => new Date(`${date}T00:00:00.000Z`));
}

/**
 * Expand recurring templates into virtual `upcoming`, `projected: true`
 * TransactionWithCategory rows whose occurrence dates fall in (spanStart,
 * spanEnd). Derived only — never persisted, never in the ledger, never
 * triggers alerts. `existing` real rows linked to a template are deduped per
 * period so a manually-logged instance isn't double-counted.
 */
export function projectRecurringOccurrences(
  templates: TransactionWithCategory[],
  spanStart: string,
  spanEnd: string,
  existing: TransactionWithCategory[] = [],
  skipped: Array<{ recurring_template_id: string; occurrence_date: string }> = []
): TransactionWithCategory[] {
  const afterMs = new Date(spanStart).getTime();
  const beforeMs = new Date(spanEnd).getTime();

  const taken = new Set<string>();
  for (const r of existing) {
    if (!r.recurring_template_id) continue;
    const freq = templates.find((t) => t.id === r.recurring_template_id)?.recurrence_frequency;
    if (!freq) continue;
    const occurrenceDate = r.recurring_occurrence_date ?? r.date;
    taken.add(`${r.recurring_template_id}|${recurringPeriodKey(freq, new Date(occurrenceDate))}`);
  }
  for (const skip of skipped) {
    const freq = templates.find((t) => t.id === skip.recurring_template_id)?.recurrence_frequency;
    if (!freq) continue;
    taken.add(
      `${skip.recurring_template_id}|${recurringPeriodKey(freq, new Date(skip.occurrence_date))}`
    );
  }

  const out: TransactionWithCategory[] = [];
  for (const t of templates) {
    const freq = t.recurrence_frequency;
    if (!freq) continue;
    const templateDate = t.date.slice(0, 10);
    for (const d of occurrenceDates(t, afterMs, beforeMs)) {
      const date = isoDate(d);
      if (date === templateDate) continue;
      if (taken.has(`${t.id}|${recurringPeriodKey(freq, d)}`)) continue;
      out.push({
        ...t,
        id: `projected:${t.id}:${date}`,
        date,
        status: "upcoming",
        is_recurring: false,
        recurring_template_id: t.id,
        recurring_occurrence_date: date,
        projected: true,
      });
    }
  }
  return out;
}
