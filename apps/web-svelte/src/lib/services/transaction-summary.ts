import type { MonthlySummary, TransactionWithCategory } from "$lib/types";
import { isSupportedLedgerCurrency } from "$lib/ledger-currency";

export function computeSummary(transactions: TransactionWithCategory[]): MonthlySummary {
  const supportedTransactions = transactions.filter((t) => isSupportedLedgerCurrency(t.currency));
  const incomeCents = supportedTransactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + Math.round(t.amount * 100), 0);
  const expenseCents = supportedTransactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + Math.round(t.amount * 100), 0);

  const catMap = new Map<string, { name: string; total: number; count: number }>();
  supportedTransactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const e = catMap.get(t.category_id);
      if (e) {
        e.total += Math.round(t.amount * 100);
        e.count++;
      } else {
        catMap.set(t.category_id, {
          name: t.category_name,
          total: Math.round(t.amount * 100),
          count: 1,
        });
      }
    });

  const categories: MonthlySummary["categories"] = Array.from(catMap.entries())
    .map(([id, { name, total, count }]) => ({
      category_id: id,
      category_name: name,
      type: "expense" as const,
      total: total / 100,
      percentage: expenseCents ? Math.round((total / expenseCents) * 100) : 0,
      transaction_count: count,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total_income: incomeCents / 100,
    total_expenses: expenseCents / 100,
    net: (incomeCents - expenseCents) / 100,
    categories,
  };
}
