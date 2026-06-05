import { supabase } from "$lib/supabase";
import type { TransactionWithCategory } from "$lib/types";

export interface PlanTransactionLink {
  id: string;
  plan_id: string;
  transaction_id: string;
  created_by: string;
  created_at: string;
}

export interface PlanSettlementProgress {
  planId: string;
  planName: string;
  plannedAmount: number | null;
  linkedAmount: number;
  linkedCount: number;
  remaining: number | null;
}

export async function fetchPlanLinks(planId: string): Promise<PlanTransactionLink[]> {
  const { data, error } = await supabase
    .from("plan_transaction_links")
    .select("id, plan_id, transaction_id, created_by, created_at")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlanTransactionLink[];
}

export async function linkPlanTransaction(
  planId: string,
  transactionId: string
): Promise<PlanTransactionLink> {
  const { data, error } = await supabase.rpc("link_plan_transaction", {
    p_plan_id: planId,
    p_transaction_id: transactionId,
  });
  if (error) throw error;
  return data as PlanTransactionLink;
}

export async function unlinkPlanTransaction(planId: string, transactionId: string): Promise<void> {
  const { error } = await supabase.rpc("unlink_plan_transaction", {
    p_plan_id: planId,
    p_transaction_id: transactionId,
  });
  if (error) throw error;
}

export async function fetchLinkedTransactions(planId: string): Promise<TransactionWithCategory[]> {
  const links = await fetchPlanLinks(planId);
  if (links.length === 0) return [];
  const ids = links.map((l) => l.transaction_id);
  const { data, error } = await supabase
    .from("transactions_with_category")
    .select("*")
    .in("id", ids)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransactionWithCategory[];
}

export async function fetchEligibleSettlementTransactions(
  planId: string,
  opts?: { start?: string; end?: string }
): Promise<TransactionWithCategory[]> {
  const { data: plan, error: planError } = await supabase
    .from("shopping_lists")
    .select("id, user_id, group_id, planned_for, category_id")
    .eq("id", planId)
    .single();
  if (planError) throw planError;

  const start =
    opts?.start ??
    (() => {
      const d = new Date(plan.planned_for);
      d.setDate(d.getDate() - 30);
      return d.toISOString().slice(0, 10);
    })();
  const end =
    opts?.end ??
    (() => {
      const d = new Date(plan.planned_for);
      d.setDate(d.getDate() + 60);
      return d.toISOString().slice(0, 10);
    })();

  let query = supabase
    .from("transactions_with_category")
    .select("*")
    .eq("type", "expense")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false })
    .limit(200);

  if (plan.group_id) {
    query = query.eq("group_id", plan.group_id);
  } else {
    query = query.eq("user_id", plan.user_id);
  }

  const { data, error } = await query;
  if (error) throw error;

  const { data: linked, error: linkError } = await supabase
    .from("plan_transaction_links")
    .select("transaction_id")
    .neq("plan_id", planId);
  if (linkError) throw linkError;
  const blocked = new Set((linked ?? []).map((r) => r.transaction_id));

  return ((data ?? []) as TransactionWithCategory[]).filter((tx) => !blocked.has(tx.id));
}

export function computePlanProgress(input: {
  planId: string;
  planName: string;
  plannedAmount: number | null;
  linkedTransactions: TransactionWithCategory[];
}): PlanSettlementProgress {
  const linkedAmount = input.linkedTransactions.reduce((s, t) => s + t.amount, 0);
  const remaining =
    input.plannedAmount != null && input.plannedAmount > 0
      ? Math.max(0, input.plannedAmount - linkedAmount)
      : null;
  return {
    planId: input.planId,
    planName: input.planName,
    plannedAmount: input.plannedAmount,
    linkedAmount,
    linkedCount: input.linkedTransactions.length,
    remaining,
  };
}

export async function fetchActivePlanProgress(): Promise<PlanSettlementProgress[]> {
  const { data: plans, error } = await supabase
    .from("shopping_lists")
    .select("id, name, total_amount, completed_at")
    .is("completed_at", null)
    .order("planned_for", { ascending: true })
    .limit(8);
  if (error) throw error;
  if (!plans?.length) return [];

  const planIds = plans.map((p) => p.id);
  const { data: links, error: linkError } = await supabase
    .from("plan_transaction_links")
    .select("plan_id, transaction_id")
    .in("plan_id", planIds);
  if (linkError) throw linkError;

  const txIds = [...new Set((links ?? []).map((l) => l.transaction_id))];
  const txById = new Map<string, TransactionWithCategory>();
  if (txIds.length > 0) {
    const { data: txs, error: txError } = await supabase
      .from("transactions_with_category")
      .select("*")
      .in("id", txIds);
    if (txError) throw txError;
    for (const t of txs ?? []) {
      if (t.id) txById.set(t.id, t as TransactionWithCategory);
    }
  }

  return plans.map((plan) => {
    const linkedTxs = (links ?? [])
      .filter((l) => l.plan_id === plan.id)
      .map((l) => txById.get(l.transaction_id))
      .filter((t): t is TransactionWithCategory => !!t);
    return computePlanProgress({
      planId: plan.id,
      planName: plan.name,
      plannedAmount: plan.total_amount,
      linkedTransactions: linkedTxs,
    });
  });
}
