import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { buildRefinancePlans, type RefinanceInput } from "$lib/services/plan-refinance";

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

describe("buildRefinancePlans", () => {
  it("maps the new plan row as an active debt plan linking the old one", () => {
    const { newPlan } = buildRefinancePlans(input, "new-1");
    expect(newPlan.kind).toBe("debt");
    expect(newPlan.status).toBe("active");
    expect(newPlan.refinanced_from_plan_id).toBe("old-1");
    expect(newPlan.start_date).toBe("2026-06-12");
    expect(newPlan.user_id).toBe("u-1");
  });

  it("maps the new debt terms with the explicit first installment", () => {
    const { newTerms } = buildRefinancePlans(input, "new-1");
    expect(newTerms.first_payment_amount).toBe(3115.38);
    expect(newTerms.first_payment_date).toBe("2026-08-10");
    expect(newTerms.current_balance).toBe(173000);
  });

  it("maps the old-plan archive patch", () => {
    const { oldPatch } = buildRefinancePlans(input, "new-1");
    expect(oldPatch.status).toBe("refinanced");
    expect(oldPatch.replaced_by_plan_id).toBe("new-1");
  });
});
