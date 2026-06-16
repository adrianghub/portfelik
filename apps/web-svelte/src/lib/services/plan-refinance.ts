import { supabase } from "$lib/supabase";
import { upsertPlanDebtTerms } from "$lib/services/plan-debt";
import type { Plan } from "$lib/types";

export interface RefinanceInput {
  oldPlanId: string;
  userId: string;
  groupId: string | null;
  newName: string;
  categoryId: string | null;
  disbursementDate: string; // ISO -> new plan start_date
  firstPaymentDate: string; // ISO
  endDate: string; // ISO
  originalAmount: number;
  annualRate: number;
  monthlyPayment: number;
  firstPaymentAmount: number | null;
}

export interface RefinancePlanRows {
  newPlan: Pick<
    Plan,
    | "name"
    | "user_id"
    | "group_id"
    | "category_id"
    | "kind"
    | "target_amount"
    | "start_date"
    | "end_date"
    | "status"
    | "refinanced_from_plan_id"
  >;
  newTerms: {
    original_amount: number;
    current_balance: number;
    annual_rate: number;
    monthly_payment: number;
    first_payment_date: string;
    first_payment_amount: number | null;
  };
  oldPatch: { status: "refinanced"; replaced_by_plan_id: string };
}

/** Pure mapping from refinance input to the rows we will persist. Testable without a DB. */
export function buildRefinancePlans(input: RefinanceInput, newPlanId: string): RefinancePlanRows {
  return {
    newPlan: {
      name: input.newName,
      user_id: input.userId,
      group_id: input.groupId,
      category_id: input.categoryId,
      kind: "debt",
      target_amount: input.originalAmount,
      start_date: input.disbursementDate,
      end_date: input.endDate,
      status: "active",
      refinanced_from_plan_id: input.oldPlanId,
    },
    newTerms: {
      original_amount: input.originalAmount,
      current_balance: input.originalAmount,
      annual_rate: input.annualRate,
      monthly_payment: input.monthlyPayment,
      first_payment_date: input.firstPaymentDate,
      first_payment_amount: input.firstPaymentAmount,
    },
    oldPatch: { status: "refinanced", replaced_by_plan_id: newPlanId },
  };
}

/**
 * Execute a refinance: create the new debt plan + terms, archive the old plan, link both.
 * No transactions are written (the cash wash nets zero). Rolls back the new plan if terms fail.
 */
export async function refinanceDebtPlan(input: RefinanceInput): Promise<{ newPlanId: string }> {
  const draft = buildRefinancePlans(input, "");
  const { data: created, error: createErr } = await supabase
    .from("plans")
    .insert(draft.newPlan)
    .select("id")
    .single();
  if (createErr) throw createErr;
  const newPlanId = (created as { id: string }).id;

  try {
    await upsertPlanDebtTerms(newPlanId, { ...draft.newTerms });
    const { error: patchErr } = await supabase
      .from("plans")
      .update({ status: "refinanced", replaced_by_plan_id: newPlanId })
      .eq("id", input.oldPlanId);
    if (patchErr) throw patchErr;
  } catch (err) {
    await supabase.from("plans").delete().eq("id", newPlanId);
    throw err;
  }
  return { newPlanId };
}
