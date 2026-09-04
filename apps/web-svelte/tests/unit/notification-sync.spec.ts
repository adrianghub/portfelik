import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("$lib/auth/session.svelte", () => {
  const session = { userId: null as string | null };
  return {
    session,
    setSessionUser: (id: string | null) => {
      session.userId = id;
    },
    requireSessionUserId: () => {
      if (!session.userId) throw new Error("No authenticated user");
      return session.userId;
    },
  };
});

import { setSessionUser } from "$lib/auth/session.svelte";
import { qk } from "$lib/query-keys";
import {
  broadcastNotificationSync,
  notifyNotificationsChanged,
  NOTIFICATION_SYNC_CHANNEL,
} from "$lib/services/notification-sync";

describe("notification-sync", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setSessionUser(null);
  });

  it("broadcastNotificationSync is a no-op without BroadcastChannel", () => {
    expect(() => broadcastNotificationSync({ type: "invalidate" })).not.toThrow();
  });

  it("notifyNotificationsChanged invalidates the user-scoped notifications query", () => {
    setSessionUser("user-a");
    const invalidateQueries = vi.fn();
    const queryClient = { invalidateQueries } as never;

    notifyNotificationsChanged(queryClient);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: qk.notifications("user-a") });
  });

  it("notifyNotificationsChanged broadcasts the invalidation to other tabs", () => {
    const postMessage = vi.fn();
    const close = vi.fn();
    const BroadcastChannelMock = vi.fn(function () {
      return { postMessage, close };
    });
    vi.stubGlobal("BroadcastChannel", BroadcastChannelMock);
    setSessionUser("user-a");

    notifyNotificationsChanged({ invalidateQueries: vi.fn() } as never);

    expect(BroadcastChannelMock).toHaveBeenCalledWith(NOTIFICATION_SYNC_CHANNEL);
    expect(postMessage).toHaveBeenCalledWith({ type: "invalidate" });
    expect(close).toHaveBeenCalled();
  });

  it("exports a stable channel name for sw.js parity", () => {
    expect(NOTIFICATION_SYNC_CHANNEL).toBe("jakstoimy-notifications");
  });
});
