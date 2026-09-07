import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/browser", () => ({
  Browser: { open: vi.fn(), close: vi.fn() },
}));

import { NATIVE_OAUTH_CALLBACK, oauthCallbackUrl } from "$lib/services/oauth";

function stubWindow(native: boolean) {
  vi.stubGlobal("window", {
    Capacitor: { isNativePlatform: () => native },
    location: { origin: "https://app.jakstoimy.pl" },
  });
}

describe("oauthCallbackUrl", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the current origin on web", () => {
    stubWindow(false);
    expect(oauthCallbackUrl("/plans")).toBe(
      "https://app.jakstoimy.pl/auth/callback?redirectTo=%2Fplans"
    );
  });

  it("uses the native custom scheme inside Capacitor", () => {
    stubWindow(true);
    expect(oauthCallbackUrl("/")).toBe(NATIVE_OAUTH_CALLBACK);
    expect(oauthCallbackUrl("/invite/abc")).toBe(
      `${NATIVE_OAUTH_CALLBACK}?redirectTo=${encodeURIComponent("/invite/abc")}`
    );
  });
});
