import { describe, expect, it, vi } from "vitest";

vi.mock("$lib/supabase", () => ({ supabase: {} }));

import {
  computePrivateMoneyAvailability,
  MAX_TRUSTED_CASH_ANCHOR_AGE_DAYS,
} from "$lib/services/money-availability";
import type { PrivatePositionTx } from "$lib/services/money-availability";

const anchor = { opening_amount: 1000, as_of_date: "2026-08-31" };

const privateTx = (transaction: Omit<PrivatePositionTx, "group_id">): PrivatePositionTx => ({
  ...transaction,
  group_id: null,
});

describe("computePrivateMoneyAvailability", () => {
  it("derives eligible and unassigned cash from reconciled live money to the grosz", () => {
    const result = computePrivateMoneyAvailability({
      anchor,
      transactions: [
        privateTx({ type: "income", amount: 123.45, status: "paid", date: "2026-09-01" }),
        privateTx({ type: "expense", amount: 23.44, status: "paid", date: "2026-09-02" }),
      ],
      assignedCash: 300.02,
      expectedIncome: 500,
      forecastObligations: 250,
      today: "2026-09-05",
    });

    expect(result).toMatchObject({
      status: "ready",
      isConfident: true,
      liveCash: 1100.01,
      eligibleLiveCash: 1100.01,
      assignedCash: 300.02,
      unassignedCash: 799.99,
      overassignedCash: 0,
      projectedCashAfterForecast: 1350.01,
    });
    expect(Math.round((result.assignedCash + (result.unassignedCash ?? 0)) * 100)).toBe(
      Math.round((result.eligibleLiveCash ?? 0) * 100)
    );
  });

  it("keeps expected income and forecast obligations outside the assignable pool", () => {
    const base = {
      anchor,
      transactions: [],
      assignedCash: 250,
      today: "2026-09-05",
    };
    const quiet = computePrivateMoneyAvailability({
      ...base,
      expectedIncome: 0,
      forecastObligations: 0,
    });
    const forecast = computePrivateMoneyAvailability({
      ...base,
      expectedIncome: 5000,
      forecastObligations: 4200,
    });

    expect(forecast.unassignedCash).toBe(quiet.unassignedCash);
    expect(forecast.eligibleLiveCash).toBe(quiet.eligibleLiveCash);
    expect(forecast.projectedCashAfterForecast).toBe(1800);
  });

  it("returns no confident amount without an anchor", () => {
    const result = computePrivateMoneyAvailability({
      anchor: null,
      transactions: [],
      assignedCash: 321.09,
      expectedIncome: 1000,
      forecastObligations: 500,
      today: "2026-09-05",
    });

    expect(result.status).toBe("missing_anchor");
    expect(result.isConfident).toBe(false);
    expect(result.liveCash).toBeNull();
    expect(result.eligibleLiveCash).toBeNull();
    expect(result.assignedCash).toBe(321.09);
    expect(result.unassignedCash).toBeNull();
    expect(result.projectedCashAfterForecast).toBeNull();
  });

  it("requires reconciliation at least once per monthly cycle", () => {
    const fresh = computePrivateMoneyAvailability({
      anchor: { opening_amount: 1000, as_of_date: "2026-08-05" },
      transactions: [],
      assignedCash: 0,
      expectedIncome: 0,
      forecastObligations: 0,
      today: "2026-09-05",
    });
    const stale = computePrivateMoneyAvailability({
      anchor: { opening_amount: 1000, as_of_date: "2026-08-04" },
      transactions: [],
      assignedCash: 0,
      expectedIncome: 0,
      forecastObligations: 0,
      today: "2026-09-05",
    });

    expect(MAX_TRUSTED_CASH_ANCHOR_AGE_DAYS).toBe(31);
    expect(fresh.status).toBe("ready");
    expect(fresh.anchorAgeDays).toBe(31);
    expect(stale.status).toBe("stale_anchor");
    expect(stale.anchorAgeDays).toBe(32);
    expect(stale.unassignedCash).toBeNull();
  });

  it("rejects a future-dated anchor as untrusted", () => {
    const result = computePrivateMoneyAvailability({
      anchor: { opening_amount: 1000, as_of_date: "2026-09-06" },
      transactions: [],
      assignedCash: 321.09,
      expectedIncome: 0,
      forecastObligations: 0,
      today: "2026-09-05",
    });

    expect(result.status).toBe("future_anchor");
    expect(result.anchorAgeDays).toBe(-1);
    expect(result.liveCash).toBeNull();
    expect(result.assignedCash).toBe(321.09);
    expect(result.unassignedCash).toBeNull();
  });

  it("shows cash shortfall and overassignment without breaking the invariant", () => {
    const result = computePrivateMoneyAvailability({
      anchor: { opening_amount: 10, as_of_date: "2026-09-01" },
      transactions: [
        privateTx({ type: "expense", amount: 20, status: "paid", date: "2026-09-02" }),
      ],
      assignedCash: 25,
      expectedIncome: 0,
      forecastObligations: 0,
      today: "2026-09-05",
    });

    expect(result.liveCash).toBe(-10);
    expect(result.eligibleLiveCash).toBe(0);
    expect(result.unassignedCash).toBe(-25);
    expect(result.overassignedCash).toBe(25);
    expect(result.cashShortfall).toBe(10);
    expect((result.assignedCash + (result.unassignedCash ?? 0)) * 100).toBe(
      (result.eligibleLiveCash ?? 0) * 100
    );
  });

  it("preserves the invariant across assignment and cash transitions", () => {
    for (const assignedCash of [0, 100.01, 999.99, 1200]) {
      const result = computePrivateMoneyAvailability({
        anchor,
        transactions: [
          privateTx({ type: "income", amount: 500, status: "paid", date: "2026-09-01" }),
          privateTx({ type: "expense", amount: 125.55, status: "paid", date: "2026-09-02" }),
        ],
        assignedCash,
        expectedIncome: 0,
        forecastObligations: 0,
        today: "2026-09-05",
      });
      const assignedCents = Math.round(result.assignedCash * 100);
      const unassignedCents = Math.round((result.unassignedCash ?? 0) * 100);
      const eligibleCents = Math.round((result.eligibleLiveCash ?? 0) * 100);
      expect(assignedCents + unassignedCents).toBe(eligibleCents);
    }
  });

  it("rejects invalid monetary inputs instead of producing a plausible figure", () => {
    expect(() =>
      computePrivateMoneyAvailability({
        anchor,
        transactions: [],
        assignedCash: Number.NaN,
        expectedIncome: 0,
        forecastObligations: 0,
        today: "2026-09-05",
      })
    ).toThrow(/assignedCash/);
  });

  it("rejects a group transaction instead of mixing it into private availability", () => {
    expect(() =>
      computePrivateMoneyAvailability({
        anchor,
        transactions: [
          {
            type: "expense",
            amount: 100,
            status: "paid",
            date: "2026-09-02",
            group_id: "group-1",
          } as unknown as PrivatePositionTx,
        ],
        assignedCash: 0,
        expectedIncome: 0,
        forecastObligations: 0,
        today: "2026-09-05",
      })
    ).toThrow(/private scope/);
  });
});
