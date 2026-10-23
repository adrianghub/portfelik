import { beforeEach, expect, it, vi } from "vitest";
const { getUser, update, eq, single } = vi.hoisted(() => ({
  getUser: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
}));
vi.mock("$lib/supabase", () => ({
  supabase: {
    auth: { getUser },
    from: () => ({
      update: (value: unknown) => {
        update(value);
        return {
          eq: (key: string, id: string) => {
            eq(key, id);
            return { select: () => ({ single }) };
          },
        };
      },
    }),
  },
}));
import { updateDemoName } from "$lib/services/profiles";
beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({
    data: { user: { id: "current-demo", app_metadata: { account_kind: "demo" } } },
    error: null,
  });
  single.mockResolvedValue({ data: { id: "current-demo", name: "Adrian" }, error: null });
});
it("writes only the trimmed name of the current verified demo identity", async () => {
  await updateDemoName("  Adrian  ");
  expect(update).toHaveBeenCalledWith({ name: "Adrian" });
  expect(eq).toHaveBeenCalledWith("id", "current-demo");
});
it("keeps the neutral name for empty input", async () => {
  await updateDemoName("   ");
  expect(update).toHaveBeenCalledWith({ name: "Konto demo" });
});
it("accepts 30 characters and refuses 31 before writing", async () => {
  await updateDemoName("a".repeat(30));
  update.mockClear();
  await expect(updateDemoName("a".repeat(31))).rejects.toThrow("demo_name_too_long");
  expect(update).not.toHaveBeenCalled();
});
it.each([null, { id: "real", app_metadata: {} }])(
  "does not write a real or absent identity",
  async (user) => {
    getUser.mockResolvedValue({ data: { user }, error: null });
    await expect(updateDemoName("Adrian")).rejects.toThrow("demo_account_required");
    expect(update).not.toHaveBeenCalled();
  }
);
it("fails closed on Auth failure", async () => {
  getUser.mockResolvedValue({ data: { user: null }, error: new Error("Auth unavailable") });
  await expect(updateDemoName("Adrian")).rejects.toThrow("Auth unavailable");
  expect(update).not.toHaveBeenCalled();
});
