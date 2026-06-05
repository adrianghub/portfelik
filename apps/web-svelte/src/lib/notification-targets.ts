import type { Notification } from "$lib/types";

export function notificationTargetHref(
  notification: Pick<Notification, "type" | "data">
): string | null {
  switch (notification.type) {
    case "group_invitation":
      return "/settings?tab=groups";
    case "transaction_upcoming":
    case "transaction_overdue":
    case "transaction_reminder": {
      const data = notification.data;
      const txId = data && "transactionId" in data ? data.transactionId : null;
      return txId ? `/transactions?txId=${txId}` : "/transactions";
    }
    case "transaction_summary":
      return "/transactions";
    case "bank_import_reminder":
      return "/import";
    default:
      return null;
  }
}
