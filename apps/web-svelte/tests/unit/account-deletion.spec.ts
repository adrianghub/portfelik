import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  forget: vi.fn(),
  flush: vi.fn(),
}));
vi.mock("$lib/supabase", () => ({ supabase: { auth: { getUser: h.getUser }, rpc: h.rpc } }));
vi.mock("$lib/demo/identity-session", () => ({
  forgetDemoAccess: h.forget,
  isDemoAccountUser: (user: { app_metadata: { account_kind?: string } }) =>
    user.app_metadata.account_kind === "demo",
}));
vi.mock("$lib/auth/device-storage", () => ({ flushDeviceAuthStorage: h.flush }));
import { deleteAccount } from "$lib/services/groups";

beforeEach(() => {
  vi.resetAllMocks();
  h.getUser.mockResolvedValue({
    data: { user: { id: "d1", app_metadata: { account_kind: "demo" } } },
    error: null,
  });
  h.rpc.mockResolvedValue({ error: null });
  h.flush.mockResolvedValue(undefined);
});

describe("account deletion and installation binding", () => {
  it("forgets demo only after confirmed deletion and waits for durable native storage", async () => {
    await deleteAccount();
    expect(h.rpc).toHaveBeenCalledWith("delete_account");
    expect(h.forget).toHaveBeenCalledOnce();
    expect(h.flush).toHaveBeenCalledOnce();
    expect(h.rpc.mock.invocationCallOrder[0]).toBeLessThan(h.forget.mock.invocationCallOrder[0]);
  });
  it("keeps the demo binding after denied or uncertain deletion", async () => {
    const error = new Error("has_owned_groups");
    h.rpc.mockResolvedValue({ error });
    await expect(deleteAccount()).rejects.toBe(error);
    expect(h.forget).not.toHaveBeenCalled();
    expect(h.flush).not.toHaveBeenCalled();
  });
  it("does not forget the independent demo when deleting a real account", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "r1", app_metadata: {} } }, error: null });
    await deleteAccount();
    expect(h.forget).not.toHaveBeenCalled();
  });
  it("does not delete when the current identity cannot be verified", async () => {
    h.getUser.mockResolvedValue({ data: { user: null }, error: new Error("network") });
    await expect(deleteAccount()).rejects.toThrow("network");
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.forget).not.toHaveBeenCalled();
  });
  it("surfaces vault write failure instead of reporting complete cleanup", async () => {
    h.flush.mockRejectedValue(new Error("vault_write_failed"));
    await expect(deleteAccount()).rejects.toThrow("vault_write_failed");
  });
});
