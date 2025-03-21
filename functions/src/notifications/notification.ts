export type NotificationType = "system_notification" | "transaction_summary";

export interface Notification {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  createdAt: string;
}
