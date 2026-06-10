import type { QueryClient } from "@tanstack/svelte-query";

/** Shared with static/sw.js - keep in sync when renaming. */
export const NOTIFICATION_SYNC_CHANNEL = "portfelik-notifications";

/** postMessage type from the service worker to open tabs. */
export const SW_NOTIFICATION_MESSAGE_TYPE = "portfelik:notification";

export type NotificationSyncPayload = { type: "invalidate" };

export type ForegroundPushPayload = {
  title: string;
  body: string;
  notificationId?: string;
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

/** Invalidate the bell in this tab and notify other open tabs. */
export function notifyNotificationsChanged(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  };

  channel?.addEventListener("message", onChannelMessage);

  const onServiceWorkerMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || data.type !== SW_NOTIFICATION_MESSAGE_TYPE) return;

    void queryClient.invalidateQueries({ queryKey: ["notifications"] });

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
