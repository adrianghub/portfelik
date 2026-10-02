import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({
  supabase: {},
}));

import {
  forecastMovementTotals,
  liveMovementTotals,
  forecastRunningBalances,
  type RunningBalanceTx,
} from "$lib/services/cash-position";

const anchor = { opening_amount: 1000, as_of_date: "2026-06-01" };

function tx(over: Partial<RunningBalanceTx> & { id: string }): RunningBalanceTx {
  return {
    type: "expense",
    amount: 0,
    status: "upcoming",
    date: "2026-07-01",
    currency: "PLN",
    ...over,
  };
}

describe("liveMovementTotals", () => {
  it("explains paid movements after the anchor and excludes plans and unsupported currency", () => {
    expect(
      liveMovementTotals(anchor, [
        tx({ id: "income", status: "paid", type: "income", amount: 0.3 }),
        tx({ id: "expense1", status: "paid", amount: 0.1 }),
        tx({ id: "expense2", status: "paid", amount: 0.2 }),
        tx({ id: "old", status: "paid", amount: 50, date: "2026-05-31" }),
        tx({ id: "future", amount: 100 }),
        tx({ id: "foreign", status: "paid", amount: 100, currency: "EUR" }),
      ])
    ).toEqual({ paidIncome: 0.3, paidExpenses: 0.3 });
  });
});

describe("forecastMovementTotals", () => {
  it("sums upcoming income and expenses inside the horizon and ignores paid rows", () => {
    const rows: RunningBalanceTx[] = [
      tx({ id: "paid", status: "paid", type: "expense", amount: 80, date: "2026-06-02" }),
      tx({ id: "out", status: "upcoming", type: "expense", amount: 40, date: "2026-06-20" }),
      tx({ id: "in", status: "upcoming", type: "income", amount: 15, date: "2026-06-21" }),
      tx({ id: "far", status: "upcoming", type: "expense", amount: 500, date: "2026-12-01" }),
    ];
    expect(
      forecastMovementTotals(anchor, rows, { today: "2026-06-01", horizonEnd: "2026-09-01" })
    ).toEqual({ upcomingIncome: 15, upcomingExpenses: 40 });
  });
});

describe("forecastRunningBalances", () => {
  it("accumulates paid then upcoming in date order from the opening balance", () => {
    const rows: RunningBalanceTx[] = [
      tx({ id: "paid1", status: "paid", type: "income", amount: 200, date: "2026-06-10" }),
      tx({ id: "up1", status: "upcoming", type: "expense", amount: 50, date: "2026-07-05" }),
      tx({ id: "up2", status: "upcoming", type: "expense", amount: 100, date: "2026-07-10" }),
    ];
    const m = forecastRunningBalances(anchor, rows);
    expect(m.get("paid1")).toBe(1200); // 1000 + 200
    expect(m.get("up1")).toBe(1150); // 1200 - 50
    expect(m.get("up2")).toBe(1050); // 1150 - 100
  });

  it("includes overdue rows and omits draft / beyond-horizon upcoming", () => {
    const rows: RunningBalanceTx[] = [
      tx({ id: "old", status: "paid", type: "expense", amount: 500, date: "2026-05-01" }),
      tx({ id: "draft", status: "draft", type: "expense", amount: 10, date: "2026-07-01" }),
      tx({ id: "over", status: "overdue", type: "expense", amount: 25, date: "2026-06-15" }),
      tx({ id: "up", status: "upcoming", type: "expense", amount: 100, date: "2026-07-02" }),
      tx({ id: "far", status: "upcoming", type: "expense", amount: 500, date: "2027-01-01" }),
    ];
    const m = forecastRunningBalances(anchor, rows, {
      today: "2026-06-01",
      horizonEnd: "2026-09-01",
    });
    expect(m.has("old")).toBe(false);
    expect(m.has("draft")).toBe(false);
    expect(m.has("far")).toBe(false);
    expect(m.get("over")).toBe(975); // 1000 - 25
    expect(m.get("up")).toBe(875); // 975 - 100
  });
});
