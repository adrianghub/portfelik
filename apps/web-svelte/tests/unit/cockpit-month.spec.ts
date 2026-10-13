import { describe, expect, it } from "vitest";
import { cockpitMonthIndicators, type CockpitMonthInput } from "$lib/cockpit/month";
import type { CockpitLedgerTx, CockpitSpendItem } from "$lib/cockpit/indicators";
import { addLocalDays } from "$lib/date-local";
import { CASH_FORECAST_HORIZON_DAYS } from "$lib/services/cash-position";

const today = "2026-10-11";
const october = { monthStart: "2026-10-01", monthEnd: "2026-10-31" };
const anchor = { opening_amount: 12_000, as_of_date: "2026-01-01" };

function tx(overrides: Partial<CockpitLedgerTx> = {}): CockpitLedgerTx {
  return {
    id: "tx-deposit",
    type: "expense",
    amount: 1_000,
    status: "paid",
    date: "2026-10-02",
    currency: "PLN",
    ...overrides,
  };
}

function apartment(overrides: Partial<CockpitSpendItem> = {}): CockpitSpendItem {
  return {
    id: "item-apartment",
    amount: 4_000,
    dueDate: "2026-10-22",
    status: "confirmed",
    groupId: null,
    ...overrides,
  };
}

function month(overrides: Partial<CockpitMonthInput> = {}) {
  return cockpitMonthIndicators({
    scope: { kind: "private" },
    anchor,
    transactions: [tx()],
    items: [apartment()],
    links: [
      {
        planItemId: "item-apartment",
        transactionId: "tx-deposit",
        amount: 1_000,
        countsAsPaid: true,
      },
    ],
    today,
    ...october,
    ...overrides,
  });
}

describe("cockpit month indicators", () => {
  it("counts a partial payment, the unpaid remainder, and an expense with no plan", () => {
    const result = month({
      transactions: [
        tx(),
        tx({
          id: "tx-insurance",
          amount: 800,
          status: "upcoming",
          date: "2026-10-20",
        }),
      ],
    });
    expect(result.balance).toBe(11_000);
    expect(result.expenses).toBe(4_800);
    expect(result.forecast).toBe(7_200);
    expect(result.orientational).toBe(0);
  });

  it("does not subtract a linked upcoming payment twice", () => {
    const result = month({
      transactions: [
        tx(),
        tx({
          id: "tx-rest",
          amount: 3_000,
          status: "upcoming",
          date: "2026-10-22",
        }),
      ],
      links: [
        {
          planItemId: "item-apartment",
          transactionId: "tx-deposit",
          amount: 1_000,
          countsAsPaid: true,
        },
        {
          planItemId: "item-apartment",
          transactionId: "tx-rest",
          amount: 3_000,
          countsAsPaid: false,
        },
      ],
    });
    expect(result.expenses).toBe(4_000);
    expect(result.forecast).toBe(8_000);
  });

  it("keeps an overpayment in the expenses and leaves no negative remainder", () => {
    const result = month({
      transactions: [tx({ amount: 4_500 })],
      links: [
        {
          planItemId: "item-apartment",
          transactionId: "tx-deposit",
          amount: 4_500,
          countsAsPaid: true,
        },
      ],
    });
    expect(result.balance).toBe(7_500);
    expect(result.expenses).toBe(4_500);
    expect(result.forecast).toBe(7_500);
  });

  it("uses two dates for a past month and ignores an unpaid row from that month", () => {
    const result = month({
      transactions: [
        tx({ id: "tx-august", amount: 100, date: "2026-08-20" }),
        tx({ id: "tx-september", amount: 400, date: "2026-09-10" }),
        tx({
          id: "tx-september-open",
          amount: 200,
          status: "overdue",
          date: "2026-09-20",
        }),
      ],
      items: [],
      links: [],
      monthStart: "2026-09-01",
      monthEnd: "2026-09-30",
    });
    expect(result.balance).toBe(11_900);
    expect(result.expenses).toBe(400);
    expect(result.forecast).toBe(11_500);
  });

  it("leaves last month's overdue out of this month's expenses and still in the forecast", () => {
    const result = month({
      transactions: [
        tx(),
        tx({
          id: "tx-old",
          amount: 200,
          status: "overdue",
          date: "2026-09-20",
        }),
        tx({
          id: "tx-late",
          amount: 50,
          status: "overdue",
          date: "2026-10-05",
        }),
      ],
      items: [],
      links: [],
    });
    expect(result.expenses).toBe(1_050);
    expect(result.forecast).toBe(10_750);
  });

  it("returns no amounts for a month that ends before the anchor", () => {
    const result = month({
      anchor: { opening_amount: 12_000, as_of_date: "2026-06-01" },
      transactions: [tx({ amount: 300, date: "2026-05-10" })],
      items: [],
      links: [],
      monthStart: "2026-05-01",
      monthEnd: "2026-05-31",
    });
    expect(result.balance).toBeNull();
    expect(result.expenses).toBeNull();
    expect(result.forecast).toBeNull();
  });

  it("counts only the part of a past month that is on or after the anchor", () => {
    const result = month({
      anchor: { opening_amount: 12_000, as_of_date: "2026-06-15" },
      transactions: [
        tx({ id: "tx-before", amount: 300, date: "2026-06-10" }),
        tx({ id: "tx-after", amount: 500, date: "2026-06-20" }),
        tx({
          id: "tx-income",
          type: "income",
          amount: 200,
          date: "2026-06-18",
        }),
      ],
      items: [],
      links: [],
      monthStart: "2026-06-01",
      monthEnd: "2026-06-30",
    });
    expect(result.balance).toBeNull();
    expect(result.expenses).toBe(500);
    expect(result.forecast).toBe(11_700);
  });

  it("uses the opening amount when the month starts on the anchor date", () => {
    const result = month({
      anchor: { opening_amount: 12_000, as_of_date: "2026-09-01" },
      transactions: [tx({ amount: 400, date: "2026-09-10" })],
      items: [],
      links: [],
      monthStart: "2026-09-01",
      monthEnd: "2026-09-30",
    });
    expect(result.balance).toBe(12_000);
    expect(result.forecast).toBe(11_600);
  });

  it("does not pool cash for the all scope", () => {
    const result = month({
      scope: { kind: "all" },
      transactions: [tx({ amount: 800, status: "upcoming", date: "2026-10-20" })],
      items: [apartment()],
      links: [],
    });
    expect(result.balance).toBeNull();
    expect(result.forecast).toBeNull();
    expect(result.expenses).toBe(800);
    expect(result.orientational).toBe(0);
  });

  it("does not invent a group balance when that group has no anchor", () => {
    const result = month({
      scope: { kind: "group", groupId: "group-dom" },
      anchor: null,
      transactions: [],
      items: [apartment({ groupId: "group-dom" })],
      links: [],
    });
    expect(result.balance).toBeNull();
    expect(result.forecast).toBeNull();
    expect(result.expenses).toBe(4_000);
  });

  it("keeps another group's remainder out of the private month", () => {
    const result = month({
      transactions: [],
      items: [apartment({ groupId: "group-dom" })],
      links: [],
    });
    expect(result.balance).toBe(12_000);
    expect(result.expenses).toBe(0);
    expect(result.forecast).toBe(12_000);
  });

  it("reports a missing private anchor as no cash numbers and still counts expenses", () => {
    const result = month({
      anchor: null,
      transactions: [
        tx({ id: "tx-insurance", amount: 800, status: "upcoming", date: "2026-10-20" }),
      ],
      items: [],
      links: [],
    });
    expect(result.balance).toBeNull();
    expect(result.forecast).toBeNull();
    expect(result.expenses).toBe(800);
  });

  it("keeps a planned line beside expenses", () => {
    const result = month({
      transactions: [tx()],
      items: [apartment(), apartment({ id: "item-trip", amount: 3_600, status: "planned" })],
    });
    expect(result.expenses).toBe(4_000);
    expect(result.orientational).toBe(3_600);
    expect(result.forecast).toBe(8_000);
  });

  it("leaves estimated and cancelled lines out of both counters", () => {
    const result = month({
      transactions: [],
      items: [
        apartment({ id: "item-estimate", status: "estimated" }),
        apartment({ id: "item-cancelled", status: "cancelled" }),
      ],
      links: [],
    });
    expect(result.expenses).toBe(0);
    expect(result.orientational).toBe(0);
    expect(result.forecast).toBe(12_000);
  });

  it("counts the month bounds and leaves the next day out", () => {
    const result = month({
      transactions: [
        tx({ id: "tx-end", amount: 10, status: "upcoming", date: "2026-10-31" }),
        tx({ id: "tx-next", amount: 90, status: "upcoming", date: "2026-11-01" }),
      ],
      items: [],
      links: [],
    });
    expect(result.expenses).toBe(10);
  });

  it("lets an upcoming inflow raise the forecast without becoming an expense", () => {
    const result = month({
      transactions: [
        tx({
          id: "tx-salary",
          type: "income",
          amount: 2_000,
          status: "upcoming",
          date: "2026-10-25",
        }),
      ],
      items: [],
      links: [],
    });
    expect(result.expenses).toBe(0);
    expect(result.forecast).toBe(14_000);
  });

  it("ignores a foreign-currency expense", () => {
    const result = month({
      transactions: [tx({ amount: 40, currency: "EUR" })],
      items: [],
      links: [],
    });
    expect(result.balance).toBe(12_000);
    expect(result.expenses).toBe(0);
  });

  it("keeps a goal allocation in the balance and out of expenses", () => {
    const result = month({
      transactions: [tx({ id: "tx-goal", amount: 250 })],
      items: [],
      links: [],
      allocationTransactionIds: new Set(["tx-goal"]),
    });
    expect(result.balance).toBe(11_750);
    expect(result.expenses).toBe(0);
    expect(result.forecast).toBe(11_750);
  });

  it("stops paid expenses at today inside the current month", () => {
    const result = month({
      transactions: [
        tx({ amount: 100, date: "2026-10-11" }),
        tx({ id: "tx-later", amount: 900, date: "2026-10-12" }),
      ],
      items: [],
      links: [],
    });
    expect(result.expenses).toBe(100);
  });

  it("returns the opening amount when a future month starts on the anchor", () => {
    const result = month({
      anchor: { opening_amount: 9_000, as_of_date: "2026-11-01" },
      transactions: [tx({ amount: 100, date: "2026-11-02", status: "upcoming" })],
      items: [],
      links: [],
      monthStart: "2026-11-01",
      monthEnd: "2026-11-30",
    });
    expect(result.balance).toBe(9_000);
    expect(result.expenses).toBe(100);
    expect(result.forecast).toBe(8_900);
  });

  it("has a start balance inside the horizon and no forecast when the month ends after it", () => {
    const horizonEnd = addLocalDays(today, CASH_FORECAST_HORIZON_DAYS);
    expect(horizonEnd).toBe("2027-01-09");
    const result = month({
      transactions: [
        tx({
          id: "tx-december",
          amount: 100,
          status: "upcoming",
          date: "2026-12-20",
        }),
        tx({
          id: "tx-january",
          amount: 200,
          status: "upcoming",
          date: "2027-01-05",
        }),
      ],
      items: [apartment({ dueDate: "2027-01-15", amount: 400 })],
      links: [],
      monthStart: "2027-01-01",
      monthEnd: "2027-01-31",
    });
    expect(result.balance).toBe(11_900);
    expect(result.forecast).toBeNull();
    expect(result.expenses).toBe(600);
  });

  it("includes a forecast that ends on the horizon and drops the next day", () => {
    const onHorizon = month({
      transactions: [],
      items: [],
      links: [],
      monthStart: "2027-01-01",
      monthEnd: "2027-01-09",
    });
    const pastHorizon = month({
      transactions: [],
      items: [],
      links: [],
      monthStart: "2027-01-01",
      monthEnd: "2027-01-10",
    });
    expect(onHorizon.forecast).toBe(12_000);
    expect(pastHorizon.forecast).toBeNull();
    expect(pastHorizon.balance).toBe(12_000);
  });

  it("has no cash numbers for a month that starts after the horizon and still counts its expense", () => {
    const result = month({
      transactions: [
        tx({
          id: "tx-february",
          amount: 500,
          status: "upcoming",
          date: "2027-02-05",
        }),
      ],
      items: [],
      links: [],
      monthStart: "2027-02-01",
      monthEnd: "2027-02-28",
    });
    expect(result.balance).toBeNull();
    expect(result.forecast).toBeNull();
    expect(result.expenses).toBe(500);
  });

  it("does not add the confirmation day on top of an end-of-day balance", () => {
    const result = month({
      anchor: {
        opening_amount: 12_000,
        as_of_date: "2026-10-11",
        balance_semantics: "end_of_day",
      },
      transactions: [
        tx({ id: "tx-same-day", amount: 500, date: "2026-10-11" }),
        tx({ id: "tx-next", amount: 200, date: "2026-10-12" }),
      ],
      items: [],
      links: [],
      today: "2026-10-13",
    });
    expect(result.balance).toBe(11_800);
    expect(result.expenses).toBe(700);
  });
});
