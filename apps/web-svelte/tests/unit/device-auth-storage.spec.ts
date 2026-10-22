import { beforeEach, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({ native: true, read: vi.fn(), write: vi.fn() }));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => bridge.native },
  registerPlugin: () => ({ read: bridge.read, write: bridge.write }),
}));

beforeEach(() => {
  vi.resetModules();
  bridge.native = true;
  bridge.read.mockReset().mockResolvedValue({ items: {} });
  bridge.write.mockReset().mockResolvedValue(undefined);
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  });
});

it("persists native credentials through the bridge without writing localStorage", async () => {
  const storage = await import("../../src/lib/auth/device-storage");
  await storage.supabaseAuthStorage.setItem("sb-staging-auth-token", "test-session");
  expect(localStorage.getItem("sb-staging-auth-token")).toBeNull();
  expect(bridge.write).toHaveBeenLastCalledWith({
    items: { "sb-staging-auth-token": "test-session" },
  });
  bridge.read.mockResolvedValue({ items: { "sb-staging-auth-token": "test-session" } });
  vi.resetModules();
  const restarted = await import("../../src/lib/auth/device-storage");
  expect(await restarted.supabaseAuthStorage.getItem("sb-staging-auth-token")).toBe("test-session");
});

it("fails closed on unreadable native credentials rather than resetting them", async () => {
  bridge.read.mockRejectedValue(new Error("key unavailable"));
  const storage = await import("../../src/lib/auth/device-storage");
  await expect(storage.initializeDeviceAuthStorage()).rejects.toThrow("key unavailable");
  await expect(storage.supabaseAuthStorage.getItem("sb-staging-auth-token")).rejects.toThrow();
  expect(bridge.write).not.toHaveBeenCalled();
});

it("migrates plaintext only after the encrypted native write is confirmed", async () => {
  let plaintext: string | null = "legacy-test-session";
  vi.stubGlobal("localStorage", {
    "sb-staging-auth-token": plaintext,
    getItem: () => plaintext,
    removeItem: () => {
      plaintext = null;
    },
  });
  bridge.write.mockImplementation(async () => {
    expect(plaintext).toBe("legacy-test-session");
  });
  const storage = await import("../../src/lib/auth/device-storage");
  await storage.initializeDeviceAuthStorage();
  expect(plaintext).toBeNull();
  expect(await storage.supabaseAuthStorage.getItem("sb-staging-auth-token")).toBe(
    "legacy-test-session"
  );
});

it("retains legacy access on failed migration and blocks native restoration", async () => {
  const remove = vi.fn();
  vi.stubGlobal("localStorage", {
    "sb-staging-auth-token": "legacy-test-session",
    getItem: () => "legacy-test-session",
    removeItem: remove,
  });
  bridge.write.mockRejectedValue(new Error("disk unavailable"));
  const storage = await import("../../src/lib/auth/device-storage");
  await expect(storage.initializeDeviceAuthStorage()).rejects.toThrow();
  expect(remove).not.toHaveBeenCalled();
  await expect(storage.supabaseAuthStorage.getItem("sb-staging-auth-token")).rejects.toThrow();
});

it("waits for a durable write before completing, and latches write failure", async () => {
  bridge.write.mockRejectedValue(new Error("disk unavailable"));
  const storage = await import("../../src/lib/auth/device-storage");
  await expect(
    storage.supabaseAuthStorage.setItem("jakstoimy.auth.demo.session.v1", "test-session")
  ).rejects.toThrow();
  await expect(
    storage.supabaseAuthStorage.getItem("jakstoimy.auth.demo.session.v1")
  ).rejects.toThrow();
});

it("keeps the normal browser storage adapter without invoking the native vault", async () => {
  bridge.native = false;
  const storage = await import("../../src/lib/auth/device-storage");
  await storage.supabaseAuthStorage.setItem("sb-staging-auth-token", "test-session");
  expect(localStorage.getItem("sb-staging-auth-token")).toBe("test-session");
  expect(bridge.read).not.toHaveBeenCalled();
  expect(bridge.write).not.toHaveBeenCalled();
});
