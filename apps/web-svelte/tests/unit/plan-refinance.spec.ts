import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { buildRefinanceRpcParams, type RefinanceInput } from "$lib/services/plan-refinance";

const input: RefinanceInput = {
  oldPlanId: "old-1",
  userId: "u-1",
  groupId: null,
  newName: "Hipoteka 2026 (refinansowanie)",
  categoryId: null,
  disbursementDate: "2026-06-12",
  firstPaymentDate: "2026-08-10",
  endDate: "2036-10-10",
  originalAmount: 173000,
  annualRate: 5.96,
  monthlyPayment: 2255.01,
  firstPaymentAmount: 3115.38,
};

describe("buildRefinanceRpcParams", () => {
  it("maps the form input to the refinance_debt_plan RPC arguments", () => {
    const params = buildRefinanceRpcParams(input);
    expect(params.p_old_plan_id).toBe("old-1");
    expect(params.p_name).toBe("Hipoteka 2026 (refinansowanie)");
    expect(params.p_target_amount).toBe(173000);
    expect(params.p_start_date).toBe("2026-06-12");
    expect(params.p_end_date).toBe("2036-10-10");
    expect(params.p_annual_rate).toBe(5.96);
    expect(params.p_monthly_payment).toBe(2255.01);
  });

  it("carries the explicit first installment through", () => {
    const params = buildRefinanceRpcParams(input);
    expect(params.p_first_payment_date).toBe("2026-08-10");
    expect(params.p_first_payment_amount).toBe(3115.38);
  });

  it("omits user_id (the RPC sets it to auth.uid() server-side)", () => {
    const params = buildRefinanceRpcParams(input) as unknown as Record<string, unknown>;
    expect("p_user_id" in params).toBe(false);
    expect("user_id" in params).toBe(false);
  });

  it("passes group + category scope straight through", () => {
    const params = buildRefinanceRpcParams({
      ...input,
      groupId: "g-1",
      categoryId: "c-1",
    });
    expect(params.p_group_id).toBe("g-1");
    expect(params.p_category_id).toBe("c-1");
  });
});
