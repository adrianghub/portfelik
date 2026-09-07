import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { goto } from "$app/navigation";
import { consumeLoginRedirect } from "$lib/auth-redirect";
import { closeOAuthBrowser } from "$lib/services/oauth";
import { isNativeCapacitor } from "$lib/services/pwa";
import { supabase } from "$lib/supabase";

function callbackUrlFromOpen(url: string): URL | null {
  try {
    // Custom scheme: pl.jakstoimy.app://auth/callback?...
    if (url.startsWith("pl.jakstoimy.app://")) {
      return new URL(url.replace("pl.jakstoimy.app://", "https://app.jakstoimy.pl/"));
    }
    const parsed = new URL(url);
    if (parsed.pathname.includes("/auth/callback") || parsed.pathname.startsWith("/invite")) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Handle Android App Links / custom-scheme returns from Google OAuth or invites.
 * Safe to call once from the root layout onMount.
 */
export async function registerNativeAuthDeepLinkHandler(): Promise<() => void> {
  if (!isNativeCapacitor()) return () => {};

  const handle = async (event: URLOpenListenerEvent) => {
    const callbackUrl = callbackUrlFromOpen(event.url);
    if (!callbackUrl) return;

    await closeOAuthBrowser();

    if (callbackUrl.pathname.startsWith("/invite")) {
      await goto(`${callbackUrl.pathname}${callbackUrl.search}`, { replaceState: true });
      return;
    }

    const code = callbackUrl.searchParams.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        await goto("/login", { replaceState: true });
        return;
      }
      await goto(consumeLoginRedirect(callbackUrl), { replaceState: true });
      return;
    }

    await goto(`${callbackUrl.pathname}${callbackUrl.search}${callbackUrl.hash}`, {
      replaceState: true,
    });
  };

  const listener = await App.addListener("appUrlOpen", (event) => {
    void handle(event);
  });

  return () => {
    void listener.remove();
  };
}
