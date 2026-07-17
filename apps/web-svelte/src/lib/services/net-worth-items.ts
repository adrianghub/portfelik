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
 * Prefer `saveNetWorthSnapshot` for the /plans form — it atomically writes
 * snapshot + cash anchor + items.
 */
