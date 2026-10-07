import { supabase } from "$lib/supabase";
import type { ImportRow, ImportSession } from "$lib/services/bank-import";
import { fetchAllPages } from "$lib/services/fetch-all-pages";
import { transactionsUrlForRange } from "$lib/utils";

/** Private, committed provenance only. Counts are the saved commit result. */
export async function fetchImportHistory(): Promise<ImportSession[]> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw error ?? new Error("Not authenticated");
  return fetchAllPages(async (from, to) => {
    const result = await supabase
      .from("transaction_import_sessions")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "committed")
      .order("committed_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, to);
    return { data: result.data as ImportSession[] | null, error: result.error };
  });
}

export function importHistoryDateRange(rows: ImportRow[]): { start: string; end: string } | null {
  const dates = rows
    .map((row) => row.posted_at.slice(0, 10))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null;
}

/** This intentionally opens the period, not a claim about current linked transactions. */
export function importHistoryTransactionsUrl(rows: ImportRow[]): string | null {
  const range = importHistoryDateRange(rows);
  if (!range) return null;
  return transactionsUrlForRange({
    startYear: Number(range.start.slice(0, 4)),
    startMonth: Number(range.start.slice(5, 7)),
    endYear: Number(range.end.slice(0, 4)),
    endMonth: Number(range.end.slice(5, 7)),
  });
}
