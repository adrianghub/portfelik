import { describe, expect, it } from "vitest";
import {
  computeForecastSummary,
  computeLedgerSummary,
  forecastTransactions,
  ledgerTransactions,
} from "$lib/services/transaction-cashflow";
import type { TransactionWithCategory } from "$lib/types";

function tx(
  overrides: Partial<TransactionWithCategory> & { status: TransactionWithCategory["status"] }
): TransactionWithCategory {
  return {
    id: "tx-1",
    amount: 100,
    currency: "PLN",
    counterparty: null,
    description: "Test",
    date: "2026-06-08",
    type: "expense",
    category_id: "cat",
    category_name: "Inne",
    category_type: "expense",
    is_hold: false,
    user_id: "u1",
    is_recurring: false,
    recurring_day: null,
    recurrence_frequency: null,
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    recurring_occurrence_date: null,
    group_id: null,
    created_at: "2026-06-08T10:00:00Z",
    updated_at: "2026-06-08T10:00:00Z",
    ...overrides,
  };
}

describe("transaction-cashflow", () => {
  const rows = [
    tx({ id: "paid", status: "paid", amount: 200 }),
    tx({ id: "upcoming", status: "upcoming", amount: 300 }),
    tx({ id: "draft", status: "draft", amount: 400 }),
  ];

  it("ledger includes paid only", () => {
    expect(ledgerTransactions(rows).map((r) => r.id)).toEqual(["paid"]);
    expect(computeLedgerSummary(rows).total_expenses).toBe(200);
  });

  it("forecast includes paid, upcoming, and overdue", () => {
    const forecastRows = [
      ...rows,
      tx({ id: "overdue", status: "overdue", amount: 50 }),
    ];
    expect(forecastTransactions(forecastRows).map((r) => r.id).sort()).toEqual([
      "overdue",
      "paid",
      "upcoming",
    ]);
    expect(computeForecastSummary(forecastRows).total_expenses).toBe(550);
  });
});
