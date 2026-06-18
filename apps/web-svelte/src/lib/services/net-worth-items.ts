import { supabase } from "$lib/supabase";
import type { NetWorthItem } from "$lib/types";

export interface NetWorthItemInput {
  /** Present for existing rows; absent for new ones. */
  id?: string;
  label: string;
  amount: number;
  currency: string;
}

/** Pure: rows present before but absent from `next` must be deleted. */
export function diffRemovedItemIds(
  existing: { id: string }[],
  next: NetWorthItemInput[]
): string[] {
  const keep = new Set(next.filter((i) => i.id).map((i) => i.id as string));
  return existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
}

export async function fetchNetWorthItems(): Promise<NetWorthItem[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data, error } = await supabase
    .from("net_worth_items")
    .select("*")
    .eq("user_id", user.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as NetWorthItem[]) ?? [];
}

/**
 * Reconcile the user's items to exactly `items`: delete removed rows, upsert the
 * rest. Blank-labelled rows are dropped. `position` follows array order.
 */
export async function saveNetWorthItems(items: NetWorthItemInput[]): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const cleaned = items.filter((i) => i.label.trim().length > 0);

  const existing = await fetchNetWorthItems();
  const toDelete = diffRemovedItemIds(existing, cleaned);
  if (toDelete.length > 0) {
    const { error } = await supabase.from("net_worth_items").delete().in("id", toDelete);
    if (error) throw error;
  }

  if (cleaned.length === 0) return;

  const payload = cleaned.map((i, idx) => ({
    ...(i.id ? { id: i.id } : {}),
    user_id: user.id,
    label: i.label.trim().slice(0, 60),
    amount: Math.max(0, i.amount),
    currency: i.currency,
    position: idx,
  }));

  const { error } = await supabase.from("net_worth_items").upsert(payload);
  if (error) throw error;
}
