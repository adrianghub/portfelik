import { moneyDifference, sumMoneyAmounts } from "$lib/money";

/**
 * Commitment on a spend item. A date is an orientation until the user confirms it.
 * Cash leaves only when a transaction is linked later. Reservation is a future state.
 */
export type SpendItemStatus = "estimated" | "planned" | "confirmed" | "cancelled";

export interface SpendItemAmounts {
  amount: number;
  status: SpendItemStatus;
  /** Paid linked transactions. Omitted until settlement exists for the line. */
  settled?: number;
}

export interface SpendItemSettlement {
  settled: number;
  remaining: number;
  overpaid: number;
}

/** Words on the row. A date without confirmation stays an estimate. */
export type SpendItemFacingStatus = "estimated" | "confirmed" | "partial" | "paid" | "cancelled";

export function spendItemFacingStatus(
  status: SpendItemStatus,
  settlement?: Pick<SpendItemSettlement, "settled" | "remaining"> | null
): SpendItemFacingStatus {
  if (status === "cancelled") return "cancelled";
  const settled = settlement?.settled ?? 0;
  const remaining = settlement?.remaining ?? 0;
  if (settled > 0 && remaining <= 0) return "paid";
  if (settled > 0 && remaining > 0) return "partial";
  if (status === "confirmed") return "confirmed";
  return "estimated";
}

/** Another payment can be linked while a confirmed obligation still has a remainder. */
export function spendItemNeedsLink(
  status: SpendItemStatus,
  settlement?: Pick<SpendItemSettlement, "settled" | "remaining"> | null
): boolean {
  const facing = spendItemFacingStatus(status, settlement);
  return facing === "confirmed" || facing === "partial";
}

export interface SpendBudgetSummary {
  budget: number;
  /** Estimated, scheduled, and confirmed lines. Cancelled lines stay stored and drop out. */
  planned: number;
  /** Linked paid amount (item and plan-level). */
  spent: number;
  /** Confirmed payments only. A date without confirmation is not yet an obligation. */
  toPay: number;
  /** Dated lines the user has not confirmed. They stay visible beside a zero due amount. */
  orientational: number;
  /** Undated estimates still in the plan. */
  estimates: number;
  /** spent + toPay + orientational + estimates. */
  projectedCost: number;
  /** Budget minus planned lines. Negative means the plan exceeds its cap. */
  budgetLeft: number;
  /** Budget minus projectedCost. Negative means overrun against expected cost. */
  cushion: number;
}

export function normalizeSpendBudget(amount: number | null | undefined): number {
  if (amount == null || Number.isNaN(amount) || amount <= 0) throw new Error("budget_required");
  return Math.round(Math.abs(amount) * 100) / 100;
}

export function normalizeSpendItem(input: {
  label: string;
  amount: number | null;
  dueDate: string | null;
  payee?: string | null;
  confirmed?: boolean;
  cancelled?: boolean;
}): {
  label: string;
  amount: number;
  due_date: string | null;
  status: SpendItemStatus;
  payee: string | null;
} {
  const label = input.label.trim();
  if (!label) throw new Error("item_label_required");
  if (label.length > 120) throw new Error("item_label_too_long");
  if (input.amount == null || Number.isNaN(input.amount) || input.amount <= 0) {
    throw new Error("item_amount_required");
  }
  const amount = Math.round(Math.abs(input.amount) * 100) / 100;
  const dueDate = input.dueDate?.trim() ? input.dueDate.trim() : null;
  const payee = input.payee?.trim() ? input.payee.trim() : null;
  if (payee && payee.length > 160) throw new Error("item_payee_too_long");
  if (input.confirmed && !input.cancelled && !dueDate) {
    throw new Error("item_confirm_needs_date");
  }
  const status: SpendItemStatus = input.cancelled
    ? "cancelled"
    : !dueDate
      ? "estimated"
      : input.confirmed
        ? "confirmed"
        : "planned";
  return {
    label,
    amount,
    due_date: status === "estimated" ? null : dueDate,
    status,
    payee,
  };
}

/** Remainder after paid transactions. Extra payments stay visible as an overpayment. */
export function settleSpendItem(
  amount: number,
  payments: readonly { amount: number; counts: boolean }[]
): SpendItemSettlement {
  const settled = sumMoneyAmounts(payments.filter((payment) => payment.counts));
  const difference = moneyDifference(amount, settled);
  return {
    settled,
    remaining: difference > 0 ? difference : 0,
    overpaid: difference < 0 ? Math.abs(difference) : 0,
  };
}

function unsettledAmount(item: SpendItemAmounts): number {
  return settleSpendItem(item.amount, [{ amount: item.settled ?? 0, counts: true }]).remaining;
}

/** Budget math in grosze. Estimates count against the cap and are not due payments. */
export function summarizeSpendBudget(
  budget: number,
  items: readonly SpendItemAmounts[],
  opts?: { spent?: number }
): SpendBudgetSummary {
  const active = items.filter((item) => item.status !== "cancelled");
  const confirmed = active.filter((item) => item.status === "confirmed");
  const orientational = active.filter((item) => item.status === "planned");
  const estimated = active.filter((item) => item.status === "estimated");
  const planned = sumMoneyAmounts(active);
  const toPay = sumMoneyAmounts(confirmed.map((item) => ({ amount: unsettledAmount(item) })));
  const orientationalAmount = sumMoneyAmounts(
    orientational.map((item) => ({ amount: unsettledAmount(item) }))
  );
  const estimates = sumMoneyAmounts(estimated.map((item) => ({ amount: unsettledAmount(item) })));
  const spent = Math.round(Math.abs(opts?.spent ?? 0) * 100) / 100;
  const projectedCost = sumMoneyAmounts([
    { amount: spent },
    { amount: toPay },
    { amount: orientationalAmount },
    { amount: estimates },
  ]);
  return {
    budget,
    planned,
    spent,
    toPay,
    orientational: orientationalAmount,
    estimates,
    projectedCost,
    budgetLeft: moneyDifference(budget, planned),
    cushion: moneyDifference(budget, projectedCost),
  };
}
