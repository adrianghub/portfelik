import { Browser } from "@capacitor/browser";
import { normalizeLoginRedirect } from "$lib/auth-redirect";
import { isNativeCapacitor } from "$lib/services/pwa";
import { supabase } from "$lib/supabase";

/** Custom scheme used by the Capacitor Android shell (see AndroidManifest). */
export const NATIVE_OAUTH_CALLBACK = "pl.jakstoimy.app://auth/callback";

/**
 * OAuth redirect target. Web uses the current origin. Native uses a custom
 * scheme so Custom Tabs can return into the app without relying on App Links
 * verification (still configure HTTPS App Links for invite/email links).
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

export async function signInWithGoogleOAuth(redirectTo: string): Promise<{ error: Error | null }> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: isNativeCapacitor(),
    },
  });

  if (error) return { error };
  if (!isNativeCapacitor()) return { error: null };

  if (!data?.url) {
    return { error: new Error("oauth_url_missing") };
  }

  try {
    await Browser.open({ url: data.url, presentationStyle: "popover" });
    return { error: null };
  } catch (openError) {
    return {
      error: openError instanceof Error ? openError : new Error(String(openError)),
    };
  }
}

export async function closeOAuthBrowser(): Promise<void> {
  if (!isNativeCapacitor()) return;
  try {
    await Browser.close();
  } catch {
    // Already closed or unsupported.
  }
}
