import { supabase } from "$lib/supabase";
import type { TransactionWithCategory } from "$lib/types";
import { occurrenceDates } from "$lib/services/recurring-forecast";
import { recurrenceSummary } from "$lib/recurrence";

/** Date-only YYYY-MM-DD, one UTC day before the given ISO date. */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Date-only YYYY-MM-DD, one UTC day after the given ISO date. */
export function dayAfter(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function occurrenceSlot(
  tx: Pick<TransactionWithCategory, "recurring_template_id" | "recurring_occurrence_date" | "date">
): {
  templateId: string;
  occurrenceDate: string;
} | null {
  if (!tx.recurring_template_id) return null;
  const occurrenceDate = (tx.recurring_occurrence_date ?? tx.date).slice(0, 10);
  return { templateId: tx.recurring_template_id, occurrenceDate };
}

/** Prune generated occurrences from a date onward (upcoming delete; settled detach). */
export async function removeFutureMaterializedOccurrences(
  templateId: string,
  fromDate: string
): Promise<void> {
  const { error } = await supabase.rpc("prune_recurring_occurrences_from", {
    p_template_id: templateId,
    p_from_date: fromDate.slice(0, 10),
  });
  if (error) throw error;
}

/**
 * End a series at `occurrenceDate` ("this and following"): set the template's
 * recurrence_end_date to the day before, then prune future slots atomically.
 */
export async function endSeriesFromOccurrence(opts: {
  template: TransactionWithCategory;
  occurrenceDate: string;
}): Promise<void> {
  const { error } = await supabase.rpc("end_recurring_series_from_occurrence", {
    p_template_id: opts.template.id,
    p_occurrence_date: opts.occurrenceDate.slice(0, 10),
  });
  if (error) throw error;
}

/** Skip a single occurrence ("this occurrence"): record skip + delete materialized row. */
export async function skipOccurrence(occurrence: TransactionWithCategory): Promise<void> {
  const slot = occurrenceSlot(occurrence);
  if (!slot) return;

  const { error } = await supabase.rpc("skip_recurring_occurrence", {
    p_template_id: slot.templateId,
    p_occurrence_date: slot.occurrenceDate,
    p_transaction_id: occurrence.projected ? null : occurrence.id,
  });
  if (error) throw error;
}

/**
 * Insert one real row for a projected occurrence so it can be edited as a single
 * instance. Returns the materialized row joined with its category.
 */
export async function materializeOccurrence(opts: {
  template: TransactionWithCategory;
  occurrenceDate: string;
}): Promise<TransactionWithCategory> {
  const { template, occurrenceDate } = opts;
  const slotDate = occurrenceDate.slice(0, 10);

  const { data: rowId, error } = await supabase.rpc("materialize_recurring_occurrence", {
    p_template_id: template.id,
    p_occurrence_date: slotDate,
  });
  if (error) throw error;

  const { data: row, error: fetchErr } = await supabase
    .from("transactions_with_category")
    .select("*")
    .eq("id", rowId as string)
    .single();
  if (fetchErr) throw fetchErr;
  return row as TransactionWithCategory;
}

export interface RecurringSeriesSummary {
  id: string;
  title: string;
  type: "income" | "expense";
  amount: number;
  categoryName: string;
  groupId: string | null;
  cadence: string;
  nextDate: string | null;
  startDate: string;
  endDate: string | null;
}

const DAY_MS = 86_400_000;

/** Active = a generating template whose end date (if any) has not passed. */
export function isActiveRecurringSeries(t: TransactionWithCategory, today: string): boolean {
  if (!t.is_recurring || !t.recurrence_frequency) return false;
  return t.recurrence_end_date == null || t.recurrence_end_date >= today;
}

/** Display summary for one recurring template. Pure; `now` injectable. */
export function summarizeRecurringSeries(
  t: TransactionWithCategory,
  now: Date = new Date()
): RecurringSeriesSummary {
  const today = now.toISOString().slice(0, 10);
  const todayMs = new Date(`${today}T00:00:00.000Z`).getTime();
  const upcoming = occurrenceDates(t, todayMs - DAY_MS, todayMs + 400 * DAY_MS);
  let nextDate: string | null = null;
  if (upcoming.length > 0) {
    const candidate = upcoming[0].toISOString().slice(0, 10);
    if (!t.recurrence_end_date || candidate <= t.recurrence_end_date) {
      nextDate = candidate;
    }
  }
  return {
    id: t.id,
    title: t.counterparty?.trim() || t.description,
    type: t.type,
    amount: Math.abs(Number(t.amount)),
    categoryName: t.category_name,
    groupId: t.group_id,
    cadence: recurrenceSummary({
      frequency: t.recurrence_frequency,
      interval: t.recurrence_interval,
      weekday: t.recurrence_weekday,
      day: t.recurring_day,
      month: t.recurrence_month,
    }),
    nextDate,
    startDate: t.date.slice(0, 10),
    endDate: t.recurrence_end_date,
  };
}

/** Active series only, summarized, sorted by next occurrence (nulls last). */
export function buildRecurringSeriesList(
  templates: TransactionWithCategory[],
  now: Date = new Date()
): RecurringSeriesSummary[] {
  const today = now.toISOString().slice(0, 10);
  return templates
    .filter((t) => isActiveRecurringSeries(t, today))
    .map((t) => summarizeRecurringSeries(t, now))
    .sort((a, b) => {
      if (a.nextDate === b.nextDate) return 0;
      if (a.nextDate === null) return 1;
      if (b.nextDate === null) return -1;
      return a.nextDate.localeCompare(b.nextDate);
    });
}
