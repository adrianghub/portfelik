import { describe, expect, it } from "vitest";
import {
  isActionableNotification,
  notificationSettleHref,
  obligationTagFromData,
} from "$lib/services/notification-actions";

describe("notification-actions", () => {
  it("detects actionable transaction reminders", () => {
    expect(
      isActionableNotification({
        type: "transaction_reminder",
        data: { actionable: true, transactionId: "tx-1" },
      })
    ).toBe(true);
    expect(
      isActionableNotification({
        type: "bank_import_reminder",
        data: {
          type: "bank_import_reminder",
          actionable: false,
          cadenceDays: 7,
          latestImportSessionId: null,
          latestImportCommittedAt: null,
        },
      })
    ).toBe(false);
  });

  it("builds settle deep link with notification id", () => {
    expect(
      notificationSettleHref({
        id: "notif-1",
        type: "transaction_overdue",
        data: { actionable: true, transactionId: "tx-9" },
      })
    ).toBe("/transactions?txId=tx-9&action=settle&notificationId=notif-1");
  });

  it("prefers obligationKey for OS notification tags", () => {
    expect(obligationTagFromData({ obligationKey: "template:abc:2026-07-03" })).toBe(
      "template:abc:2026-07-03"
    );
    expect(obligationTagFromData({ transactionId: "tx-1" })).toBe("tx:tx-1");
  });
});
