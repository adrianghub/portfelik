import { todayIso } from "$lib/services/plans";
import { supabase } from "$lib/supabase";
import type { PlanDebtTerms } from "$lib/types";
import {
  interestPaidThrough,
  liveBalance,
  type DebtScheduleTerms,
} from "$lib/services/debt-schedule";

export type DebtLinkedPayment = { amount: number; date?: string };

/** Snapshot anchor present (both balance and date set). */
export function isSnapshotDebtReplay(
  anchorBalance: number | null | undefined,
  balanceAnchorDate: string | null | undefined
): boolean {
  return anchorBalance != null && balanceAnchorDate != null;
}

/** Build schedule terms from stored debt terms + the plan's start date (disbursement). */
export function scheduleTermsFromDebt(
  terms: Pick<
    PlanDebtTerms,
    | "original_amount"
    | "annual_rate"
    | "monthly_payment"
    | "first_payment_date"
    | "first_payment_amount"
  >,
  planStartDate: string
): DebtScheduleTerms {
  return {
    originalAmount: Number(terms.original_amount),
    annualRate: Number(terms.annual_rate),
    monthlyPayment: Number(terms.monthly_payment),
    disbursementDate: planStartDate,
    firstPaymentDate: terms.first_payment_date ?? planStartDate,
    firstPaymentAmount: terms.first_payment_amount ?? null,
  };
}

/** Canonical live balance: snapshot anchor (or original) replayed over actual linked payments. */
export function deriveDebtDisplayBalance(
  terms: Pick<
    PlanDebtTerms,
    | "original_amount"
    | "annual_rate"
    | "monthly_payment"
    | "anchor_balance"
    | "balance_anchor_date"
    | "first_payment_date"
    | "first_payment_amount"
  >,
  planStartDate: string,
  linkedExpenses: DebtLinkedPayment[] = [],
  asOfDateIso: string = todayIso()
): number {
  const scheduleTerms = scheduleTermsFromDebt(terms, planStartDate);
  return liveBalance(
    scheduleTerms,
    { anchorBalance: terms.anchor_balance, balanceAnchorDate: terms.balance_anchor_date },
    linkedExpenses,
    asOfDateIso
  );
}

/** Cumulative interest billed since plan start, read off the schedule. */
export function estimateInterestPaidSince(
  terms: Pick<
    PlanDebtTerms,
    | "original_amount"
    | "annual_rate"
    | "monthly_payment"
    | "first_payment_date"
    | "first_payment_amount"
  >,
  planStartDate: string,
  asOfDateIso: string = todayIso()
): number {
  return interestPaidThrough(scheduleTermsFromDebt(terms, planStartDate), asOfDateIso);
}

export type PlanDebtTermsInput = {
  original_amount: number;
  current_balance: number;
  annual_rate: number;
  monthly_payment: number;
  first_payment_date?: string | null;
  first_payment_amount?: number | null;
  anchor_balance?: number | null;
  balance_anchor_date?: string | null;
  /** Reset snapshot anchor from current_balance + today (manual balance edit). */
  reset_balance_anchor?: boolean;
  /** Clear snapshot anchor for full replay from original_amount. */
  clear_balance_anchor?: boolean;
};

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
    // Preserve stored first-payment terms when the caller omits them (e.g. the
    // DebtPlanDetail terms-edit / full-replay paths) - only an explicit value
    // (including null) overwrites. Otherwise editing terms would wipe the odd
    // first-installment schedule.
    first_payment_date:
      input.first_payment_date !== undefined
        ? input.first_payment_date
        : (existing?.first_payment_date ?? null),
    first_payment_amount:
      input.first_payment_amount !== undefined
        ? input.first_payment_amount
        : (existing?.first_payment_amount ?? null),
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

/** Persist the derived live balance into the current_balance cache (does not mutate the snapshot anchor). */
export async function applyDebtBalanceFromLinks(
  planId: string,
  terms: Pick<
    PlanDebtTerms,
    | "original_amount"
    | "annual_rate"
    | "monthly_payment"
    | "anchor_balance"
    | "balance_anchor_date"
    | "first_payment_date"
    | "first_payment_amount"
  >,
  planStartDate: string,
  linkedExpenses: DebtLinkedPayment[]
): Promise<void> {
  const derived = deriveDebtDisplayBalance(terms, planStartDate, linkedExpenses, todayIso());
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
