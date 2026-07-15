import { GOAL_EXPENSE_CATEGORY_NAME } from "$lib/constants/categories";
import { ledgerTransactions } from "$lib/services/transaction-cashflow";
import type { TransactionWithCategory } from "$lib/types";

export interface GoalSpendingSplit {
  /** Cele expenses linked to active save plans. */
  goalContributions: number;
  /** Unlinked expenses in the Cele category. */
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
 * Goal activity = linked contributions + unlinked Cele expenses.
 */
export function computeGoalSpendingSplit(
  txs: TransactionWithCategory[],
  saveLinkedIds: ReadonlySet<string>,
  celeCategoryId?: string | null
): GoalSpendingSplit {
  const ledger = ledgerTransactions(txs);
  let goalContributions = 0;
  let celeExpenses = 0;
  let otherExpenses = 0;

  for (const tx of ledger) {
    if (tx.type !== "expense") continue;
    if (saveLinkedIds.has(tx.id)) {
      goalContributions += tx.amount;
      continue;
    }
    if (celeCategoryId && tx.category_id === celeCategoryId) {
      celeExpenses += tx.amount;
    } else {
      otherExpenses += tx.amount;
    }
  }

  return {
    goalContributions,
    celeExpenses,
    otherExpenses,
    hasGoalActivity: goalContributions > 0 || celeExpenses > 0,
  };
}
