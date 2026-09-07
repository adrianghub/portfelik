import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("$lib/supabase", () => ({
  supabase: {
    auth: { getUser },
  },
}));

import { requireAuthUser } from "$lib/auth/require-user";

describe("requireAuthUser", () => {
  beforeEach(() => {
    getUser.mockReset();
  });

  it("returns the Auth-server user", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    await expect(requireAuthUser()).resolves.toEqual({ id: "u1" });
  });

  it("returns null when Auth rejects the session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    await expect(requireAuthUser()).resolves.toBeNull();
  });
});
