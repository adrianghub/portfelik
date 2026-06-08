import type { MonthlySummary, TransactionWithCategory } from "$lib/types";

export function computeSummary(transactions: TransactionWithCategory[]): MonthlySummary {
  const totalIncome = transactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  const catMap = new Map<string, { name: string; total: number; count: number }>();
  transactions
    .filter((t) => t.type === "expense")
    .forEach((t) => {
      const e = catMap.get(t.category_id);
      if (e) {
        e.total += t.amount;
        e.count++;
      } else {
        catMap.set(t.category_id, { name: t.category_name, total: t.amount, count: 1 });
      }
    });

  const categories: MonthlySummary["categories"] = Array.from(catMap.entries())
    .map(([id, { name, total, count }]) => ({
      category_id: id,
      category_name: name,
      type: "expense" as const,
      total,
      percentage: totalExpenses ? Math.round((total / totalExpenses) * 100) : 0,
      transaction_count: count,
    }))
    .sort((a, b) => b.total - a.total);

  return {
    total_income: totalIncome,
    total_expenses: totalExpenses,
    net: totalIncome - totalExpenses,
    categories,
  };
}
