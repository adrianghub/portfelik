import { deriveDebtDisplayBalance } from "$lib/services/plan-debt";
import { derivePlanBucket, isLivePlan, todayIso } from "$lib/services/plans";
import type {
  FinancialSnapshot,
  NetWorthItemValued,
  NetWorthSummary,
  Plan,
  PlanDebtTerms,
} from "$lib/types";
import { supabase } from "$lib/supabase";

export interface FinancialSnapshotInput {
  as_of_date: string;
}

export interface ComputeNetWorthArgs {
  /** Assets "as of" date, or null when the user has never saved net worth. */
  asOfDate: string | null;
  /** Custom asset items, already converted to PLN. */
  items: NetWorthItemValued[];
  derivedCash: number;
  debtBalances: number[];
}

export function computeNetWorth({
  asOfDate,
  items,
  derivedCash,
  debtBalances,
}: ComputeNetWorthArgs): NetWorthSummary {
  const cash = derivedCash;
  const otherAssets = items.reduce((s, it) => s + it.amountPln, 0);
  const totalAssets = cash + otherAssets;
  const totalDebt = debtBalances.reduce((s, b) => s + b, 0);
  return {
    hasSnapshot: asOfDate !== null,
    hasData: asOfDate !== null || items.length > 0 || cash !== 0,
    asOfDate,
    cash,
    items,
    otherAssets,
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
    return deriveDebtDisplayBalance(terms, plan.start_date, linkedExpenses, asOfDate);
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
    .filter((plan) => plan.kind === "debt" && isLivePlan(plan))
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

  // Assets now live in net_worth_items; the snapshot row only carries the "as of"
  // date for the net-worth display. Legacy amount columns are kept at 0.
  const payload = {
    user_id: user.id,
    as_of_date: input.as_of_date,
    cash_amount: 0,
    investments_amount: 0,
    real_estate_amount: 0,
  };

  const { data, error } = await supabase
    .from("financial_snapshots")
    .upsert(payload, { onConflict: "user_id" })
    .select()
    .single();
  if (error) throw error;
  return data as FinancialSnapshot;
}
