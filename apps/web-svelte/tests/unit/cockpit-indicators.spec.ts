import { describe, expect, it } from "vitest";
import { cockpitIndicators, type CockpitLedgerTx } from "$lib/cockpit/indicators";

const today = "2026-10-08";
const anchor = { opening_amount: 12_000, as_of_date: "2026-01-01" };

function tx(overrides: Partial<CockpitLedgerTx> = {}): CockpitLedgerTx {
  return {
    id: "tx-deposit",
    type: "expense",
    amount: 1_000,
    status: "paid",
    date: "2026-02-01",
    currency: "PLN",
    ...overrides,
  };
}

function indicators(overrides: Partial<Parameters<typeof cockpitIndicators>[0]> = {}) {
  return cockpitIndicators({
    scope: { kind: "private" },
    anchor,
    transactions: [tx()],
    items: [
      {
        id: "item-apartment",
        amount: 4_000,
        dueDate: "2026-10-22",
        status: "confirmed",
        groupId: null,
      },
    ],
    links: [
      {
        planItemId: "item-apartment",
        transactionId: "tx-deposit",
        amount: 1_000,
        countsAsPaid: true,
      },
    ],
    today,
    ...overrides,
  });
}

describe("cockpit indicators", () => {
  it("keeps the paid deposit in the balance and forecasts only the remainder", () => {
    const result = indicators();
    expect(result.balance).toBe(11_000);
    expect(result.payments30).toBe(3_000);
    expect(result.overdue).toBe(0);
    expect(result.forecast30).toBe(8_000);
    expect(result.arcScale).toBeNull();
  });

  it("adds a future inflow instead of subtracting payments from the balance", () => {
    const result = indicators({
      transactions: [
        tx(),
        tx({
          id: "tx-income",
          type: "income",
          amount: 2_000,
          status: "upcoming",
          date: "2026-10-20",
        }),
      ],
    });
    expect(result.payments30).toBe(3_000);
    expect(result.forecast30).toBe(10_000);
  });

  it("does not count an orientational line as a payment", () => {
    const result = indicators({
      items: [
        {
          id: "item-apartment",
          amount: 4_000,
          dueDate: "2026-10-22",
          status: "planned",
          groupId: null,
        },
      ],
      links: [],
      transactions: [],
    });
    expect(result.payments30).toBe(0);
    expect(result.orientational30).toBe(4_000);
    expect(result.forecast30).toBe(12_000);
  });

  it("keeps an overdue confirmed line out of the 30-day counter", () => {
    const result = indicators({
      items: [
        {
          id: "item-apartment",
          amount: 4_000,
          dueDate: "2026-10-01",
          status: "confirmed",
          groupId: null,
        },
      ],
    });
    expect(result.payments30).toBe(0);
    expect(result.overdue).toBe(3_000);
  });

  it("does not count a scheduled transaction twice", () => {
    const result = indicators({
      transactions: [
        tx({
          id: "tx-rest",
          amount: 1_000,
          status: "upcoming",
          date: "2026-10-22",
        }),
      ],
      links: [
        {
          planItemId: "item-apartment",
          transactionId: "tx-rest",
          amount: 1_000,
          countsAsPaid: false,
        },
      ],
    });
    expect(result.payments30).toBe(4_000);
    expect(result.forecast30).toBe(8_000);
  });

  it("leaves a shared plan out of the private indicators", () => {
    const result = indicators({
      items: [
        {
          id: "item-apartment",
          amount: 4_000,
          dueDate: "2026-10-22",
          status: "confirmed",
          groupId: "group-dom",
        },
      ],
      links: [],
      transactions: [],
    });
    expect(result.payments30).toBe(0);
    expect(result.forecast30).toBe(12_000);
  });

  it("uses a group plan only inside that group's own scope", () => {
    const shared = {
      id: "item-apartment",
      amount: 4_000,
      dueDate: "2026-10-22",
      status: "confirmed" as const,
      groupId: "group-dom",
    };
    const result = indicators({
      scope: { kind: "group", groupId: "group-dom" },
      transactions: [],
      links: [],
      items: [shared],
    });
    expect(result.payments30).toBe(4_000);
    expect(result.forecast30).toBe(8_000);
  });

  it("reports a missing anchor as no balance and no forecast", () => {
    const result = indicators({ anchor: null, transactions: [], links: [] });
    expect(result.balance).toBeNull();
    expect(result.forecast30).toBeNull();
    expect(result.payments30).toBe(4_000);
  });

  it("recomputes the remainder when the paid deposit changes", () => {
    const result = indicators({
      transactions: [tx({ amount: 800 })],
      links: [
        {
          planItemId: "item-apartment",
          transactionId: "tx-deposit",
          amount: 800,
          countsAsPaid: true,
        },
      ],
    });
    expect(result.balance).toBe(11_200);
    expect(result.payments30).toBe(3_200);
    expect(result.forecast30).toBe(8_000);
  });

  it("does not turn a full settlement or an overpayment into another outflow", () => {
    const settled = indicators({
      transactions: [tx({ amount: 4_000 })],
      links: [
        {
          planItemId: "item-apartment",
          transactionId: "tx-deposit",
          amount: 4_000,
          countsAsPaid: true,
        },
      ],
    });
    expect(settled.payments30).toBe(0);
    expect(settled.forecast30).toBe(settled.balance);

    const overpaid = indicators({
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
    expect(overpaid.payments30).toBe(0);
    expect(overpaid.balance).toBe(7_500);
    expect(overpaid.forecast30).toBe(7_500);
  });

  it("stops the payment counter and the 30-day forecast on the same day", () => {
    const inside = indicators({
      items: [
        {
          id: "item-apartment",
          amount: 4_000,
          dueDate: "2026-11-07",
          status: "confirmed",
          groupId: null,
        },
      ],
    });
    expect(inside.payments30).toBe(3_000);
    expect(inside.forecast30).toBe(8_000);

    const outside = indicators({
      items: [
        {
          id: "item-apartment",
          amount: 4_000,
          dueDate: "2026-11-08",
          status: "confirmed",
          groupId: null,
        },
      ],
    });
    expect(outside.payments30).toBe(0);
    expect(outside.forecast30).toBe(11_000);
  });

  it("leaves a movement dated before the anchor inside the opening amount", () => {
    const result = indicators({
      anchor: { opening_amount: 12_000, as_of_date: "2026-03-01" },
    });
    expect(result.balance).toBe(12_000);
    expect(result.payments30).toBe(3_000);
    expect(result.forecast30).toBe(9_000);
  });

  it("ignores a foreign-currency movement", () => {
    const result = indicators({
      transactions: [
        tx(),
        tx({
          id: "tx-eur",
          amount: 500,
          status: "upcoming",
          date: "2026-10-12",
          currency: "EUR",
        }),
      ],
    });
    expect(result.payments30).toBe(3_000);
    expect(result.forecast30).toBe(8_000);
  });

  it("shows a planned remainder separately and keeps it out of the forecast", () => {
    const result = indicators({
      items: [
        {
          id: "item-apartment",
          amount: 4_000,
          dueDate: "2026-10-22",
          status: "planned",
          groupId: null,
        },
      ],
    });
    expect(result.payments30).toBe(0);
    expect(result.orientational30).toBe(3_000);
    expect(result.balance).toBe(11_000);
    expect(result.forecast30).toBe(11_000);
  });

  it("ignores estimated and cancelled lines", () => {
    for (const status of ["estimated", "cancelled"] as const) {
      const result = indicators({
        items: [
          {
            id: "item-apartment",
            amount: 4_000,
            dueDate: "2026-10-22",
            status,
            groupId: null,
          },
        ],
        links: [],
        transactions: [tx()],
      });
      expect(result.payments30).toBe(0);
      expect(result.orientational30).toBe(0);
      expect(result.forecast30).toBe(11_000);
    }
  });

  it("does not charge a private plan to another scope", () => {
    const result = indicators({
      scope: { kind: "group", groupId: "group-dom" },
      transactions: [],
      links: [],
    });
    expect(result.payments30).toBe(0);
    expect(result.forecast30).toBe(12_000);
  });

  it("reports an empty anchored scope as its opening amount", () => {
    const result = indicators({ transactions: [], items: [], links: [] });
    expect(result.balance).toBe(12_000);
    expect(result.payments30).toBe(0);
    expect(result.overdue).toBe(0);
    expect(result.orientational30).toBe(0);
    expect(result.forecast30).toBe(12_000);
    expect(result.arcScale).toBeNull();
  });

  it("does not cancel an expense against a matching income", () => {
    const result = indicators({
      transactions: [
        tx({ id: "tx-out", amount: 500, status: "upcoming", date: "2026-10-12" }),
        tx({
          id: "tx-in",
          type: "income",
          amount: 500,
          status: "upcoming",
          date: "2026-10-12",
        }),
      ],
      items: [],
      links: [],
    });
    expect(result.payments30).toBe(500);
    expect(result.forecast30).toBe(12_000);
  });
});
