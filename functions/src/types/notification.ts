export type NotificationType =
  | "system_notification"
  | "transaction_summary"
  | "admin_weekly_transaction_summary"
  | "group_invitation"
  | "transaction_upcoming"
  | "transaction_overdue"
  | "transaction_reminder";

export interface Notification {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}
