import { describe, expect, it } from "vitest";
import { partitionTransactionCards } from "$lib/components/transactions/transaction-bands";
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
    const bands = partitionTransactionCards([row("paid"), row("paid")]);
    expect(bands).toEqual([{ id: "history", titled: false, rows: [row("paid"), row("paid")] }]);
  });
});
