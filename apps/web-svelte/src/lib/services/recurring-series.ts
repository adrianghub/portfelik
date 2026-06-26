import { supabase } from "$lib/supabase";
import type { TransactionWithCategory } from "$lib/types";
import { rememberRecurringOccurrenceSkip } from "$lib/services/recurring-occurrences";
import { deleteTransaction } from "$lib/services/transactions";

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
        user_id: template.user_id,
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
