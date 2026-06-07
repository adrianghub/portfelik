import { supabase } from "$lib/supabase";
import type { PlanDebtTerms } from "$lib/types";

export type PlanDebtTermsInput = {
  original_amount: number;
  current_balance: number;
  annual_rate: number;
  monthly_payment: number;
  payment_day?: number | null;
  anchor_transaction_id?: string | null;
};

export async function fetchPlanDebtTerms(planId: string): Promise<PlanDebtTerms | null> {
  const { data, error } = await supabase
    .from("plan_debt_terms")
    .select("*")
    .eq("plan_id", planId)
    .maybeSingle();
  if (error) throw error;
  return (data as PlanDebtTerms | null) ?? null;
}

export async function upsertPlanDebtTerms(
  planId: string,
  input: PlanDebtTermsInput
): Promise<PlanDebtTerms> {
  const payload = {
    plan_id: planId,
    original_amount: input.original_amount,
    current_balance: input.current_balance,
    annual_rate: input.annual_rate,
    monthly_payment: input.monthly_payment,
    payment_day: input.payment_day ?? null,
    anchor_transaction_id: input.anchor_transaction_id ?? null,
  };
  const { data, error } = await supabase
    .from("plan_debt_terms")
    .upsert(payload, { onConflict: "plan_id" })
    .select()
    .single();
  if (error) throw error;
  return data as PlanDebtTerms;
}

export async function updatePlanDebtBalance(planId: string, currentBalance: number): Promise<void> {
  const { error } = await supabase
    .from("plan_debt_terms")
    .update({ current_balance: currentBalance })
    .eq("plan_id", planId);
  if (error) throw error;
}

export async function setDebtAnchorTransaction(
  planId: string,
  transactionId: string | null
): Promise<void> {
  const { error } = await supabase
    .from("plan_debt_terms")
    .update({ anchor_transaction_id: transactionId })
    .eq("plan_id", planId);
  if (error) throw error;
}

export async function fetchPlanDebtTermsByPlanIds(
  planIds: string[]
): Promise<Record<string, PlanDebtTerms>> {
  if (planIds.length === 0) return {};
  const { data, error } = await supabase.from("plan_debt_terms").select("*").in("plan_id", planIds);
  if (error) throw error;
  const out: Record<string, PlanDebtTerms> = {};
  for (const row of (data ?? []) as PlanDebtTerms[]) {
    out[row.plan_id] = row;
  }
  return out;
}
