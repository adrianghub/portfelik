import { Browser } from "@capacitor/browser";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { env } from "$env/dynamic/public";
import { normalizeLoginRedirect } from "$lib/auth-redirect";
import { isNativeCapacitor } from "$lib/services/pwa";
import { supabase } from "$lib/supabase";

/** Custom scheme used by the Capacitor Android shell (see AndroidManifest). */
export const NATIVE_OAUTH_CALLBACK = "pl.jakstoimy.app://auth/callback";

/**
 * OAuth redirect target for the web/browser flow. Native Google Sign-In uses
 * Credential Manager and never hits this URL.
 */
export function oauthCallbackUrl(postLoginTarget = "/"): string {
  if (isNativeCapacitor()) {
    const normalized = normalizeLoginRedirect(postLoginTarget);
    if (normalized === "/") return NATIVE_OAUTH_CALLBACK;
    return `${NATIVE_OAUTH_CALLBACK}?redirectTo=${encodeURIComponent(normalized)}`;
  }

  if (typeof window === "undefined" || !window.location?.origin) {
    return "https://app.jakstoimy.pl/auth/callback";
  }
  const origin = window.location.origin;
  const normalized = normalizeLoginRedirect(postLoginTarget);
  if (normalized === "/") return `${origin}/auth/callback`;
  return `${origin}/auth/callback?redirectTo=${encodeURIComponent(normalized)}`;
}

function urlSafeNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signInWithNativeGoogle(): Promise<{ error: Error | null }> {
  const webClientId = env.PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!webClientId) {
    console.error("native google sign-in: PUBLIC_GOOGLE_WEB_CLIENT_ID missing from the web build");
    return { error: new Error("google_web_client_id_missing") };
  }

  const rawNonce = urlSafeNonce();
  const nonceDigest = await sha256Hex(rawNonce);

  await SocialLogin.initialize({
    google: {
      webClientId,
      mode: "online",
    },
  });

  const login = await SocialLogin.login({
    provider: "google",
    options: {
      nonce: nonceDigest,
    },
  });

  if (login.provider !== "google" || login.result.responseType !== "online") {
    return { error: new Error("google_id_token_missing") };
  }

  const idToken = login.result.idToken;
  if (!idToken) {
    return { error: new Error("google_id_token_missing") };
  }

  const { error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
    nonce: rawNonce,
  });

  if (error) {
    console.error("native google sign-in: supabase rejected id token", error.message);
    return { error: new Error(error.message) };
  }

  return { error: null };
}

export async function signInWithGoogleOAuth(redirectTo: string): Promise<{ error: Error | null }> {
  if (isNativeCapacitor()) {
    try {
      return await signInWithNativeGoogle();
    } catch (nativeError) {
      const error = nativeError instanceof Error ? nativeError : new Error(String(nativeError));
      console.error("native google sign-in failed", error);
      return { error };
    }
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  return { error };
}

export async function closeOAuthBrowser(): Promise<void> {
  if (!isNativeCapacitor()) return;
  try {
    await Browser.close();
  } catch {
    // Already closed or unsupported.
  }
}
