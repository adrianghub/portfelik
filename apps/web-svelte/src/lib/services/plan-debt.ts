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

export type DebtLinkedPayment = { amount: number; date?: string };

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

/** One amortization period: accrue interest, then apply payment toward principal. */
export function applyDebtPaymentPeriod(
  balance: number,
  annualRate: number,
  payment: number
): number {
  if (balance <= 0.01) return 0;
  const monthlyRate = annualRate / 100 / 12;
  const interest = balance * monthlyRate;
  const actualPayment = Math.min(Math.abs(payment), balance + interest);
  const principal = Math.max(0, actualPayment - interest);
  return Math.max(0, balance - principal);
}

/**
 * Collapse linked expenses into ordered payment periods.
 * Dated rows are grouped by calendar month (ascending) — one interest period per month —
 * even when other rows are undated. Undated rows have unknown timing, so each stays its own
 * period and they are applied AFTER all dated months, in input order. The result is fully
 * deterministic regardless of the order linked expenses arrive in.
 */
export function consolidateDebtLinkedPayments(linkedExpenses: DebtLinkedPayment[]): number[] {
  if (linkedExpenses.length === 0) return [];
  const byMonth = new Map<string, number>();
  const undated: number[] = [];
  for (const exp of linkedExpenses) {
    const month = exp.date?.slice(0, 7);
    if (month) {
      byMonth.set(month, (byMonth.get(month) ?? 0) + Math.abs(exp.amount));
    } else {
      undated.push(Math.abs(exp.amount));
    }
  }
  const datedPeriods = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, sum]) => sum);
  return [...datedPeriods, ...undated];
}

/**
 * Remaining balance after linked raty: each payment covers interest first, then principal.
 * Uses plan annual rate; groups multiple links in the same calendar month into one period.
 */
export function deriveDebtBalanceFromLinks(
  originalAmount: number,
  annualRate: number,
  linkedExpenses: DebtLinkedPayment[]
): number {
  if (linkedExpenses.length === 0) return Math.max(0, originalAmount);
  let balance = Math.max(0, originalAmount);
  for (const payment of consolidateDebtLinkedPayments(linkedExpenses)) {
    balance = applyDebtPaymentPeriod(balance, annualRate, payment);
    if (balance <= 0.01) return 0;
  }
  return Math.round(balance * 100) / 100;
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
  const payload = {
    plan_id: planId,
    original_amount: normalized.original_amount,
    current_balance: normalized.current_balance,
    annual_rate: normalized.annual_rate,
    monthly_payment: normalized.monthly_payment,
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

/** Persist derived balance when at least one payment expense is linked. */
export async function applyDebtBalanceFromLinks(
  planId: string,
  originalAmount: number,
  annualRate: number,
  linkedExpenses: DebtLinkedPayment[]
): Promise<void> {
  if (linkedExpenses.length === 0) return;
  const derived = deriveDebtBalanceFromLinks(originalAmount, annualRate, linkedExpenses);
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
