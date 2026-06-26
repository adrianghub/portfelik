import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({
  supabase: {},
}));

import { forecastRunningBalances, type RunningBalanceTx } from "$lib/services/cash-position";

const anchor = { opening_amount: 1000, as_of_date: "2026-06-01" };

function tx(over: Partial<RunningBalanceTx> & { id: string }): RunningBalanceTx {
  return { type: "expense", amount: 0, status: "upcoming", date: "2026-07-01", ...over };
}

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

  it("omits rows before the anchor and non-paid/non-upcoming statuses", () => {
    const rows: RunningBalanceTx[] = [
      tx({ id: "old", status: "paid", type: "expense", amount: 500, date: "2026-05-01" }),
      tx({ id: "draft", status: "draft", type: "expense", amount: 10, date: "2026-07-01" }),
      tx({ id: "up", status: "upcoming", type: "expense", amount: 100, date: "2026-07-02" }),
    ];
    const m = forecastRunningBalances(anchor, rows);
    expect(m.has("old")).toBe(false);
    expect(m.has("draft")).toBe(false);
    expect(m.get("up")).toBe(900); // 1000 - 100
  });
});
