import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseWebPush,
  isInstalledClient,
  isNativeCapacitor,
  shouldDeferBrowserPush,
} from "$lib/services/pwa";

function stubWindow(capacitor?: { isNativePlatform: () => boolean }) {
  const win = {
    Capacitor: capacitor,
    matchMedia: () => ({ matches: false }),
  };
  vi.stubGlobal("window", win);
  return win;
}

describe("pwa native detection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects Capacitor native platform", () => {
    stubWindow({ isNativePlatform: () => true });
    expect(isNativeCapacitor()).toBe(true);
    expect(isInstalledClient()).toBe(true);
  });

  it("does not defer push inside native shell", () => {
    stubWindow({ isNativePlatform: () => true });
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile",
    });
    expect(shouldDeferBrowserPush()).toBe(false);
  });

  it("does not offer Web Push inside the native WebView", () => {
    stubWindow({ isNativePlatform: () => true });
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Linux; Android 14) Mobile",
      serviceWorker: {},
    });
    vi.stubGlobal("PushManager", function PushManager() {});
    expect(canUseWebPush()).toBe(false);
  });
});
