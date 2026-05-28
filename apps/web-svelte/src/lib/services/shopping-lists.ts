import { supabase } from "$lib/supabase";
import { normalizeShoppingListCategory } from "$lib/shopping-list-categories";
import type {
  ShoppingList,
  ShoppingListBucket,
  ShoppingListItem,
  ShoppingListMode,
  ShoppingListSummary,
  ShoppingListWithItems,
  Transaction,
} from "$lib/types";

const LIST_COLUMNS =
  "id, name, status, user_id, group_id, category_id, total_amount, completed_at, planned_for, shopping_started_at, created_at, updated_at";

type ShoppingListSummaryRow = ShoppingList & {
  shopping_list_items: { id: string; completed: boolean }[];
  transactions?: { id: string }[];
};

function todayIso(): string {
  // Local-day comparison matches Postgres `current_date` for the user's timezone.
  // Buckets only need day granularity; the small DST/UTC edge near midnight
  // is acceptable for a one-day-resolution input.
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function deriveShoppingListMode(list: ShoppingList): ShoppingListMode {
  if (list.completed_at) return "done";
  if (list.shopping_started_at) return "shopping";
  return "planning";
}

export function deriveShoppingListBucket(
  list: ShoppingList,
  today = todayIso()
): ShoppingListBucket {
  if (list.completed_at) return "archived";
  if (list.shopping_started_at) return "active";
  return list.planned_for > today ? "upcoming" : "active";
}

function toShoppingListSummary(list: ShoppingListSummaryRow, today: string): ShoppingListSummary {
  return {
    ...list,
    item_total: list.shopping_list_items.length,
    item_completed: list.shopping_list_items.filter((i) => i.completed).length,
    linked_transaction_id: list.transactions?.[0]?.id ?? null,
    mode: deriveShoppingListMode(list),
    bucket: deriveShoppingListBucket(list, today),
  };
}

export async function fetchShoppingListItemHistory(): Promise<
  Pick<ShoppingListItem, "name" | "quantity" | "unit" | "category">[]
> {
  const { data, error } = await supabase
    .from("shopping_list_items")
    .select("name, quantity, unit, category")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data as Pick<ShoppingListItem, "name" | "quantity" | "unit" | "category">[];
}

export async function fetchShoppingLists(): Promise<ShoppingListSummary[]> {
  const { data, error } = await supabase
    .from("shopping_lists")
    .select(`${LIST_COLUMNS}, shopping_list_items(id, completed), transactions(id)`)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const today = todayIso();
  return ((data ?? []) as ShoppingListSummaryRow[]).map((row) => toShoppingListSummary(row, today));
}

export async function fetchShoppingListById(id: string): Promise<ShoppingListWithItems> {
  const { data, error } = await supabase
    .from("shopping_lists")
    .select(
      `${LIST_COLUMNS}, shopping_list_items(id, name, completed, quantity, unit, category, position, created_at, updated_at, shopping_list_id), transactions(id)`
    )
    .eq("id", id)
    .single();

  if (error) throw error;

  const raw = data as ShoppingListWithItems & {
    shopping_list_items: NonNullable<typeof data>["shopping_list_items"];
    transactions?: { id: string }[];
  };
  raw.shopping_list_items = raw.shopping_list_items?.sort((a, b) => a.position - b.position) ?? [];
  raw.linked_transaction_id = raw.transactions?.[0]?.id ?? null;
  return raw;
}

export async function createShoppingList(input: {
  name: string;
  group_id?: string | null;
  category_id?: string | null;
  planned_for?: string | null;
}): Promise<ShoppingList> {
  const name = input.name?.trim();
  if (!name) throw new Error("name_required");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const payload = {
    name,
    status: "active" as const,
    user_id: user.id,
    group_id: input.group_id ?? null,
    category_id: input.category_id ?? null,
    ...(input.planned_for ? { planned_for: input.planned_for } : {}),
  };

  const { data, error } = await supabase.from("shopping_lists").insert(payload).select().single();

  if (error) throw error;
  return data as ShoppingList;
}

export async function updateShoppingList(
  id: string,
  updates: Partial<{
    name: string;
    group_id: string | null;
    category_id: string | null;
    planned_for: string;
  }>
): Promise<ShoppingList> {
  if (updates.name !== undefined) {
    const name = updates.name.trim();
    if (!name) throw new Error("name_required");
    updates = { ...updates, name };
  }

  const { data, error } = await supabase
    .from("shopping_lists")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ShoppingList;
}

export async function startShoppingList(id: string): Promise<ShoppingList> {
  const { data, error } = await supabase
    .from("shopping_lists")
    .update({ shopping_started_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as ShoppingList;
}

export async function returnShoppingListToPlanning(id: string): Promise<ShoppingList> {
  const { data, error } = await supabase
    .from("shopping_lists")
    .update({ shopping_started_at: null })
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

export async function attachShoppingListToTransaction(
  listId: string,
  txId: string
): Promise<Transaction> {
  const { data, error } = await supabase.rpc("attach_shopping_list_to_transaction", {
    p_list_id: listId,
    p_tx_id: txId,
  });
  if (error) throw error;
  return data as unknown as Transaction;
}

export async function fetchAttachableShoppingListsForTransaction(
  txGroupId: string | null,
  limit = 30
): Promise<ShoppingListSummary[]> {
  // Mirror the RPC's sharing-scope check: private tx → private lists; group tx → same-group lists.
  // RLS already enforces visibility; this scope filter mirrors server-side rejection.
  let q = supabase
    .from("shopping_lists")
    .select(`${LIST_COLUMNS}, shopping_list_items(id, completed)`)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(limit);
  q = txGroupId === null ? q.is("group_id", null) : q.eq("group_id", txGroupId);

  const { data, error } = await q;
  if (error) throw error;

  const today = todayIso();
  return ((data ?? []) as ShoppingListSummaryRow[])
    .filter((list) => list.shopping_list_items.length > 0)
    .map((row) => toShoppingListSummary(row, today));
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

export async function duplicateShoppingList(id: string): Promise<ShoppingList> {
  const { data, error } = await supabase.rpc("duplicate_shopping_list", { p_list_id: id });
  if (error) throw error;
  return data as ShoppingList;
}

export async function createShoppingListItem(input: {
  shopping_list_id: string;
  name: string;
  quantity?: number | null;
  unit?: string | null;
  category?: string | null;
  position: number;
}): Promise<ShoppingListItem> {
  const name = input.name?.trim();
  if (!name) throw new Error("name_required");
  const category = normalizeShoppingListCategory(input.category);

  const { data, error } = await supabase
    .from("shopping_list_items")
    .insert({ ...input, name, category, completed: false })
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
    category: string | null;
    position: number;
  }>
): Promise<ShoppingListItem> {
  if (updates.name !== undefined) {
    const name = updates.name.trim();
    if (!name) throw new Error("name_required");
    updates = { ...updates, name };
  }
  if (updates.category !== undefined) {
    updates = { ...updates, category: normalizeShoppingListCategory(updates.category) };
  }

  const { data, error } = await supabase
    .from("shopping_list_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as ShoppingListItem;
}

export async function updateShoppingListItemsCategory(
  itemIds: string[],
  category: string | null
): Promise<void> {
  if (itemIds.length === 0) return;
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ category: normalizeShoppingListCategory(category) })
    .in("id", itemIds);
  if (error) throw error;
}

export async function deleteShoppingListItem(id: string): Promise<void> {
  const { error } = await supabase.from("shopping_list_items").delete().eq("id", id);
  if (error) throw error;
}

export async function setAllShoppingListItemsCompleted(
  listId: string,
  completed: boolean
): Promise<void> {
  const { error } = await supabase
    .from("shopping_list_items")
    .update({ completed })
    .eq("shopping_list_id", listId);
  if (error) throw error;
}

export async function deleteAllShoppingListItems(listId: string): Promise<void> {
  const { error } = await supabase
    .from("shopping_list_items")
    .delete()
    .eq("shopping_list_id", listId);
  if (error) throw error;
}
