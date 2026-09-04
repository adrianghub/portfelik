import { GOAL_EXPENSE_CATEGORY_NAME } from "$lib/constants/categories";
import { forecastTransactions, ledgerTransactions } from "$lib/services/transaction-cashflow";
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

export function isAllocationExpense(
  tx: Pick<TransactionWithCategory, "id" | "type" | "category_id">,
  saveLinkedIds: ReadonlySet<string>,
  celeCategoryId?: string | null
): boolean {
  if (tx.type !== "expense") return false;
  if (saveLinkedIds.has(tx.id)) return true;
  return Boolean(celeCategoryId && tx.category_id === celeCategoryId);
}

function partitionExpenses(
  txs: TransactionWithCategory[],
  saveLinkedIds: ReadonlySet<string>,
  celeCategoryId?: string | null
): { consumption: TransactionWithCategory[]; allocation: TransactionWithCategory[] } {
  const consumption: TransactionWithCategory[] = [];
  const allocation: TransactionWithCategory[] = [];
  for (const tx of txs) {
    if (tx.type !== "expense") continue;
    if (isAllocationExpense(tx, saveLinkedIds, celeCategoryId)) allocation.push(tx);
    else consumption.push(tx);
  }
  return { consumption, allocation };
}

/** Partition realized expenses for historical reporting. */
export function partitionLedgerExpenses(
  txs: TransactionWithCategory[],
  saveLinkedIds: ReadonlySet<string>,
  celeCategoryId?: string | null
): { consumption: TransactionWithCategory[]; allocation: TransactionWithCategory[] } {
  return partitionExpenses(ledgerTransactions(txs), saveLinkedIds, celeCategoryId);
}

/** Partition realized and scheduled expenses for forecast reporting. */
export function partitionForecastExpenses(
  txs: TransactionWithCategory[],
  saveLinkedIds: ReadonlySet<string>,
  celeCategoryId?: string | null
): { consumption: TransactionWithCategory[]; allocation: TransactionWithCategory[] } {
  return partitionExpenses(forecastTransactions(txs), saveLinkedIds, celeCategoryId);
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
    if (isAllocationExpense(tx, saveLinkedIds, celeCategoryId)) {
      if (saveLinkedIds.has(tx.id)) {
        goalContributions += tx.amount;
      } else {
        celeExpenses += tx.amount;
      }
      continue;
    }
    otherExpenses += tx.amount;
  }

  return {
    goalContributions,
    celeExpenses,
    otherExpenses,
    hasGoalActivity: goalContributions > 0 || celeExpenses > 0,
  };
}
