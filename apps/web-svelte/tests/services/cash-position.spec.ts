import { describe, expect, it } from "vitest";
import { forecastPosition, livePosition } from "$lib/services/cash-position";

type Tx = { type: "income" | "expense"; amount: number; status: string; date: string };

const anchor = { opening_amount: 1000, as_of_date: "2026-06-01" };

const txs: Tx[] = [
  { type: "income", amount: 500, status: "paid", date: "2026-06-05" },
  { type: "expense", amount: 200, status: "paid", date: "2026-06-06" },
  { type: "expense", amount: 999, status: "paid", date: "2026-05-31" }, // before as_of_date → ignored
  { type: "income", amount: 300, status: "upcoming", date: "2026-06-20" }, // forecast only
  { type: "expense", amount: 50, status: "overdue", date: "2026-06-02" }, // not paid → ignored by live
];

describe("livePosition", () => {
  it("opening + paid income − paid expense, on/after as_of_date only", () => {
    expect(livePosition(anchor, txs)).toBe(1300); // 1000 + 500 − 200
  });

  it("treats a null anchor as zero opening on as_of epoch (counts all paid)", () => {
    expect(livePosition(null, txs)).toBe(-699); // 0 + 500 − 200 − 999
  });
});

describe("forecastPosition", () => {
  it("adds upcoming income/expense on top of live", () => {
    expect(forecastPosition(anchor, txs)).toBe(1600); // 1300 + 300
  });
});
