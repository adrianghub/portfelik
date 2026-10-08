import { supabase } from "$lib/supabase";
import { normalizeSpendItem, type SpendItemStatus } from "$lib/plans/spend";

export interface PlanItem {
  id: string;
  plan_id: string;
  label: string;
  amount: number;
  due_date: string | null;
  status: SpendItemStatus;
  payee: string | null;
  created_at: string;
  updated_at: string;
}

const PLAN_ITEM_COLUMNS =
  "id, plan_id, label, amount, due_date, status, payee, created_at, updated_at";

export async function fetchPlanItems(planId: string): Promise<PlanItem[]> {
  const { data, error } = await supabase
    .from("plan_items")
    .select(PLAN_ITEM_COLUMNS)
    .eq("plan_id", planId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlanItem[];
}

type PlanItemInput = {
  label: string;
  amount: number | null;
  dueDate: string | null;
  payee?: string | null;
  confirmed?: boolean;
};

export async function createPlanItem(planId: string, input: PlanItemInput): Promise<PlanItem> {
  const row = normalizeSpendItem(input);
  const { data, error } = await supabase
    .from("plan_items")
    .insert({ plan_id: planId, ...row })
    .select(PLAN_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return data as PlanItem;
}

export async function updatePlanItem(id: string, input: PlanItemInput): Promise<PlanItem> {
  const row = normalizeSpendItem(input);
  const { data, error } = await supabase
    .from("plan_items")
    .update(row)
    .eq("id", id)
    .select(PLAN_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return data as PlanItem;
}

/** Cancellation drops confirmation. Restoring a dated line brings it back as a scheduled payment. */
export async function restorePlanItem(
  item: Pick<PlanItem, "id" | "label" | "amount" | "due_date" | "payee">
): Promise<PlanItem> {
  return updatePlanItem(item.id, {
    label: item.label,
    amount: item.amount,
    dueDate: item.due_date,
    payee: item.payee,
    confirmed: false,
  });
}

export async function cancelPlanItem(id: string): Promise<PlanItem> {
  const { data, error } = await supabase
    .from("plan_items")
    .update({ status: "cancelled" })
    .eq("id", id)
    .select(PLAN_ITEM_COLUMNS)
    .single();
  if (error) throw error;
  return data as PlanItem;
}
