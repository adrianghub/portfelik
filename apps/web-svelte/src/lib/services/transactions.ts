import { supabase } from "$lib/supabase";
import type {
  RecurrenceFrequency,
  Transaction,
  TransactionStatus,
  TransactionType,
  TransactionWithCategory,
} from "$lib/types";

const PAGE_SIZE = 1000;

export async function fetchTransactions(
  start: string,
  end: string,
  categoryId?: string
): Promise<TransactionWithCategory[]> {
  const base = supabase
    .from("transactions_with_category")
    .select("*")
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: false });

  const baseQuery = categoryId ? base.eq("category_id", categoryId) : base;

  const all: TransactionWithCategory[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await baseQuery.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...(data as TransactionWithCategory[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/** Export path: paginate the full visible ledger without a date window. */
export async function fetchAllTransactionsForExport(): Promise<TransactionWithCategory[]> {
  const all: TransactionWithCategory[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("transactions_with_category")
      .select("*")
      .order("date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    all.push(...(data as TransactionWithCategory[]));
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

/** All recurring templates (is_recurring=true), scoped by RLS. No date window —
 * the forecast projector expands these forward at read time. */
export async function fetchRecurringTemplates(): Promise<TransactionWithCategory[]> {
  const { data, error } = await supabase
    .from("transactions_with_category")
    .select("*")
    .eq("is_recurring", true);
  if (error) throw error;
  return (data as TransactionWithCategory[]) ?? [];
}

export async function fetchTransactionById(id: string): Promise<TransactionWithCategory> {
  const { data, error } = await supabase
    .from("transactions_with_category")
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data as TransactionWithCategory;
}

export { computeSummary } from "$lib/services/transaction-summary";

export interface CreateTransactionInput {
  amount: number;
  type: TransactionType;
  counterparty?: string | null;
  description: string;
  date: string;
  category_id: string;
  status?: Transaction["status"];
  is_recurring?: boolean;
  recurring_day?: number | null;
  recurrence_frequency?: RecurrenceFrequency | null;
  recurrence_interval?: number;
  recurrence_weekday?: number | null;
  recurrence_month?: number | null;
  recurrence_end_date?: string | null;
  group_id?: string | null;
}

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const counterparty = input.counterparty?.trim() || null;

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...input,
      counterparty,
      user_id: user.id,
      amount: Math.abs(input.amount),
      status: input.status ?? "paid",
      is_recurring: input.is_recurring ?? false,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Transaction;
}

export async function updateTransaction(
  id: string,
  updates: Partial<CreateTransactionInput>
): Promise<Transaction> {
  const payload: Partial<CreateTransactionInput & { amount: number }> = { ...updates };
  if (updates.amount !== undefined) payload.amount = Math.abs(updates.amount);
  if (updates.counterparty !== undefined) {
    payload.counterparty = updates.counterparty?.trim() || null;
  }

  const { data, error } = await supabase
    .from("transactions")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Transaction;
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteTransactions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("transactions").delete().in("id", ids);
  if (error) throw error;
}

export async function updateTransactionsStatus(
  ids: string[],
  status: TransactionStatus
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase.from("transactions").update({ status }).in("id", ids);
  if (error) throw error;
}

export async function updateTransactionsCategory(ids: string[], categoryId: string): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .in("id", ids);
  if (error) throw error;
}
