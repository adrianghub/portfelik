import { supabase } from "$lib/supabase";
import type { Notification } from "$lib/types";

export async function fetchNotifications(): Promise<Notification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id, user_id, type, title, body, data, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as Notification[];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase.rpc("mark_all_notifications_read");
  if (error) throw error;
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const { error } = await supabase.from("notifications").delete().eq("id", notificationId);
  if (error) throw error;
}
