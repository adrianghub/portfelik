import { supabase } from "$lib/supabase";
import type { FinancialSnapshot, NetWorthSummary } from "$lib/types";

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
