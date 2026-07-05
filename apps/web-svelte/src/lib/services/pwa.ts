/** Detect installed PWA / Add-to-Home-Screen standalone mode. */
export function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
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

/** On mobile browsers, push should prefer the installed PWA over a tab subscription. */
export function shouldDeferBrowserPush(): boolean {
  return isMobileUserAgent() && !isStandalonePwa();
}

export const PWA_INSTALL_PROMPT_KEY = "pwa_install_prompted_at";

export function clearInstallPromptCooldown(): void {
  try {
    localStorage.removeItem(PWA_INSTALL_PROMPT_KEY);
  } catch {
    // best-effort
  }
}
