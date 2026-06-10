import { todayIso } from "$lib/services/plans";
import { supabase } from "$lib/supabase";
import type { PlanDebtTerms } from "$lib/types";
import {
  deriveDebtBalanceFromLinks,
  type DebtBalanceReplayInput,
  type DebtLinkedPayment,
} from "$lib/services/debt-balance-replay";

export type {
  DebtBalanceReplayInput,
  DebtBalanceReplayMode,
  DebtLinkedPayment,
} from "$lib/services/debt-balance-replay";

export {
  applyDebtPaymentPeriod,
  consolidateDebtLinkedPayments,
  deriveDebtBalanceFromLinks,
  filterPreAnchorPayments,
  interestAccruedFromLinkedPayments,
  isSnapshotDebtReplay,
  resolveDebtReplay,
} from "$lib/services/debt-balance-replay";

export type PlanDebtTermsInput = {
  original_amount: number;
  current_balance: number;
  annual_rate: number;
  monthly_payment: number;
  payment_day?: number | null;
  anchor_transaction_id?: string | null;
  anchor_balance?: number | null;
  balance_anchor_date?: string | null;
  /** Reset snapshot anchor from current_balance + today (manual balance edit). */
  reset_balance_anchor?: boolean;
  /** Clear snapshot anchor for full replay from original_amount. */
  clear_balance_anchor?: boolean;
};

export function debtBalanceReplayFromTerms(
  terms: Pick<
    PlanDebtTerms,
    "original_amount" | "annual_rate" | "anchor_balance" | "balance_anchor_date"
  >,
  linkedExpenses: DebtLinkedPayment[]
): DebtBalanceReplayInput {
  return {
    originalAmount: Number(terms.original_amount),
    annualRate: Number(terms.annual_rate),
    anchorBalance: terms.anchor_balance,
    balanceAnchorDate: terms.balance_anchor_date,
    linkedExpenses,
  };
}

export function normalizeDebtTermsInput(input: PlanDebtTermsInput): PlanDebtTermsInput {
  const original = Math.abs(Number(input.original_amount));
  const balanceProvided =
    input.current_balance != null && !Number.isNaN(Number(input.current_balance));
  const balance = balanceProvided ? Math.abs(Number(input.current_balance)) : original;
  const rate = Number(input.annual_rate);
  const payment = Math.abs(Number(input.monthly_payment));

  if (!original || Number.isNaN(original)) throw new Error("debt_original_required");
  if (!payment || Number.isNaN(payment)) throw new Error("debt_payment_required");
  if (Number.isNaN(rate) || rate < 0) throw new Error("debt_rate_invalid");
  if (balance > original) throw new Error("debt_balance_exceeds_original");

  return {
    ...input,
    original_amount: original,
    current_balance: balance,
    annual_rate: rate,
    monthly_payment: payment,
  };
}

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
  const normalized = normalizeDebtTermsInput(input);
  const existing = await fetchPlanDebtTerms(planId);

  let anchor_balance: number | null = existing?.anchor_balance ?? null;
  let balance_anchor_date: string | null = existing?.balance_anchor_date ?? null;

  if (input.clear_balance_anchor) {
    anchor_balance = null;
    balance_anchor_date = null;
  } else if (input.reset_balance_anchor) {
    anchor_balance = normalized.current_balance;
    balance_anchor_date = todayIso();
  } else if (input.anchor_balance !== undefined || input.balance_anchor_date !== undefined) {
    if (input.anchor_balance !== undefined) anchor_balance = input.anchor_balance;
    if (input.balance_anchor_date !== undefined) {
      balance_anchor_date = input.balance_anchor_date;
    }
  } else if (!existing) {
    anchor_balance = normalized.current_balance;
    balance_anchor_date = todayIso();
  }

  const payload = {
    plan_id: planId,
    original_amount: normalized.original_amount,
    current_balance: normalized.current_balance,
    annual_rate: normalized.annual_rate,
    monthly_payment: normalized.monthly_payment,
    payment_day: input.payment_day ?? null,
    anchor_transaction_id: input.anchor_transaction_id ?? null,
    anchor_balance,
    balance_anchor_date,
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

/** Persist derived balance from linked payment replay (does not mutate snapshot anchor). */
export async function applyDebtBalanceFromLinks(
  planId: string,
  terms: Pick<
    PlanDebtTerms,
    "original_amount" | "annual_rate" | "anchor_balance" | "balance_anchor_date"
  >,
  linkedExpenses: DebtLinkedPayment[]
): Promise<void> {
  const derived = deriveDebtBalanceFromLinks(debtBalanceReplayFromTerms(terms, linkedExpenses));
  await updatePlanDebtBalance(planId, derived);
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
