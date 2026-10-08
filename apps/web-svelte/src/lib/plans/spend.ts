import { moneyDifference, sumMoneyAmounts } from "$lib/money";

/** Commitment on a spend item. Cash leaves only when a transaction is linked later. */
export type SpendItemStatus = "estimated" | "reserved" | "cancelled";

export interface SpendItemAmounts {
  amount: number;
  status: SpendItemStatus;
}

export interface SpendBudgetSummary {
  budget: number;
  /** Estimated and reserved lines. Cancelled lines stay stored and drop out. */
  planned: number;
  /** Dated commitments only. Estimates are not yet payments. */
  reserved: number;
  /** Reserved amount still unpaid. Linked transactions are a later slice, so this equals reserved. */
  toPay: number;
  /** Budget minus planned lines. Negative means the plan exceeds its cap. */
  budgetLeft: number;
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
  const status: SpendItemStatus = input.cancelled
    ? "cancelled"
    : dueDate
      ? "reserved"
      : "estimated";
  return {
    label,
    amount,
    due_date: status === "estimated" ? null : dueDate,
    status,
    payee,
  };
}

/** Budget math in grosze. Estimates count against the cap and are not due payments. */
export function summarizeSpendBudget(
  budget: number,
  items: readonly SpendItemAmounts[]
): SpendBudgetSummary {
  const active = items.filter((item) => item.status !== "cancelled");
  const reservedItems = active.filter((item) => item.status === "reserved");
  const planned = sumMoneyAmounts(active);
  const reserved = sumMoneyAmounts(reservedItems);
  return {
    budget,
    planned,
    reserved,
    toPay: reserved,
    budgetLeft: moneyDifference(budget, planned),
  };
}
