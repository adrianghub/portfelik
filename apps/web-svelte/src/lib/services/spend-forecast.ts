import { confirmedSpendForecastFlows, type SpendForecastItem } from "$lib/plans/spend-forecast";
import type { SpendItemStatus } from "$lib/plans/spend";
import { fetchSpendSettlements } from "$lib/services/plan-settlement";
import { supabase } from "$lib/supabase";

export interface PrivateSpendForecastSource {
  items: SpendForecastItem[];
  links: {
    planItemId: string;
    transactionId: string;
    amount: number;
    countsAsPaid: boolean;
  }[];
}

/** Active private spend plans the caller can read. Group plans are a different cash scope. */
export async function fetchPrivateSpendForecastSource(): Promise<PrivateSpendForecastSource> {
  const { data: plans, error } = await supabase
    .from("plans")
    .select("id, kind, group_id, status")
    .eq("kind", "spend")
    .eq("status", "active")
    .is("group_id", null);
  if (error) throw error;
  const planIds = (plans ?? [])
    .filter((plan) => plan.kind === "spend" && plan.group_id === null && plan.status === "active")
    .map((plan) => plan.id);
  if (planIds.length === 0) return { items: [], links: [] };

  const { data: items, error: itemsError } = await supabase
    .from("plan_items")
    .select("id, amount, due_date, status")
    .in("plan_id", planIds);
  if (itemsError) throw itemsError;

  const settlements = await Promise.all(planIds.map((planId) => fetchSpendSettlements(planId)));
  return {
    items: (items ?? []).map((item) => ({
      id: item.id,
      amount: Number(item.amount),
      dueDate: item.due_date,
      status: item.status as SpendItemStatus,
      groupId: null,
    })),
    links: settlements.flat().map((row) => ({
      planItemId: row.planItemId,
      transactionId: row.transactionId,
      amount: row.amount,
      countsAsPaid: row.countsAsPaid,
    })),
  };
}

export { confirmedSpendForecastFlows };
