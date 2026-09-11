import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { supabase } from "$lib/supabase";
import {
  NATIVE_OAUTH_CALLBACK,
  oauthCallbackUrl,
  signInWithGoogleOAuth,
} from "$lib/services/oauth";

vi.mock("@capacitor/browser", () => ({
  Browser: { open: vi.fn(), close: vi.fn() },
}));
vi.mock("@capgo/capacitor-social-login", () => ({
  SocialLogin: { initialize: vi.fn(), login: vi.fn() },
}));
vi.mock("$env/dynamic/public", () => ({
  env: { PUBLIC_GOOGLE_WEB_CLIENT_ID: "web-client.apps.googleusercontent.com" },
}));
vi.mock("$lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: vi.fn(),
      signInWithIdToken: vi.fn(),
    },
  },
}));

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

describe("signInWithGoogleOAuth", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("uses browser OAuth on web", async () => {
    stubWindow(false);
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: "google", url: "https://accounts.google.com" },
      error: null,
    });

    const { error } = await signInWithGoogleOAuth("https://app.jakstoimy.pl/auth/callback");

    expect(error).toBeNull();
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledOnce();
    expect(SocialLogin.login).not.toHaveBeenCalled();
  });

  it("exchanges a native Google ID token with Supabase", async () => {
    stubWindow(true);
    vi.mocked(SocialLogin.initialize).mockResolvedValue(undefined);
    vi.mocked(SocialLogin.login).mockResolvedValue({
      provider: "google",
      result: {
        responseType: "online",
        idToken: "google-id-token",
        accessToken: null,
        profile: {
          email: "a@b.c",
          familyName: null,
          givenName: null,
          id: "1",
          name: null,
          imageUrl: null,
        },
      },
    });
    vi.mocked(supabase.auth.signInWithIdToken).mockResolvedValue({
      data: { user: { id: "user-1" }, session: { access_token: "token" } },
      error: null,
    } as never);

    const { error } = await signInWithGoogleOAuth(NATIVE_OAUTH_CALLBACK);

    expect(error).toBeNull();
    expect(SocialLogin.initialize).toHaveBeenCalledWith({
      google: { webClientId: "web-client.apps.googleusercontent.com", mode: "online" },
    });
    expect(SocialLogin.login).toHaveBeenCalledWith({
      provider: "google",
      options: { nonce: expect.any(String) },
    });
    expect(supabase.auth.signInWithIdToken).toHaveBeenCalledWith({
      provider: "google",
      token: "google-id-token",
      nonce: expect.any(String),
    });
    expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
});
