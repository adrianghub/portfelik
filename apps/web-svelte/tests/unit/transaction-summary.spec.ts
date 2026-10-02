import { describe, expect, it } from "vitest";
import { computeSummary } from "$lib/services/transaction-summary";
import { bucketPeriodHistory } from "$lib/services/period-history";
import type { TransactionWithCategory } from "$lib/types";

function row(amount: number, type: "income" | "expense" = "expense"): TransactionWithCategory {
  return {
    amount,
    type,
    currency: "PLN",
    category_id: "food",
    category_name: "Jedzenie",
    date: "2026-09-13",
  } as TransactionWithCategory;
}

describe("financial aggregation precision", () => {
  it("calculates period totals, category totals and net in grosze", () => {
    const summary = computeSummary([row(0.1), row(0.2), row(0.4, "income")]);
    expect(summary.total_expenses).toBe(0.3);
    expect(summary.total_income).toBe(0.4);
    expect(summary.net).toBe(0.1);
    expect(summary.categories[0].total).toBe(0.3);
  });

  it("keeps history buckets and their category breakdown exact", () => {
    const [bucket] = bucketPeriodHistory(
      [row(0.1), row(0.2)],
      [{ label: "Wrz", start: "2026-09-01", end: "2026-10-01" }]
    );
    expect(bucket.total).toBe(0.3);
    expect(bucket.categories).toEqual([{ name: "Jedzenie", total: 0.3 }]);
  });
});
