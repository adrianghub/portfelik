import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/svelte-query";
import {
  broadcastNotificationSync,
  notifyNotificationsChanged,
  NOTIFICATION_SYNC_CHANNEL,
} from "$lib/services/notification-sync";

describe("notification-sync", () => {
  it("broadcastNotificationSync is a no-op without BroadcastChannel", () => {
    expect(() => broadcastNotificationSync({ type: "invalidate" })).not.toThrow();
  });

  it("notifyNotificationsChanged invalidates the notifications query", () => {
    const invalidateQueries = vi.fn();
    const queryClient = { invalidateQueries } as unknown as QueryClient;

    notifyNotificationsChanged(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications"] });
  });

  it("exports a stable channel name for sw.js parity", () => {
    expect(NOTIFICATION_SYNC_CHANNEL).toBe("portfelik-notifications");
  });
});
