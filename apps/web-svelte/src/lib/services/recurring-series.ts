import { supabase } from "$lib/supabase";
import type { TransactionWithCategory } from "$lib/types";
import { rememberRecurringOccurrenceSkip } from "$lib/services/recurring-occurrences";
import { deleteTransaction } from "$lib/services/transactions";
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

/** Remove materialized upcoming rows at or after an exclusive series boundary. */
export async function removeFutureMaterializedOccurrences(
  templateId: string,
  fromDate: string
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("recurring_template_id", templateId)
    .eq("status", "upcoming")
    .gte("date", fromDate.slice(0, 10));
  if (error) throw error;
}

/**
 * End a series at `occurrenceDate` ("this and following"): set the template's
 * recurrence_end_date to the day before, then delete future upcoming
 * materialized rows dated on/after the occurrence. Past real rows are kept.
 */
export async function endSeriesFromOccurrence(opts: {
  template: TransactionWithCategory;
  occurrenceDate: string;
}): Promise<void> {
  const { template, occurrenceDate } = opts;
  const { error: updErr } = await supabase
    .from("transactions")
    .update({ recurrence_end_date: dayBefore(occurrenceDate) })
    .eq("id", template.id);
  if (updErr) throw updErr;

  await removeFutureMaterializedOccurrences(template.id, occurrenceDate);
}

/** Skip a single occurrence ("this occurrence"): record a skip + delete the real row if materialized. */
export async function skipOccurrence(occurrence: TransactionWithCategory): Promise<void> {
  if (occurrence.recurring_template_id && occurrence.recurring_occurrence_date) {
    await rememberRecurringOccurrenceSkip(occurrence);
  }
  // Projected rows have synthetic ids ("projected:..."); only delete real rows.
  if (!occurrence.projected && occurrence.recurring_template_id) {
    await deleteTransaction(occurrence.id);
  }
}

/**
 * Insert one real row for a projected occurrence so it can be edited as a single
 * instance ("edit this occurrence" on a projected row). Returns the created row
 * joined with its category. Upsert conflict key matches near-term materialization.
 */
export async function materializeOccurrence(opts: {
  template: TransactionWithCategory;
  occurrenceDate: string;
}): Promise<TransactionWithCategory> {
  const { template, occurrenceDate } = opts;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data, error } = await supabase
    .from("transactions")
    .upsert(
      {
        amount: Math.abs(Number(template.amount)),
        currency: template.currency,
        counterparty: template.counterparty,
        description: template.description,
        date: occurrenceDate.slice(0, 10),
        type: template.type,
        status: "upcoming" as const,
        category_id: template.category_id,
        // The acting user owns the materialized row — transaction insert RLS
        // requires user_id = auth.uid(), so a co-owner materializing a shared
        // template's occurrence must insert as themselves (not the template owner).
        user_id: user.id,
        group_id: template.group_id,
        is_recurring: false,
        recurring_day: null,
        recurrence_frequency: null,
        recurrence_interval: 1,
        recurrence_weekday: null,
        recurrence_month: null,
        recurring_template_id: template.id,
        recurring_occurrence_date: occurrenceDate.slice(0, 10),
      },
      { onConflict: "user_id,recurring_template_id,recurring_occurrence_date" }
    )
    .select("id")
    .single();
  if (error) throw error;

  // Re-fetch through the category view so the caller gets a full TransactionWithCategory.
  const { data: row, error: fetchErr } = await supabase
    .from("transactions_with_category")
    .select("*")
    .eq("id", (data as { id: string }).id)
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
  // occurrenceDates is exclusive on its lower bound, so start a day before today
  // to include an occurrence landing exactly today; look ~13 months ahead.
  const upcoming = occurrenceDates(t, todayMs - DAY_MS, todayMs + 400 * DAY_MS);
  // Filter out next dates that are after the series end date
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
