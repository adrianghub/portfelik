import { describe, expect, it } from "vitest";
import { notificationTargetHref } from "$lib/notification-targets";

describe("notificationTargetHref", () => {
  it("routes bank import reminders to the import module", () => {
    expect(
      notificationTargetHref({
        type: "bank_import_reminder",
        data: {
          type: "bank_import_reminder",
          cadenceDays: 7,
          latestImportSessionId: null,
          latestImportCommittedAt: null,
        },
      })
    ).toBe("/transactions/import");
  });

  it("keeps transaction reminders linked to their transaction when available", () => {
    expect(
      notificationTargetHref({
        type: "transaction_reminder",
        data: { type: "transaction_reminder", transactionId: "tx-1", amount: 42 },
      })
    ).toBe("/transactions?txId=tx-1");
  });
});
