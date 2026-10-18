import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { goto } from "$app/navigation";
import { completeAuthCallback } from "$lib/auth/callback";
import { closeOAuthBrowser } from "$lib/services/oauth";
import { isNativeCapacitor } from "$lib/services/pwa";

function callbackUrlFromOpen(url: string): URL | null {
  try {
    // Custom scheme: pl.jakstoimy.app://auth/callback?...
    if (url.startsWith("pl.jakstoimy.app://")) {
      return new URL(url.replace("pl.jakstoimy.app://", "https://app.jakstoimy.pl/"));
    }
    const parsed = new URL(url);
    const trustedHost = [
      "app.jakstoimy.pl",
      "dev.portfelik.pages.dev",
      "localhost",
      "127.0.0.1",
    ].includes(parsed.hostname);
    if (
      !trustedHost ||
      parsed.username ||
      parsed.password ||
      !["https:", "http:"].includes(parsed.protocol)
    )
      return null;
    if (parsed.pathname === "/auth/callback" || parsed.pathname.startsWith("/invite/")) {
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

  let lastUrl: string | null = null;
  let lastOpenedAt = 0;
  const handle = async (event: URLOpenListenerEvent) => {
    if (event.url === lastUrl && Date.now() - lastOpenedAt < 1500) return;
    lastUrl = event.url;
    lastOpenedAt = Date.now();
    const callbackUrl = callbackUrlFromOpen(event.url);
    if (!callbackUrl) return;

    await closeOAuthBrowser();

    if (callbackUrl.pathname.startsWith("/invite/")) {
      await goto(`${callbackUrl.pathname}${callbackUrl.search}`, { replaceState: true });
      return;
    }

    try {
      const target = await completeAuthCallback(callbackUrl);
      await goto(target, { replaceState: true });
    } catch {
      await goto("/auth/callback?error=invalid_link", { replaceState: true });
    }
  };

  const listener = await App.addListener("appUrlOpen", (event) => {
    void handle(event);
  });

  const launch = await App.getLaunchUrl();
  if (launch?.url) void handle({ url: launch.url });

  return () => {
    void listener.remove();
  };
}
