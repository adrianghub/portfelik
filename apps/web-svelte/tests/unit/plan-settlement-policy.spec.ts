import { describe, expect, it } from "vitest";
import {
  isTransactionEligibleForPlanSettlement,
  resolveSettlementTypes,
  settlementTypesForPlanKind,
} from "$lib/services/plan-settlement-policy";
import type { Plan, TransactionWithCategory } from "$lib/types";

const plan: Pick<Plan, "kind" | "start_date" | "end_date"> = {
  kind: "debt",
  start_date: "2026-01-01",
  end_date: "2026-12-31",
};

function tx(
  overrides: Partial<TransactionWithCategory>
): Pick<TransactionWithCategory, "id" | "date" | "type" | "status"> {
  return {
    id: "tx-1",
    date: "2026-06-01",
    type: "expense",
    status: "paid",
    ...overrides,
  };
}

describe("plan-settlement-policy", () => {
  it("maps kinds to settlement types", () => {
    expect(settlementTypesForPlanKind("save")).toEqual(["income"]);
    expect(settlementTypesForPlanKind("debt")).toEqual(["expense"]);
  });

  it("rejects draft and wrong type for loan plans", () => {
    const blocked = new Set<string>();
    expect(
      isTransactionEligibleForPlanSettlement({
        plan,
        tx: tx({ type: "income" }),
        blockedIds: blocked,
        allowedTypes: resolveSettlementTypes(plan),
      })
    ).toBe(false);
    expect(
      isTransactionEligibleForPlanSettlement({
        plan,
        tx: tx({ status: "upcoming" }),
        blockedIds: blocked,
        allowedTypes: resolveSettlementTypes(plan),
      })
    ).toBe(false);
    expect(
      isTransactionEligibleForPlanSettlement({
        plan,
        tx: tx({ type: "expense", status: "paid" }),
        blockedIds: blocked,
        allowedTypes: resolveSettlementTypes(plan),
      })
    ).toBe(true);
  });

  it("ignores type overrides outside the plan kind policy", () => {
    expect(resolveSettlementTypes({ kind: "debt" }, { type: "income" })).toEqual(["expense"]);
    expect(resolveSettlementTypes({ kind: "save" }, { type: "expense" })).toEqual(["income"]);
    expect(resolveSettlementTypes({ kind: "debt" }, { type: "all" })).toEqual(["expense"]);
  });
});
