import { describe, expect, it } from "vitest";
import { uniqueCockpitMonthRows } from "$lib/cockpit/month-view";

describe("uniqueCockpitMonthRows", () => {
  it("keeps the first row when cash-history and month ledger share an id", () => {
    const rows = uniqueCockpitMonthRows([
      {
        id: "tx-1",
        type: "expense",
        amount: 100,
        status: "paid",
        date: "2026-10-05",
        currency: "PLN",
        groupId: null,
        categoryId: null,
      },
      {
        id: "tx-1",
        type: "expense",
        amount: 100,
        status: "paid",
        date: "2026-10-05",
        currency: "PLN",
        groupId: null,
        categoryId: "cat",
      },
      {
        id: "tx-2",
        type: "income",
        amount: 50,
        status: "upcoming",
        date: "2026-10-20",
        currency: "PLN",
        groupId: null,
        categoryId: null,
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(["tx-1", "tx-2"]);
    expect(rows[0]?.categoryId).toBeNull();
  });
});
