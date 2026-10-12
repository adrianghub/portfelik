import { describe, expect, it } from "vitest";
import {
  partitionTransactionCards,
  usesTransactionStatusBands,
} from "$lib/components/transactions/transaction-bands";
import type { TransactionStatus } from "$lib/types";

function row(status: TransactionStatus, projected = false) {
  return { status, projected };
}

describe("transaction card bands", () => {
  it("keeps overdue out of the upcoming band", () => {
    const bands = partitionTransactionCards([row("overdue"), row("upcoming"), row("paid")]);
    expect(bands.map((band) => band.id)).toEqual(["overdue", "upcoming", "history"]);
    expect(bands.every((band) => band.titled)).toBe(true);
    expect(bands[0]?.rows).toEqual([row("overdue")]);
  });

  it("does not call a draft history", () => {
    const bands = partitionTransactionCards([row("draft"), row("paid")]);
    expect(bands.map((band) => band.id)).toEqual(["draft", "history"]);
  });

  it("leaves a single status untitled", () => {
    const bands = partitionTransactionCards([row("paid")]);
    expect(bands).toEqual([{ id: "history", titled: false, rows: [row("paid")] }]);
  });

  it("keeps bands for the default date order and drops them for search or another sort", () => {
    expect(usesTransactionStatusBands("responsive", "date", "desc", "desc")).toBe(true);
    expect(usesTransactionStatusBands("responsive", "date", "asc", "asc")).toBe(true);
    expect(usesTransactionStatusBands("responsive", "date", "asc", "desc")).toBe(false);
    expect(usesTransactionStatusBands("responsive", "amount", "asc", "desc")).toBe(false);
    expect(usesTransactionStatusBands("cards", "date", "desc", "desc")).toBe(false);
  });
});
