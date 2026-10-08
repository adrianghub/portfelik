import { moneyDifference, sumMoneyAmounts } from "$lib/money";

/**
 * Commitment on a spend item. A date is an orientation until the user confirms it.
 * Cash leaves only when a transaction is linked later. Reservation is a future state.
 */
export type SpendItemStatus = "estimated" | "planned" | "confirmed" | "cancelled";

export interface SpendItemAmounts {
  amount: number;
  status: SpendItemStatus;
}

export interface SpendBudgetSummary {
  budget: number;
  /** Estimated, planned, and confirmed lines. Cancelled lines stay stored and drop out. */
  planned: number;
  /** Confirmed payments only. A date without confirmation is not yet an obligation. */
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

/** Budget math in grosze. Estimates count against the cap and are not due payments. */
export function summarizeSpendBudget(
  budget: number,
  items: readonly SpendItemAmounts[]
): SpendBudgetSummary {
  const active = items.filter((item) => item.status !== "cancelled");
  const confirmed = active.filter((item) => item.status === "confirmed");
  const planned = sumMoneyAmounts(active);
  return {
    budget,
    planned,
    toPay: sumMoneyAmounts(confirmed),
    budgetLeft: moneyDifference(budget, planned),
  };
}
