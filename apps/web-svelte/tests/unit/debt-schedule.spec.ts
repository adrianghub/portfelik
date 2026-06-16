import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import {
  buildSchedule,
  scheduleBalanceAt,
  interestPaidThrough,
  reanchorWithPayment,
  liveBalance,
  type DebtScheduleTerms,
} from "$lib/services/debt-schedule";

// Hand-computable loan: 100000 principal, 12% annual (1%/mo), payment 10000,
// first payment exactly one month after disbursement (no odd gap days handled as ~1mo).
const simple: DebtScheduleTerms = {
  originalAmount: 100000,
  annualRate: 12,
  monthlyPayment: 10000,
  disbursementDate: "2026-01-01",
  firstPaymentDate: "2026-02-01",
  firstPaymentAmount: null,
};

describe("buildSchedule", () => {
  it("first row interest uses the disbursement→first-payment gap (simple daily)", () => {
    const rows = buildSchedule(simple);
    // gap = 31 days, dailyRate = 12/100/365; interest = 100000 * dailyRate * 31
    const expected = Math.round(((100000 * (12 / 100 / 365)) * 31) * 100) / 100;
    expect(rows[0].interest).toBeCloseTo(expected, 2);
    expect(rows[0].date).toBe("2026-02-01");
  });

  it("subsequent rows use monthly interest and pay down to ~0", () => {
    const rows = buildSchedule(simple);
    const last = rows[rows.length - 1];
    expect(last.balance).toBeLessThanOrEqual(0.01);
    // principal sum equals original (within rounding)
    const principalSum = rows.reduce((s, r) => s + r.principal, 0);
    expect(principalSum).toBeCloseTo(100000, 0);
  });

  it("honours an explicit larger first payment (odd first installment)", () => {
    const rows = buildSchedule({ ...simple, firstPaymentAmount: 15000 });
    expect(rows[0].payment).toBeCloseTo(15000, 2);
    expect(rows[1].payment).toBeCloseTo(10000, 2);
    // bigger first payment => lower balance after row 0 than the level case
    const level = buildSchedule(simple);
    expect(rows[0].balance).toBeLessThan(level[0].balance);
  });

  it("guards negative amortization (payment below interest) by stopping", () => {
    const rows = buildSchedule({ ...simple, monthlyPayment: 1 });
    expect(rows.length).toBeLessThanOrEqual(601);
  });
});

describe("scheduleBalanceAt", () => {
  it("returns original principal before the first payment date", () => {
    expect(scheduleBalanceAt(simple, "2026-01-15")).toBe(100000);
  });
  it("steps only on payment dates, never daily", () => {
    const onPayment = scheduleBalanceAt(simple, "2026-02-01");
    const midMonth = scheduleBalanceAt(simple, "2026-02-20");
    expect(midMonth).toBe(onPayment); // no daily drift between payments
  });
});

describe("interestPaidThrough", () => {
  it("is monotonic non-decreasing across dates", () => {
    const a = interestPaidThrough(simple, "2026-02-01");
    const b = interestPaidThrough(simple, "2026-05-01");
    expect(b).toBeGreaterThanOrEqual(a);
  });
});

describe("reanchorWithPayment", () => {
  it("applies actual payment over actual days (real amount wins)", () => {
    const next = reanchorWithPayment(
      { balance: 100000, date: "2026-01-01" },
      { amount: 15000, date: "2026-03-01" },
      12,
    );
    // interest = 100000 * dailyRate * 59 days; balance = 100000 + interest - 15000
    const interest = 100000 * (12 / 100 / 365) * 59;
    expect(next.balance).toBeCloseTo(100000 + interest - 15000, 2);
    expect(next.date).toBe("2026-03-01");
  });
});

describe("liveBalance", () => {
  it("with no linked payments equals the anchor (or original) and does not tick daily", () => {
    expect(
      liveBalance(simple, { anchorBalance: null, balanceAnchorDate: null }, [], "2026-04-15"),
    ).toBe(100000);
  });
  it("replays linked payments via reanchor, ignoring pre-anchor ones", () => {
    const out = liveBalance(
      simple,
      { anchorBalance: 90000, balanceAnchorDate: "2026-03-01" },
      [
        { amount: 10000, date: "2026-02-01" }, // pre-anchor -> ignored
        { amount: 10000, date: "2026-04-01" }, // forward -> applied
      ],
      "2026-05-15",
    );
    const interest = 90000 * (12 / 100 / 365) * 31; // 03-01 -> 04-01
    expect(out).toBeCloseTo(Math.round((90000 + interest - 10000) * 100) / 100, 2);
  });
});
