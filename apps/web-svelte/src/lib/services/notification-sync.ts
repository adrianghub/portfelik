import { session } from "$lib/auth/session.svelte";
import { qk } from "$lib/query-keys";
import type { QueryClient } from "@tanstack/svelte-query";

/** Shared with static/sw.js - keep in sync when renaming. */
export const NOTIFICATION_SYNC_CHANNEL = "jakstoimy-notifications";

/** postMessage type from the service worker to open tabs. */
export const SW_NOTIFICATION_MESSAGE_TYPE = "jakstoimy:notification";

export type NotificationSyncPayload = { type: "invalidate" };

export type ForegroundPushPayload = {
  title: string;
  body: string;
  notificationId?: string;
  data?: Record<string, unknown>;
};

export function broadcastNotificationSync(payload: NotificationSyncPayload): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(NOTIFICATION_SYNC_CHANNEL);
    channel.postMessage(payload);
    channel.close();
  } catch {
    // Private mode / unsupported - local invalidate still runs.
  }
}

function invalidateNotifications(queryClient: QueryClient): void {
  const u = session.userId;
  if (!u) return;
  void queryClient.invalidateQueries({ queryKey: qk.notifications(u) });
}

/** Invalidate the bell in this tab and notify other open tabs. */
export function notifyNotificationsChanged(queryClient: QueryClient): void {
  invalidateNotifications(queryClient);
  broadcastNotificationSync({ type: "invalidate" });
}

export function setupNotificationSync(
  queryClient: QueryClient,
  onForegroundPush?: (payload: ForegroundPushPayload) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(NOTIFICATION_SYNC_CHANNEL)
      : null;

  const onChannelMessage = (event: MessageEvent<NotificationSyncPayload>) => {
    if (event.data?.type === "invalidate") {
      invalidateNotifications(queryClient);
    }
  };

  channel?.addEventListener("message", onChannelMessage);

  const onServiceWorkerMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== SW_NOTIFICATION_MESSAGE_TYPE) return;

    invalidateNotifications(queryClient);

    const payload = data.payload as ForegroundPushPayload | undefined;
    if (payload?.title && document.hasFocus() && onForegroundPush) {
      onForegroundPush(payload);
    }
  };

  navigator.serviceWorker?.addEventListener("message", onServiceWorkerMessage);

  return () => {
    channel?.removeEventListener("message", onChannelMessage);
    channel?.close();
    navigator.serviceWorker?.removeEventListener("message", onServiceWorkerMessage);
  };
}
