import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import { runningBalances } from "$lib/services/cash-position";

type Tx = { id: string; type: "income" | "expense"; amount: number; status: string; date: string };

const anchor = { opening_amount: 1000, as_of_date: "2026-06-01" };

const txs: Tx[] = [
  { id: "a", type: "income", amount: 500, status: "paid", date: "2026-06-05T10:00:00Z" },
  { id: "b", type: "expense", amount: 200, status: "paid", date: "2026-06-06T09:00:00Z" },
  { id: "c", type: "expense", amount: 999, status: "paid", date: "2026-05-31T09:00:00Z" }, // before anchor → ignored
  { id: "d", type: "income", amount: 300, status: "upcoming", date: "2026-06-20" }, // not paid → ignored
];

describe("runningBalances", () => {
  it("returns balance-after for each paid row on/after as_of_date, in chronological order", () => {
    const map = runningBalances(anchor, txs);
    expect(map.get("a")).toBe(1500);
    expect(map.get("b")).toBe(1300);
    expect(map.has("c")).toBe(false);
    expect(map.has("d")).toBe(false);
  });

  it("orders by date then keeps input order for same-day rows", () => {
    const sameDay: Tx[] = [
      { id: "x", type: "income", amount: 100, status: "paid", date: "2026-06-10T08:00:00Z" },
      { id: "y", type: "expense", amount: 40, status: "paid", date: "2026-06-10T20:00:00Z" },
    ];
    const map = runningBalances(anchor, sameDay);
    expect(map.get("x")).toBe(1100);
    expect(map.get("y")).toBe(1060);
  });
});
