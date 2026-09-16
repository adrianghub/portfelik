/** Stack of close handlers for sheets, dialogs, and other native-back overlays. */

export type NativeBackPageHandler = () => boolean;

const overlayClosers: Array<() => void> = [];
let pageHandler: NativeBackPageHandler | null = null;

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
}
