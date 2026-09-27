/** Stack of close handlers for sheets, dialogs, and other native-back overlays. */

export type NativeBackPageHandler = () => boolean;

const overlayClosers: Array<() => void> = [];
let pageHandler: NativeBackPageHandler | null = null;
let chromeHides = 0;
let fabHolds = 0;

/** Extra page padding while a mobile plus button is on screen. */
export function holdMobileFabClearance(): () => void {
  if (typeof document === "undefined") return () => {};
  fabHolds += 1;
  document.documentElement.classList.add("mobile-fab-present");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    fabHolds = Math.max(0, fabHolds - 1);
    if (fabHolds === 0) {
      document.documentElement.classList.remove("mobile-fab-present");
    }
  };
}

/** Hide the mobile bottom nav while a full-screen overlay is open. */
export function hideMobileChrome(): () => void {
  if (typeof document === "undefined") return () => {};
  chromeHides += 1;
  document.documentElement.classList.add("mobile-overlay-open");
  let released = false;
  return () => {
    if (released) return;
    released = true;
    chromeHides = Math.max(0, chromeHides - 1);
    if (chromeHides === 0) {
      document.documentElement.classList.remove("mobile-overlay-open");
    }
  };
}

export function registerNativeOverlayCloser(close: () => void): () => void {
  overlayClosers.push(close);
  return () => {
    const index = overlayClosers.lastIndexOf(close);
    if (index >= 0) overlayClosers.splice(index, 1);
  };
}

export function closeTopNativeOverlay(): boolean {
  const close = overlayClosers.pop();
  if (!close) return false;
  close();
  return true;
}

export function nativeOverlayCount(): number {
  return overlayClosers.length;
}

export function registerNativeBackPageHandler(handler: NativeBackPageHandler): () => void {
  pageHandler = handler;
  return () => {
    if (pageHandler === handler) pageHandler = null;
  };
}

export function runNativeBackPageHandler(): boolean {
  return pageHandler?.() === true;
}

/** Test-only: drop leftover overlays without invoking them. */
export function resetNativeBackStateForTests(): void {
  overlayClosers.length = 0;
  pageHandler = null;
  chromeHides = 0;
  fabHolds = 0;
  if (typeof document !== "undefined") {
    document.documentElement.classList.remove("mobile-overlay-open");
    document.documentElement.classList.remove("mobile-fab-present");
  }
}
