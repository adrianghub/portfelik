import {
  DEFAULT_SHOPPING_LIST_ITEM_CATEGORIES,
  normalizeShoppingListCategory,
} from "$lib/shopping-list-categories";
import { supabase } from "$lib/supabase";
import type { ShoppingItemCategory } from "$lib/types";

export async function ensureDefaultShoppingItemCategories(): Promise<void> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error("not_authenticated");

  const payload = DEFAULT_SHOPPING_LIST_ITEM_CATEGORIES.map((name, position) => ({
    user_id: user.id,
    name,
    position,
  }));

  const { error } = await supabase
    .from("shopping_item_categories")
    .upsert(payload, { onConflict: "user_id,name", ignoreDuplicates: true });
  if (error) throw error;
}

export async function fetchShoppingItemCategories(): Promise<ShoppingItemCategory[]> {
  const { data, error } = await supabase
    .from("shopping_item_categories")
    .select("id, user_id, name, position, created_at, updated_at")
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;

  if ((data ?? []).length === 0) {
    await ensureDefaultShoppingItemCategories();
    const refetch = await supabase
      .from("shopping_item_categories")
      .select("id, user_id, name, position, created_at, updated_at")
      .order("position", { ascending: true })
      .order("name", { ascending: true });
    if (refetch.error) throw refetch.error;
    return (refetch.data ?? []) as ShoppingItemCategory[];
  }

  return (data ?? []) as ShoppingItemCategory[];
}

export async function createShoppingItemCategory(input: {
  name: string;
  position?: number;
}): Promise<ShoppingItemCategory> {
  const name = normalizeShoppingListCategory(input.name);
  if (!name) throw new Error("name_required");

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error("not_authenticated");

  const { data, error } = await supabase
    .from("shopping_item_categories")
    .insert({ user_id: user.id, name, position: input.position ?? 0 })
    .select()
    .single();

  if (error) throw error;
  return data as ShoppingItemCategory;
}

export async function updateShoppingItemCategory(
  id: string,
  updates: Partial<{ name: string; position: number }>
): Promise<ShoppingItemCategory> {
  const payload: Partial<{ name: string; position: number }> = { ...updates };
  if (updates.name !== undefined) {
    const name = normalizeShoppingListCategory(updates.name);
    if (!name) throw new Error("name_required");
    payload.name = name;
  }

  const { data, error } = await supabase
    .from("shopping_item_categories")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ShoppingItemCategory;
}

export async function deleteShoppingItemCategory(id: string): Promise<void> {
  const { error } = await supabase.from("shopping_item_categories").delete().eq("id", id);
  if (error) throw error;
}

export async function swapShoppingItemCategoryPositions(
  first: ShoppingItemCategory,
  second: ShoppingItemCategory
): Promise<void> {
  const { error } = await supabase.from("shopping_item_categories").upsert([
    { id: first.id, user_id: first.user_id, name: first.name, position: second.position },
    { id: second.id, user_id: second.user_id, name: second.name, position: first.position },
  ]);
  if (error) throw error;
}
