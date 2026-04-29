import { supabase } from "$lib/supabase";
import type {
  ShoppingList,
  ShoppingListItem,
  ShoppingListWithItems,
  Transaction,
} from "$lib/types";

export async function fetchShoppingListItemHistory(): Promise<
  Pick<ShoppingListItem, "name" | "quantity" | "unit">[]
> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("name, quantity, unit")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as Pick<ShoppingListItem, "name" | "quantity" | "unit">[];
}

export async function fetchShoppingLists(): Promise<ShoppingList[]> {
  const { data, error } = await supabase
    .from("shopping_lists")
    .select(
      "id, name, status, user_id, group_id, category_id, total_amount, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as ShoppingList[];
}

export async function fetchShoppingListById(id: string): Promise<ShoppingListWithItems> {
  const { data, error } = await supabase
    .from("shopping_lists")
    .select(
      "id, name, status, user_id, group_id, category_id, total_amount, created_at, updated_at, shopping_list_items(id, name, completed, quantity, unit, position, created_at, updated_at, shopping_list_id)"
    )
    .eq("id", id)
    .single();

  if (error) throw error;

  const list = data as ShoppingListWithItems & {
    shopping_list_items: NonNullable<typeof data>["shopping_list_items"];
  };
  list.shopping_list_items =
    list.shopping_list_items?.sort((a, b) => a.position - b.position) ?? [];
  return list;
}

export async function createShoppingList(input: {
  name: string;
  group_id?: string | null;
  category_id?: string | null;
}): Promise<ShoppingList> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data, error } = await supabase
    .from("shopping_lists")
    .insert({ ...input, status: "active", user_id: user.id })
    .select()
    .single();

  if (error) throw error;
  return data as ShoppingList;
}

export async function updateShoppingList(
  id: string,
  updates: Partial<{ name: string; group_id: string | null; category_id: string | null }>
): Promise<ShoppingList> {
  const { data, error } = await supabase
    .from("shopping_lists")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ShoppingList;
}

export async function deleteShoppingList(id: string): Promise<void> {
  const { error } = await supabase.from("shopping_lists").delete().eq("id", id);
  if (error) throw error;
}

export async function completeShoppingList(
  id: string,
  totalAmount: number,
  categoryId: string
): Promise<Transaction> {
  const { data, error } = await supabase.rpc("complete_shopping_list", {
    p_list_id: id,
    p_total_amount: Math.abs(totalAmount),
    p_category_id: categoryId,
  });
  if (error) throw error;
  return data as unknown as Transaction;
}

export async function createShoppingListItem(input: {
  shopping_list_id: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  position: number;
}): Promise<ShoppingListItem> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .insert({ ...input, completed: false })
    .select()
    .single();

  if (error) throw error;
  return data as ShoppingListItem;
}

export async function updateShoppingListItem(
  id: string,
  updates: Partial<{
    name: string;
    completed: boolean;
    quantity: number | null;
    unit: string | null;
    position: number;
  }>
): Promise<ShoppingListItem> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ShoppingListItem;
}

export async function deleteShoppingListItem(id: string): Promise<void> {
  const { error } = await supabase.from("shopping_list_items").delete().eq("id", id);
  if (error) throw error;
}
