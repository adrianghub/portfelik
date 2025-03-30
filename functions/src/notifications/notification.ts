export type NotificationType =
  | "system_notification"
  | "transaction_summary"
  | "admin_transaction_summary"
  | "group_invitation";

export interface Notification {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}
