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

/** Sum expense amounts per category id; also capture a display name per id. */
function expenseByCategory(
  txs: TransactionWithCategory[]
): Map<string, { name: string; total: number }> {
  const map = new Map<string, { name: string; total: number }>();
  for (const t of txs) {
    if (t.type !== "expense") continue;
    const cur = map.get(t.category_id) ?? { name: t.category_name, total: 0 };
    cur.total += t.amount;
    if (!cur.name) cur.name = t.category_name;
    map.set(t.category_id, cur);
  }
  return map;
}

function sumExpenses(txs: TransactionWithCategory[]): number {
  return txs.reduce((s, t) => (t.type === "expense" ? s + t.amount : s), 0);
}
function sumIncome(txs: TransactionWithCategory[]): number {
  return txs.reduce((s, t) => (t.type === "income" ? s + t.amount : s), 0);
}

export function computeSpendingInsight(input: {
  current: TransactionWithCategory[];
  previous: TransactionWithCategory[];
  rolling: TransactionWithCategory[];
  periodsInRolling: number;
  budgets: SpendingBudget[];
}): SpendingInsight {
  const { periodsInRolling, budgets } = input;
  const current = ledgerTransactions(input.current);
  const previous = ledgerTransactions(input.previous);
  const rolling = ledgerTransactions(input.rolling);

  const curByCat = expenseByCategory(current);
  const prevByCat = expenseByCategory(previous);
  const rollByCat = expenseByCategory(rolling);
  const budgetByCat = new Map(budgets.map((b) => [b.categoryId, b.budgetAmount]));
  const periods = periodsInRolling > 0 ? periodsInRolling : 1;

  const categories: CategoryInsight[] = [];
  for (const [categoryId, { name, total }] of curByCat) {
    const prevTotal = prevByCat.get(categoryId)?.total ?? 0;
    const deltaAbs = total - prevTotal;
    const deltaPct = prevTotal === 0 ? null : (deltaAbs / prevTotal) * 100;
    const avgTotal = (rollByCat.get(categoryId)?.total ?? 0) / periods;
    const anomaly = avgTotal > 0 && total >= ANOMALY_RATIO * avgTotal;
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
  const net = sumIncome(current) - spent;
  const spentDeltaPct = prevSpent === 0 ? null : ((spent - prevSpent) / prevSpent) * 100;

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
