import { supabase } from "$lib/supabase";
import type {
  MonthlySummary,
  Transaction,
  TransactionType,
  TransactionWithCategory,
} from "$lib/types";

export async function fetchTransactions(
  start: string,
  end: string,
  categoryId?: string
): Promise<TransactionWithCategory[]> {
  let query = supabase
    .from("transactions_with_category")
    .select("*")
    .gte("date", start)
    .lt("date", end)
    .order("date", { ascending: false });

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as TransactionWithCategory[];
}

export function computeSummary(transactions: TransactionWithCategory[]): MonthlySummary {
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const catMap = new Map<string, { name: string; total: number; count: number }>();
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const e = catMap.get(t.category_id);
      if (e) {
        e.total += t.amount;
        e.count++;
      } else {
        catMap.set(t.category_id, { name: t.category_name, total: t.amount, count: 1 });
      }
    });

  const categories: MonthlySummary["categories"] = Array.from(catMap.entries())
    .map(([id, { name, total, count }]) => ({
      category_id: id,
      category_name: name,
      type: "expense" as const,
      total,
      percentage: totalExpenses ? Math.round((total / totalExpenses) * 100) : 0,
      transaction_count: count,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total_income: totalIncome,
    total_expenses: totalExpenses,
    net: totalIncome - totalExpenses,
    categories,
  };
}

export interface CreateTransactionInput {
  amount: number;
  type: TransactionType;
  description: string;
  date: string;
  category_id: string;
  status?: Transaction["status"];
  is_recurring?: boolean;
  recurring_day?: number | null;
  shopping_list_id?: string | null;
}

export async function createTransaction(input: CreateTransactionInput): Promise<Transaction> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...input,
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
