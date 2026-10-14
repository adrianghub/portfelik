import { describe, expect, it } from "vitest";
import {
  partitionTransactionCards,
  usesTransactionStatusBands,
} from "$lib/components/transactions/transaction-bands";
import type { TransactionStatus } from "$lib/types";

function row(status: TransactionStatus, projected = false, date = "2026-10-01") {
  return { status, projected, date };
}

describe("transaction card bands", () => {
  it("keeps overdue out of the upcoming band", () => {
    const bands = partitionTransactionCards([row("overdue"), row("upcoming"), row("paid")]);
    expect(bands.map((band) => band.id)).toEqual(["overdue", "upcoming", "history"]);
    expect(bands.every((band) => band.titled)).toBe(true);
    expect(bands[0]?.rows).toEqual([row("overdue")]);
  });

  it("sorts upcoming and overdue bands soonest first", () => {
    const bands = partitionTransactionCards([
      row("upcoming", false, "2026-11-20"),
      row("upcoming", false, "2026-10-15"),
      row("overdue", false, "2026-10-05"),
      row("overdue", false, "2026-09-01"),
      row("paid", false, "2026-08-01"),
    ]);
    expect(bands.find((band) => band.id === "overdue")?.rows.map((r) => r.date)).toEqual([
      "2026-09-01",
      "2026-10-05",
    ]);
    expect(bands.find((band) => band.id === "upcoming")?.rows.map((r) => r.date)).toEqual([
      "2026-10-15",
      "2026-11-20",
    ]);
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
