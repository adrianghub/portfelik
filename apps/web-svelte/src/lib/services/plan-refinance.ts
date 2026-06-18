import { supabase } from "$lib/supabase";
import type { Database } from "$lib/supabase.types";

type RefinanceRpcArgs = Database["public"]["Functions"]["refinance_debt_plan"]["Args"];

/** Fields the user enters in the refinance form. The parent fills in identity/scope. */
export interface RefinanceFormInput {
  newName: string;
  disbursementDate: string; // ISO -> new plan start_date
  firstPaymentDate: string; // ISO
  endDate: string; // ISO
  originalAmount: number;
  annualRate: number;
  monthlyPayment: number;
  firstPaymentAmount: number | null;
}

export interface RefinanceInput extends RefinanceFormInput {
  oldPlanId: string;
  userId: string;
  groupId: string | null;
  categoryId: string | null;
}

/** Named arguments for the `refinance_debt_plan` Postgres RPC. */
export interface RefinanceRpcParams {
  p_old_plan_id: string;
  p_name: string;
  p_group_id: string | null;
  p_category_id: string | null;
  p_target_amount: number;
  p_start_date: string;
  p_end_date: string;
  p_annual_rate: number;
  p_monthly_payment: number;
  p_first_payment_date: string;
  p_first_payment_amount: number | null;
}

/**
 * Pure mapping from refinance form input to the RPC arguments. Testable without a DB.
 * `user_id` is intentionally omitted: the RPC sets it to `auth.uid()` server-side so
 * the new plan can never be created under another user's identity.
 */
export function buildRefinanceRpcParams(input: RefinanceInput): RefinanceRpcParams {
  return {
    p_old_plan_id: input.oldPlanId,
    p_name: input.newName,
    p_group_id: input.groupId,
    p_category_id: input.categoryId,
    p_target_amount: input.originalAmount,
    p_start_date: input.disbursementDate,
    p_end_date: input.endDate,
    p_annual_rate: input.annualRate,
    p_monthly_payment: input.monthlyPayment,
    p_first_payment_date: input.firstPaymentDate,
    p_first_payment_amount: input.firstPaymentAmount,
  };
}

/**
 * Execute a refinance atomically via the `refinance_debt_plan` RPC: it creates the
 * new active debt plan + terms and archives the old plan in a single transaction, so
 * an interrupted client can never leave both the old and new loans active (which would
 * double-count the debt). No transactions are written (the cash wash nets to zero).
 */
export async function refinanceDebtPlan(input: RefinanceInput): Promise<{ newPlanId: string }> {
  // Nullable uuid/numeric RPC args (group_id, category_id, first_payment_amount) are
  // valid as null at runtime; the generated Args type models them as non-null, so cast.
  const { data, error } = await supabase.rpc(
    "refinance_debt_plan",
    buildRefinanceRpcParams(input) as RefinanceRpcArgs
  );
  if (error) throw error;
  return { newPlanId: data as string };
}
