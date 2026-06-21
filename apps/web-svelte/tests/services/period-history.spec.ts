import { describe, expect, it } from "vitest";
import {
  buildPeriodWindows,
  bucketPeriodHistory,
  computePeriodHistory,
  stackCategoryHistory,
} from "$lib/services/period-history";
import type { TransactionWithCategory } from "$lib/types";

function tx(p: {
  date: string;
  amount: number;
  type?: "expense" | "income";
  category_name?: string;
}): TransactionWithCategory {
  return {
    type: p.type ?? "expense",
    date: p.date,
    amount: p.amount,
    category_name: p.category_name ?? "Inne",
  } as unknown as TransactionWithCategory;
}

describe("buildPeriodWindows", () => {
  it("builds N month windows oldest-first ending on the ref month", () => {
    const w = buildPeriodWindows("month", 6, new Date(2026, 5, 15)); // June 2026
    expect(w).toHaveLength(6);
    expect(w[0].label).toBe("Sty"); // January 2026
    expect(w[5].label).toBe("Cze"); // June 2026
    expect(w[5].start).toBe(new Date(2026, 5, 1).toISOString());
    expect(w[5].end).toBe(new Date(2026, 6, 1).toISOString());
  });

  it("crosses the year boundary for months", () => {
    const w = buildPeriodWindows("month", 3, new Date(2026, 1, 10)); // Feb 2026
    expect(w.map((x) => x.label)).toEqual(["Gru", "Sty", "Lut"]);
  });

  it("builds 7-day week windows ending today", () => {
    const w = buildPeriodWindows("week", 6, new Date(2026, 5, 15));
    expect(w).toHaveLength(6);
    // newest window: [now-6d, now+1d)
    expect(w[5].start).toBe("2026-06-09");
    expect(w[5].end).toBe("2026-06-16");
    // each window is exactly 7 days before the next
    expect(w[4].start).toBe("2026-06-02");
  });

  it("builds calendar-year windows", () => {
    const w = buildPeriodWindows("year", 3, new Date(2026, 5, 1));
    expect(w.map((x) => x.label)).toEqual(["2024", "2025", "2026"]);
  });
});

describe("bucketPeriodHistory", () => {
  it("sums only expenses into the right window with category breakdown", () => {
    const windows = buildPeriodWindows("month", 3, new Date(2026, 5, 15));
    const txs = [
      tx({ date: "2026-04-10", amount: 100, category_name: "Jedzenie" }),
      tx({ date: "2026-05-05", amount: 200, category_name: "Jedzenie" }),
      tx({ date: "2026-05-20", amount: 50, category_name: "Transport" }),
      tx({ date: "2026-06-01", amount: 999, type: "income", category_name: "Pensja" }),
      tx({ date: "2026-06-02", amount: 30, category_name: "Transport" }),
    ];
    const buckets = bucketPeriodHistory(txs, windows);
    expect(buckets.map((b) => b.total)).toEqual([100, 250, 30]);
    // May bucket category breakdown sorted desc
    expect(buckets[1].categories).toEqual([
      { name: "Jedzenie", total: 200 },
      { name: "Transport", total: 50 },
    ]);
    // income ignored
    expect(buckets[2].total).toBe(30);
  });

  it("excludes the window's exclusive end boundary", () => {
    const windows = buildPeriodWindows("month", 1, new Date(2026, 5, 15));
    // first instant of July must NOT fall into the June bucket
    const julyStart = new Date(2026, 6, 1).toISOString();
    const buckets = bucketPeriodHistory([tx({ date: julyStart, amount: 500 })], windows);
    expect(buckets[0].total).toBe(0);
  });

  it("flags the bucket containing now as current", () => {
    const buckets = computePeriodHistory([], "month", 6);
    expect(buckets.filter((b) => b.isCurrent)).toHaveLength(1);
    expect(buckets[buckets.length - 1].isCurrent).toBe(true);
  });
});

describe("stackCategoryHistory", () => {
  const windows = buildPeriodWindows("month", 2, new Date(2026, 5, 15));
  const txs = [
    // May
    tx({ date: "2026-05-05", amount: 300, category_name: "Mieszkanie" }),
    tx({ date: "2026-05-06", amount: 100, category_name: "Jedzenie" }),
    tx({ date: "2026-05-07", amount: 20, category_name: "Transport" }),
    tx({ date: "2026-05-08", amount: 10, category_name: "Hobby" }),
    // June
    tx({ date: "2026-06-02", amount: 250, category_name: "Mieszkanie" }),
    tx({ date: "2026-06-03", amount: 50, category_name: "Jedzenie" }),
  ];
  const buckets = bucketPeriodHistory(txs, windows);

  it("keeps top-N categories and folds the rest into Inne", () => {
    const { categories, rows } = stackCategoryHistory(buckets, 2);
    expect(categories).toEqual(["Mieszkanie", "Jedzenie", "Inne"]);
    // May row: Mieszkanie 300, Jedzenie 100, Inne = 20+10 = 30
    expect(rows[0]).toEqual({ label: "Maj", Mieszkanie: 300, Jedzenie: 100, Inne: 30 });
    // June row: no Transport/Hobby => Inne 0
    expect(rows[1]).toEqual({ label: "Cze", Mieszkanie: 250, Jedzenie: 50, Inne: 0 });
  });

  it("omits the Inne bucket when everything fits in top-N", () => {
    const { categories } = stackCategoryHistory(buckets, 10);
    expect(categories).not.toContain("Inne");
    expect(categories).toContain("Transport");
  });
});
