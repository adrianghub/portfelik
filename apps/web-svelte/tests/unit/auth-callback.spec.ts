import { beforeEach, describe, expect, it, vi } from "vitest";
const { auth } = vi.hoisted(() => ({
  auth: {
    exchangeCodeForSession: vi.fn(),
    setSession: vi.fn(),
    getUser: vi.fn(),
  },
}));
vi.mock("$lib/supabase", () => ({ supabase: { auth } }));
import { completeAuthCallback } from "$lib/auth/callback";

beforeEach(() => {
  vi.resetAllMocks();
  auth.exchangeCodeForSession.mockResolvedValue({ error: null });
  auth.setSession.mockResolvedValue({ error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
});

describe("explicit web and native auth callback", () => {
  it("exchanges PKCE once and returns to the invitation", async () => {
    expect(
      await completeAuthCallback(
        new URL("https://app.test/auth/callback?code=one-use&redirectTo=%2Finvite%2Ftoken")
      )
    ).toBe("/invite/token");
    expect(auth.exchangeCodeForSession).toHaveBeenCalledExactlyOnceWith("one-use");
    expect(auth.setSession).not.toHaveBeenCalled();
  });
  it("installs implicit credentials when the Android app is already open", async () => {
    expect(
      await completeAuthCallback(
        new URL(
          "https://app.test/auth/callback?redirectTo=%2Fauth%2Fsetup#access_token=a&refresh_token=r"
        )
      )
    ).toBe("/auth/setup");
    expect(auth.setSession).toHaveBeenCalledWith({ access_token: "a", refresh_token: "r" });
  });
  it("takes a recovery link to password setup even without a redirect", async () => {
    expect(
      await completeAuthCallback(
        new URL("https://app.test/auth/callback#access_token=a&refresh_token=r&type=recovery")
      )
    ).toBe("/auth/setup?mode=recovery&redirectTo=%2F");
  });
  it.each(["?error=access_denied", "#error=expired", "#access_token=partial"])(
    "does not use a cached session after a bad explicit callback: %s",
    async (suffix) => {
      await expect(
        completeAuthCallback(new URL(`https://app.test/auth/callback${suffix}`))
      ).rejects.toThrow();
      expect(auth.getUser).not.toHaveBeenCalled();
    }
  );
  it("does not hide a replayed or expired code behind an existing session", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({ error: new Error("expired") });
    await expect(
      completeAuthCallback(new URL("https://app.test/auth/callback?code=used"))
    ).rejects.toThrow("expired");
    expect(auth.getUser).not.toHaveBeenCalled();
  });
  it("requires server-validated identity", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("revoked") });
    await expect(completeAuthCallback(new URL("https://app.test/auth/callback"))).rejects.toThrow(
      "auth_callback_no_user"
    );
  });
});
