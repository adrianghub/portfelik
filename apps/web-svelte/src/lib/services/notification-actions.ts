import type { Notification, NotificationType } from "$lib/types";

const ACTIONABLE_TYPES = new Set<NotificationType>(["transaction_reminder", "transaction_overdue"]);

export function isActionableNotification(
  notification: Pick<Notification, "type" | "data">
): boolean {
  if (!ACTIONABLE_TYPES.has(notification.type)) return false;
  const data = notification.data as Record<string, unknown> | null;
  if (!data) return false;
  return data.actionable === true && typeof data.transactionId === "string";
}

export function notificationSettleHref(
  notification: Pick<Notification, "type" | "data" | "id">
): string | null {
  if (!isActionableNotification(notification)) return null;
  const data = notification.data as Record<string, unknown> | null;
  const txId = data && typeof data.transactionId === "string" ? data.transactionId : null;
  if (!txId) return null;
  const params = new URLSearchParams({ txId, action: "settle", notificationId: notification.id });
  return `/transactions?${params.toString()}`;
}

export function obligationTagFromData(data: Record<string, unknown> | null | undefined): string {
  if (data?.obligationKey && typeof data.obligationKey === "string") return data.obligationKey;
  if (data?.notificationId && typeof data.notificationId === "string") return data.notificationId;
  if (data?.transactionId) return `tx:${String(data.transactionId)}`;
  return "jakstoimy";
}
