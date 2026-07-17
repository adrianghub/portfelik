import { supabase } from "$lib/supabase";
import type { TransactionWithCategory } from "$lib/types";
import { projectRecurringOccurrences } from "$lib/services/recurring-forecast";
import { fetchRecurringTemplates, fetchTransactions } from "$lib/services/transactions";

export interface RecurringOccurrenceSkip {
  recurring_template_id: string;
  occurrence_date: string;
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nearTermRecurringWindow(now: Date = new Date()): {
  after: string;
  start: string;
  end: string;
} {
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dayMs = 86_400_000;
  return {
    // projectRecurringOccurrences uses an exclusive lower bound; yesterday includes today.
    after: isoDate(new Date(todayMs - dayMs)),
    start: isoDate(new Date(todayMs)),
    end: isoDate(new Date(todayMs + 14 * dayMs)),
  };
}

export async function fetchRecurringOccurrenceSkips(
  start: string,
  end: string
): Promise<RecurringOccurrenceSkip[]> {
  const { data, error } = await supabase
    .from("recurring_occurrence_skips")
    .select("recurring_template_id, occurrence_date")
    .gte("occurrence_date", start)
    .lt("occurrence_date", end);
  if (error) throw error;
  return (data ?? []) as RecurringOccurrenceSkip[];
}

export async function materializeRecurringOccurrencesForNearTerm(
  templates?: TransactionWithCategory[],
  now: Date = new Date()
): Promise<number> {
  const window = nearTermRecurringWindow(now);
  const sourceTemplates = templates ?? (await fetchRecurringTemplates());
  const activeTemplates = sourceTemplates.filter(
    (tx) => tx.is_recurring && tx.recurrence_frequency
  );
  if (activeTemplates.length === 0) return 0;

  const [existing, skipped] = await Promise.all([
    fetchTransactions(window.start, window.end),
    fetchRecurringOccurrenceSkips(window.start, window.end),
  ]);

  const projected = projectRecurringOccurrences(
    activeTemplates,
    window.after,
    window.end,
    existing,
    skipped
  ).filter((tx) => tx.date >= window.start && tx.date < window.end);

  if (projected.length === 0) return 0;

  // Per-slot RPC with isolation: one template RLS/validation failure must not
  // abort the whole near-term batch (group templates under member identity).
  let created = 0;
  const failuresByTemplate = new Set<string>();
  for (const tx of projected) {
    const templateId = tx.recurring_template_id;
    const occurrenceDate = tx.recurring_occurrence_date;
    if (!templateId || !occurrenceDate) continue;
    if (failuresByTemplate.has(templateId)) continue;
    const { error } = await supabase.rpc("materialize_recurring_occurrence", {
      p_template_id: templateId,
      p_occurrence_date: occurrenceDate,
    });
    if (error) {
      failuresByTemplate.add(templateId);
      continue;
    }
    created += 1;
  }
  return created;
}

export async function rememberRecurringOccurrenceSkip(tx: TransactionWithCategory): Promise<void> {
  if (!tx.recurring_template_id || !tx.recurring_occurrence_date) return;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { error } = await supabase.from("recurring_occurrence_skips").upsert(
    {
      user_id: tx.user_id,
      group_id: tx.group_id,
      recurring_template_id: tx.recurring_template_id,
      occurrence_date: tx.recurring_occurrence_date,
      // Virtual forecast rows have synthetic `projected:…` ids and therefore
      // cannot satisfy this optional FK. The template/date pair is the durable
      // skip identity for both projected and materialized occurrences.
      skipped_transaction_id: tx.projected ? null : tx.id,
      created_by: user.id,
    },
    { onConflict: "recurring_template_id,occurrence_date", ignoreDuplicates: true }
  );
  if (error) throw error;
}
