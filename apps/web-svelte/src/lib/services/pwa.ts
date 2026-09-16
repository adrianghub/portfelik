/** Detect installed PWA / Add-to-Home-Screen standalone mode. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** True when running inside a Capacitor native shell (Android/iOS). */
export function isNativeCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  try {
    return cap?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** Installed experience: native shell or browser "Add to Home Screen". */
export function isInstalledClient(): boolean {
  return isNativeCapacitor() || isStandalonePwa();
}

export function isMobileUserAgent(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
}

export function isAndroid(): boolean {
  if (typeof navigator === "undefined") return false;
  return /android/i.test(navigator.userAgent);
}

/** On mobile browsers, push should prefer the installed PWA/native app over a tab subscription. */
export function shouldDeferBrowserPush(): boolean {
  return isMobileUserAgent() && !isInstalledClient();
}

/**
 * Web Push / VAPID is for browsers and installed PWAs. Android WebView does not
 * deliver OS banners this way — native stays on the in-app notification inbox.
 */
export function canUseWebPush(): boolean {
  if (typeof window === "undefined") return false;
  if (isNativeCapacitor()) return false;
  return "PushManager" in window && "serviceWorker" in navigator;
}

export const PWA_INSTALL_PROMPT_KEY = "pwa_install_prompted_at";

export function clearInstallPromptCooldown(): void {
  try {
    localStorage.removeItem(PWA_INSTALL_PROMPT_KEY);
  } catch {
    // best-effort
  }
}
