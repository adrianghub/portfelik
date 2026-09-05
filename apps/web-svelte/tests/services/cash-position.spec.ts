import { describe, expect, it, vi } from "vitest";

// cash-position.ts pulls in the supabase singleton (for fetch/upsert), which
// imports $env/static/public — unresolvable under vitest. The pure engine under
// test never touches it, so stub the module.
vi.mock("$lib/supabase", () => ({ supabase: {} }));

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

  it("accumulates in integer grosze instead of leaking floating-point fractions", () => {
    expect(
      livePosition({ opening_amount: 0.1, as_of_date: "2026-06-01" }, [
        { type: "income", amount: 0.2, status: "paid", date: "2026-06-01" },
      ])
    ).toBe(0.3);
  });
});

describe("forecastPosition", () => {
  it("adds upcoming and overdue on top of live within the horizon", () => {
    // live 1300 + upcoming 300 − overdue 50 = 1550
    expect(forecastPosition(anchor, txs, { today: "2026-06-01", horizonEnd: "2026-06-30" })).toBe(
      1550
    );
  });

  it("ignores upcoming beyond the horizon", () => {
    const far = [
      ...txs,
      { type: "expense" as const, amount: 999, status: "upcoming", date: "2027-01-01" },
    ];
    expect(forecastPosition(anchor, far, { today: "2026-06-01", horizonEnd: "2026-06-30" })).toBe(
      1550
    );
  });

  it("excludes pre-anchor overdue the same way as forecastRunningBalances", () => {
    const withPreAnchor = [
      ...txs,
      { type: "expense" as const, amount: 400, status: "overdue", date: "2026-05-15" },
    ];
    // Pre-anchor overdue must not pull the forecast below live+in-window scheduled.
    expect(
      forecastPosition(anchor, withPreAnchor, { today: "2026-06-01", horizonEnd: "2026-06-30" })
    ).toBe(1550);
  });
});

describe("livePosition with timestamptz dates (transactions.date is timestamptz)", () => {
  // Real rows arrive as full ISO timestamps; the engine must compare date-only against
  // the bare as_of_date and must NOT drop same-day or future-dated paid rows.
  const tsTxs: Tx[] = [
    { type: "income", amount: 500, status: "paid", date: "2026-06-01T23:30:00.000Z" }, // == as_of_date → counts
    { type: "expense", amount: 100, status: "paid", date: "2026-05-31T23:30:00.000Z" }, // day before → excluded
    { type: "income", amount: 200, status: "paid", date: "2026-12-31T08:00:00.000Z" }, // future-dated → counts
  ];

  it("includes the as_of-day timestamp and future-dated paid rows, excludes the day before", () => {
    // 1000 + 500 (as_of day) + 200 (future) = 1700; the day-before expense is excluded.
    expect(livePosition(anchor, tsTxs)).toBe(1700);
  });
});
