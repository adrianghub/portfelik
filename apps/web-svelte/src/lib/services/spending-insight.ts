import { sumMoneyAmounts, moneyDifference } from "$lib/money";
import { isAllocationExpense } from "$lib/services/goal-spending";
import { ledgerTransactions } from "$lib/services/transaction-cashflow";
import type { TransactionWithCategory } from "$lib/types";

export interface SpendingBudget {
  categoryId: string;
  budgetAmount: number;
}
export interface CategoryInsight {
  categoryId: string;
  name: string;
  total: number;
  prevTotal: number;
  deltaAbs: number;
  deltaPct: number | null;
  avgTotal: number;
  anomaly: boolean;
  budgetAmount: number | null;
  budgetUsedPct: number | null;
}
export interface BiggestExpense {
  id: string;
  description: string;
  amount: number;
  date: string;
  categoryName: string;
}
export interface SpendingInsight {
  spent: number;
  net: number;
  prevSpent: number;
  spentDeltaPct: number | null;
  categories: CategoryInsight[];
  biggestMovers: CategoryInsight[];
  biggestExpenses: BiggestExpense[];
  isFirstPeriod: boolean;
}

const ANOMALY_RATIO = 1.5;
const TOP_N = 5;
/**
 * Baselines below these floors make percentage deltas explode (e.g. +225% off a
 * near-empty prior week), so we suppress the comparison instead of showing noise.
 */
const ANOMALY_BASELINE_FLOOR = 150;
const HEADLINE_DELTA_FLOOR = 150;
// Same floor as the headline: a 55 zł prior week under a 550 zł rent payment
// otherwise renders as "+898%" — technically true, pure noise.
const CATEGORY_DELTA_FLOOR = 150;

/** Sum expense amounts per category id; also capture a display name per id. */
function expenseByCategory(
  txs: TransactionWithCategory[]
): Map<string, { name: string; total: number }> {
  const map = new Map<string, { name: string; total: number }>();
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const cur = map.get(t.category_id) ?? { name: t.category_name, total: 0 };
    cur.total += Math.round(t.amount * 100);
    if (!cur.name) cur.name = t.category_name;
    map.set(t.category_id, cur);
  }
  for (const value of map.values()) value.total /= 100;
  return map;
}

function sumExpenses(txs: TransactionWithCategory[]): number {
  return sumMoneyAmounts(txs.filter((t) => t.type === "expense"));
}
function sumIncome(txs: TransactionWithCategory[]): number {
  return sumMoneyAmounts(txs.filter((t) => t.type === "income"));
}

export function computeSpendingInsight(input: {
  current: TransactionWithCategory[];
  previous: TransactionWithCategory[];
  rolling: TransactionWithCategory[];
  periodsInRolling: number;
  budgets: SpendingBudget[];
  saveLinkedIds?: ReadonlySet<string>;
  celeCategoryId?: string | null;
}): SpendingInsight {
  const { periodsInRolling, budgets, saveLinkedIds, celeCategoryId } = input;
  const exclude = (list: TransactionWithCategory[]) =>
    saveLinkedIds != null || celeCategoryId != null
      ? list.filter((t) => !isAllocationExpense(t, saveLinkedIds ?? new Set(), celeCategoryId))
      : list;
  const current = exclude(ledgerTransactions(input.current));
  const previous = exclude(ledgerTransactions(input.previous));
  const rolling = exclude(ledgerTransactions(input.rolling));

  const curByCat = expenseByCategory(current);
  const prevByCat = expenseByCategory(previous);
  const rollByCat = expenseByCategory(rolling);
  const budgetByCat = new Map(budgets.map((b) => [b.categoryId, b.budgetAmount]));
  const periods = periodsInRolling > 0 ? periodsInRolling : 1;

  const categories: CategoryInsight[] = [];
  for (const [categoryId, { name, total }] of curByCat) {
    const prevTotal = prevByCat.get(categoryId)?.total ?? 0;
    const deltaAbs = moneyDifference(total, prevTotal);
    const deltaPct = prevTotal < CATEGORY_DELTA_FLOOR ? null : (deltaAbs / prevTotal) * 100;
    const avgTotal = (rollByCat.get(categoryId)?.total ?? 0) / periods;
    const anomaly = avgTotal >= ANOMALY_BASELINE_FLOOR && total >= ANOMALY_RATIO * avgTotal;
    const budgetAmount = budgetByCat.get(categoryId) ?? null;
    const budgetUsedPct = budgetAmount && budgetAmount > 0 ? (total / budgetAmount) * 100 : null;
    categories.push({
      categoryId,
      name,
      total,
      prevTotal,
      deltaAbs,
      deltaPct,
      avgTotal,
      anomaly,
      budgetAmount,
      budgetUsedPct,
    });
  }
  categories.sort((a, b) => b.total - a.total);

  const biggestMovers = [...categories]
    .sort((a, b) => Math.abs(b.deltaAbs) - Math.abs(a.deltaAbs))
    .slice(0, TOP_N);

  const biggestExpenses: BiggestExpense[] = current
    .filter((t) => t.type === "expense")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, TOP_N)
    .map((t) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      date: t.date,
      categoryName: t.category_name,
    }));

  const spent = sumExpenses(current);
  const prevSpent = sumExpenses(previous);
  const net = moneyDifference(sumIncome(current), spent);
  const spentDeltaPct =
    prevSpent < HEADLINE_DELTA_FLOOR ? null : ((spent - prevSpent) / prevSpent) * 100;

  return {
    spent,
    net,
    prevSpent,
    spentDeltaPct,
    categories,
    biggestMovers,
    biggestExpenses,
    isFirstPeriod: previous.length === 0 && rolling.length === 0,
  };
}
