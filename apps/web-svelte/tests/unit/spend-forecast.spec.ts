import { describe, expect, it } from "vitest";
import { forecastPosition, livePosition } from "$lib/services/cash-position";
import {
  appendConfirmedSpendForecast,
  confirmedSpendForecastFlows,
} from "$lib/plans/spend-forecast";
import type { SpendForecastItem, SpendForecastLink } from "$lib/plans/spend-forecast";

const anchor = { opening_amount: 12_000, as_of_date: "2026-01-01" };
const today = "2026-10-08";
const horizonEnd = "2026-11-07";

function item(overrides: Partial<SpendForecastItem> = {}): SpendForecastItem {
  return {
    id: "item-apartment",
    amount: 4_000,
    dueDate: "2026-10-22",
    status: "confirmed",
    groupId: null,
    ...overrides,
  };
}

function flows(
  items: SpendForecastItem[],
  links: SpendForecastLink[] = [],
  forecastTransactionIds: string[] = []
) {
  return confirmedSpendForecastFlows({
    items,
    links,
    forecastTransactionIds: new Set(forecastTransactionIds),
    today,
  });
}

describe("confirmed spend forecast flows", () => {
  it("subtracts a paid deposit once from the private forecast", () => {
    const paidDeposit = {
      id: "tx-deposit",
      type: "expense" as const,
      amount: 1_000,
      status: "paid",
      date: "2026-02-01",
      currency: "PLN",
    };
    const outflow = flows(
      [item()],
      [
        {
          planItemId: "item-apartment",
          transactionId: "tx-deposit",
          amount: 1_000,
          countsAsPaid: true,
        },
      ]
    );
    expect(outflow).toEqual([
      expect.objectContaining({ amount: 3_000, date: "2026-10-22", status: "upcoming" }),
    ]);
    expect(forecastPosition(anchor, [paidDeposit, ...outflow], { today, horizonEnd })).toBe(8_000);
  });

  it("does not add a scheduled transaction that is already in the forecast", () => {
    const upcoming = {
      id: "tx-rest",
      type: "expense" as const,
      amount: 1_000,
      status: "upcoming",
      date: "2026-10-22",
      currency: "PLN",
    };
    const outflow = flows(
      [item()],
      [
        {
          planItemId: "item-apartment",
          transactionId: "tx-rest",
          amount: 1_000,
          countsAsPaid: false,
        },
      ],
      ["tx-rest"]
    );
    expect(outflow[0]?.amount).toBe(3_000);
    expect(forecastPosition(anchor, [upcoming, ...outflow], { today, horizonEnd })).toBe(8_000);
  });

  it("keeps an orientational line and a cancelled line out of the forecast", () => {
    expect(
      flows([
        item({ id: "planned", status: "planned" }),
        item({ id: "estimated", status: "estimated", dueDate: null }),
        item({ id: "cancelled", status: "cancelled" }),
      ])
    ).toEqual([]);
    expect(
      forecastPosition(anchor, flows([item({ status: "planned" })]), { today, horizonEnd })
    ).toBe(12_000);
  });

  it("does not turn an overpayment into a future inflow", () => {
    expect(
      flows(
        [item()],
        [
          {
            planItemId: "item-apartment",
            transactionId: "tx-over",
            amount: 4_500,
            countsAsPaid: true,
          },
        ]
      )
    ).toEqual([]);
  });

  it("leaves a shared plan out of the private cash forecast", () => {
    expect(flows([item({ groupId: "group-dom" })])).toEqual([]);
  });

  it("marks a past confirmed remainder as overdue", () => {
    expect(flows([item({ dueDate: "2026-10-01" })])[0]?.status).toBe("overdue");
  });

  it("recalculates the remainder when the deposit changes or is unlinked", () => {
    const deposit = {
      id: "tx-deposit",
      type: "expense" as const,
      amount: 1_000,
      status: "paid",
      date: "2026-02-01",
      currency: "PLN",
    };
    const linked = {
      planItemId: "item-apartment",
      transactionId: "tx-deposit",
      amount: 1_000,
      countsAsPaid: true,
    };
    const source = { items: [item()], links: [linked] };
    expect(
      forecastPosition(anchor, appendConfirmedSpendForecast([deposit], source, today), {
        today,
        horizonEnd,
      })
    ).toBe(8_000);

    const changed = { ...deposit, amount: 800 };
    const changedSource = { items: [item()], links: [{ ...linked, amount: 800 }] };
    expect(
      forecastPosition(anchor, appendConfirmedSpendForecast([changed], changedSource, today), {
        today,
        horizonEnd,
      })
    ).toBe(8_000);
    expect(flows([item()], changedSource.links)[0]?.amount).toBe(3_200);

    const unlinked = forecastPosition(
      anchor,
      appendConfirmedSpendForecast([deposit], { items: [item()], links: [] }, today),
      { today, horizonEnd }
    );
    expect(flows([item()])[0]?.amount).toBe(4_000);
    expect(unlinked).toBe(7_000);
  });

  it("drops a fully settled line and does not turn an overpayment into income", () => {
    const settled = {
      id: "tx-full",
      type: "expense" as const,
      amount: 4_000,
      status: "paid",
      date: "2026-10-08",
      currency: "PLN",
    };
    const settledForecast = forecastPosition(
      anchor,
      appendConfirmedSpendForecast(
        [settled],
        {
          items: [item()],
          links: [
            {
              planItemId: "item-apartment",
              transactionId: "tx-full",
              amount: 4_000,
              countsAsPaid: true,
            },
          ],
        },
        today
      ),
      { today, horizonEnd }
    );
    expect(settledForecast).toBe(livePosition(anchor, [settled]));
    expect(settledForecast).toBe(8_000);

    const overpaid = { ...settled, id: "tx-over", amount: 4_500 };
    const overLink = {
      planItemId: "item-apartment",
      transactionId: "tx-over",
      amount: 4_500,
      countsAsPaid: true,
    };
    expect(flows([item()], [overLink])).toEqual([]);
    expect(
      forecastPosition(
        anchor,
        appendConfirmedSpendForecast([overpaid], { items: [item()], links: [overLink] }, today),
        { today, horizonEnd }
      )
    ).toBe(livePosition(anchor, [overpaid]));
  });

  it("follows the due date and leaves the forecast when confirmation is removed", () => {
    const deposit = {
      id: "tx-deposit",
      type: "expense" as const,
      amount: 1_000,
      status: "paid",
      date: "2026-02-01",
      currency: "PLN",
    };
    const links = [
      {
        planItemId: "item-apartment",
        transactionId: "tx-deposit",
        amount: 1_000,
        countsAsPaid: true,
      },
    ];
    expect(flows([item({ dueDate: "2026-11-03" })], links)).toEqual([
      expect.objectContaining({ amount: 3_000, date: "2026-11-03", status: "upcoming" }),
    ]);
    const inside = forecastPosition(
      anchor,
      appendConfirmedSpendForecast(
        [deposit],
        { items: [item({ dueDate: "2026-10-22" })], links },
        today
      ),
      { today, horizonEnd: "2026-10-31" }
    );
    const movedPastHorizon = forecastPosition(
      anchor,
      appendConfirmedSpendForecast(
        [deposit],
        { items: [item({ dueDate: "2026-11-03" })], links },
        today
      ),
      { today, horizonEnd: "2026-10-31" }
    );
    expect(inside).toBe(8_000);
    expect(movedPastHorizon).toBe(11_000);

    for (const status of ["planned", "cancelled"] as const) {
      expect(
        forecastPosition(
          anchor,
          appendConfirmedSpendForecast([deposit], { items: [item({ status })], links }, today),
          { today, horizonEnd }
        )
      ).toBe(11_000);
    }
  });
});
