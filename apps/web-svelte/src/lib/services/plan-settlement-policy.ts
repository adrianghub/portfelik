import type {
  Plan,
  PlanKind,
  TransactionStatus,
  TransactionType,
  TransactionWithCategory,
} from "$lib/types";

/** Only paid rows count as financial truth for settlement and progress. */
export const SETTLEMENT_STATUSES: readonly TransactionStatus[] = ["paid"];

export function isSettlementStatus(status: TransactionStatus): boolean {
  return SETTLEMENT_STATUSES.includes(status);
}

export function settlementTypesForPlanKind(kind: PlanKind): TransactionType[] {
  switch (kind) {
    case "save":
      return ["income"];
    case "debt":
      return ["expense"];
  }
}

export function defaultSettlementTransactionType(kind: PlanKind): TransactionType {
  return kind === "save" ? "income" : "expense";
}

export function resolveSettlementTypes(
  plan: Pick<Plan, "kind">,
  opts?: { type?: TransactionType | "all" }
): TransactionType[] {
  const kind = plan.kind ?? "save";
  const allowed = settlementTypesForPlanKind(kind);
  if (opts?.type && opts.type !== "all" && allowed.includes(opts.type)) return [opts.type];
  return allowed;
}

export function isTransactionEligibleForPlanSettlement(input: {
  plan: Pick<Plan, "kind" | "start_date" | "end_date">;
  tx: Pick<TransactionWithCategory, "id" | "date" | "type" | "status">;
  blockedIds: ReadonlySet<string>;
  allowedTypes: readonly TransactionType[];
}): boolean {
  const { plan, tx, blockedIds, allowedTypes } = input;
  if (blockedIds.has(tx.id)) return false;
  if (tx.date < plan.start_date || tx.date > plan.end_date) return false;
  if (!isSettlementStatus(tx.status)) return false;
  return allowedTypes.includes(tx.type);
}
