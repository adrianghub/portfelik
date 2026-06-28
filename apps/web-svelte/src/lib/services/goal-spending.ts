import { GOAL_EXPENSE_CATEGORY_NAME } from "$lib/constants/categories";
import { ledgerTransactions } from "$lib/services/transaction-cashflow";
import type { TransactionWithCategory } from "$lib/types";

export interface GoalSpendingSplit {
  /** Income linked to active save plans this period. */
  goalLinkedIncome: number;
  /** Expenses in the Cele category. */
  celeExpenses: number;
  /** All other expenses in the period. */
  otherExpenses: number;
  hasGoalActivity: boolean;
}

export function resolveCeleCategoryId(
  categories: { id: string; name: string; type: string }[]
): string | null {
  return (
    categories.find((c) => c.type === "expense" && c.name === GOAL_EXPENSE_CATEGORY_NAME)?.id ??
    null
  );
}

/**
 * Split period expenses into goal-oriented vs discretionary buckets.
 * Goal activity = save-plan linked income + Cele-category expenses.
 */
export function computeGoalSpendingSplit(
  txs: TransactionWithCategory[],
  saveLinkedIds: ReadonlySet<string>,
  celeCategoryId?: string | null
): GoalSpendingSplit {
  const ledger = ledgerTransactions(txs);
  let goalLinkedIncome = 0;
  let celeExpenses = 0;
  let otherExpenses = 0;

  for (const tx of ledger) {
    if (tx.type === "income" && saveLinkedIds.has(tx.id)) {
      goalLinkedIncome += tx.amount;
      continue;
    }
    if (tx.type !== "expense") continue;
    if (celeCategoryId && tx.category_id === celeCategoryId) {
      celeExpenses += tx.amount;
    } else {
      otherExpenses += tx.amount;
    }
  }

  return {
    goalLinkedIncome,
    celeExpenses,
    otherExpenses,
    hasGoalActivity: goalLinkedIncome > 0 || celeExpenses > 0,
  };
}
