import { deriveDebtDisplayBalance } from "$lib/services/plan-debt";
import { derivePlanBucket, todayIso } from "$lib/services/plans";
import type { FinancialSnapshot, NetWorthSummary, Plan, PlanDebtTerms } from "$lib/types";
import { supabase } from "$lib/supabase";

export interface FinancialSnapshotInput {
  as_of_date: string;
  cash_amount: number;
  investments_amount: number;
  real_estate_amount: number;
}

export function computeNetWorth(
  snapshot: FinancialSnapshot | null,
  debtBalances: number[]
): NetWorthSummary {
  const cash = snapshot ? Number(snapshot.cash_amount) : 0;
  const investments = snapshot ? Number(snapshot.investments_amount) : 0;
  const realEstate = snapshot ? Number(snapshot.real_estate_amount) : 0;
  const totalAssets = cash + investments + realEstate;
  const totalDebt = debtBalances.reduce((sum, balance) => sum + balance, 0);

  return {
    hasSnapshot: snapshot != null,
    asOfDate: snapshot?.as_of_date ?? null,
    cash,
    investments,
    realEstate,
    totalAssets,
    totalDebt,
    netWorth: totalAssets - totalDebt,
  };
}

/**
 * Balance for one active debt plan in net-worth (finished only if balance remains).
 * Debts are always valued as of today (assets keep the snapshot date) so the figure
 * matches the plan detail headline.
 */
export function debtBalanceForNetWorth(
  plan: Pick<Plan, "start_date" | "end_date" | "target_amount">,
  terms: PlanDebtTerms | undefined,
  asOfDate = todayIso(),
  linkedExpenses: { amount: number; date: string }[] = []
): number {
  const bucket = derivePlanBucket(plan, asOfDate);

  if (bucket === "upcoming") {
    return 0;
  }

  if (bucket === "finished") {
    if (!terms) return 0;
    const remaining = Number(terms.current_balance);
    return remaining > 0.01 ? remaining : 0;
  }

  if (terms) {
    return deriveDebtDisplayBalance(terms, linkedExpenses, asOfDate);
  }

  // Active plan without terms row yet - use target_amount from create form.
  const fallback = plan.target_amount != null ? Number(plan.target_amount) : 0;
  return fallback > 0.01 ? fallback : 0;
}

export function collectNetWorthDebtBalances(
  plans: Plan[],
  termsByPlanId: Record<string, PlanDebtTerms>,
  asOfDate = todayIso(),
  linkedExpensesByPlanId: Record<string, { amount: number; date: string }[]> = {}
): number[] {
  return plans
    .filter((plan) => plan.kind === "debt")
    .map((plan) =>
      debtBalanceForNetWorth(
        plan,
        termsByPlanId[plan.id],
        asOfDate,
        linkedExpensesByPlanId[plan.id] ?? []
      )
    )
    .filter((balance) => balance > 0.01);
}

export async function fetchFinancialSnapshot(): Promise<FinancialSnapshot | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data, error } = await supabase
    .from("financial_snapshots")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return (data as FinancialSnapshot | null) ?? null;
}

export async function upsertFinancialSnapshot(
  input: FinancialSnapshotInput
): Promise<FinancialSnapshot> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const payload = {
    user_id: user.id,
    as_of_date: input.as_of_date,
    cash_amount: Math.max(0, input.cash_amount),
    investments_amount: Math.max(0, input.investments_amount),
    real_estate_amount: Math.max(0, input.real_estate_amount),
  };

  const { data, error } = await supabase
    .from("financial_snapshots")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data as FinancialSnapshot;
}
