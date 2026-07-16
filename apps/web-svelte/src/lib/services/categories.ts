import { supabase } from "$lib/supabase";
import type { Category, TransactionType } from "$lib/types";

export async function fetchCategories(): Promise<Category[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error("Not authenticated");

  const { data, error } = await supabase
    .from("categories")
    .select("id, name, type, user_id, created_at, updated_at")
    .eq("user_id", user.id)
    .order("name");

  if (error) throw error;
  return data as Category[];
}

export async function createCategory(input: {
  name: string;
  type: TransactionType;
}): Promise<Category> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error("Not authenticated");

  const { data, error } = await supabase
    .from("categories")
    .insert({ ...input, user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data as Category;
}

export async function updateCategory(
  id: string,
  updates: Partial<{ name: string; type: TransactionType }>
): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Category;
}

/** True when any transaction or categorization rule references the category. */
export async function isCategoryReferenced(id: string): Promise<boolean> {
  const [txs, rules] = await Promise.all([
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id),
    supabase
      .from("categorization_rules")
      .select("id", { count: "exact", head: true })
      .eq("category_id", id),
  ]);
  if (txs.error) throw txs.error;
  if (rules.error) throw rules.error;
  return (txs.count ?? 0) > 0 || (rules.count ?? 0) > 0;
}

export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}
