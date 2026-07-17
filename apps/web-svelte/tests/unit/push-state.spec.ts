import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
};

vi.stubGlobal("localStorage", localStorageMock);

const h = vi.hoisted(() => ({
  permission: "granted" as NotificationPermission,
  subscription: { endpoint: "https://push.example/ep1" } as { endpoint: string } | null,
  serverRow: { endpoint: "https://push.example/ep1" } as { endpoint: string } | null,
  serverError: null as unknown,
}));

vi.mock("$env/static/public", () => ({ PUBLIC_VAPID_KEY: "BAAAA" }));

vi.mock("$lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: h.serverRow, error: h.serverError }),
        }),
      }),
    }),
  },
}));

vi.mock("$lib/services/pwa", () => ({
  isStandalonePwa: () => false,
  shouldDeferBrowserPush: () => false,
}));

Object.defineProperty(globalThis, "Notification", {
  value: {
    get permission() {
      return h.permission;
    },
  },
  configurable: true,
});

Object.defineProperty(globalThis, "navigator", {
  value: {
    serviceWorker: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => h.subscription,
        },
      }),
    },
  },
  configurable: true,
});

import { getPushNotificationState } from "$lib/services/push";

describe("getPushNotificationState", () => {
  beforeEach(() => {
    h.permission = "granted";
    h.subscription = { endpoint: "https://push.example/ep1" };
    h.serverRow = { endpoint: "https://push.example/ep1" };
    h.serverError = null;
    store.clear();
  });

  it("is blocked when permission is denied", async () => {
    h.permission = "denied";
    expect(await getPushNotificationState()).toBe("blocked");
  });

  it("is disabled when opted out", async () => {
    store.set("portfelik_push_opt_out", "1");
    expect(await getPushNotificationState()).toBe("disabled");
  });

  it("is disabled when the browser has a sub but no server row", async () => {
    h.serverRow = null;
    expect(await getPushNotificationState()).toBe("disabled");
  });

  it("is active only when browser and server agree", async () => {
    expect(await getPushNotificationState()).toBe("active");
  });
});
