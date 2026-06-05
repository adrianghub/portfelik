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

export async function fetchAdminNotifications(limit = 50): Promise<Notification[]> {
  const { data, error } = await supabase.rpc("fetch_admin_notifications", { p_limit: limit });
  if (error) throw error;
  // fetch_admin_notifications returns masked rows (user_token instead of user_id/data);
  // cast via unknown since the masked shape is intentionally narrower than Notification.
  return (data ?? []) as unknown as Notification[];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase.rpc("mark_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) throw error;
}

export async function markNotificationUnread(notificationId: string): Promise<void> {
  // Direct update is permitted by the `notifications_update_own` RLS policy.
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: null })
    .eq("id", notificationId);
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
