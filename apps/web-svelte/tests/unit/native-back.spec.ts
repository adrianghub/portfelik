import { afterEach, describe, expect, it, vi } from "vitest";
import { nativeBackDestination } from "$lib/services/native-back-policy";
import {
  closeTopNativeOverlay,
  holdMobileFabClearance,
  nativeOverlayCount,
  registerNativeBackPageHandler,
  registerNativeOverlayCloser,
  resetNativeBackStateForTests,
  runNativeBackPageHandler,
} from "$lib/services/native-overlay";

describe("nativeBackDestination", () => {
  it("minimizes on root tabs instead of hopping between them", () => {
    expect(nativeBackDestination("/dashboard")).toEqual({ kind: "minimize" });
    expect(nativeBackDestination("/transactions")).toEqual({ kind: "minimize" });
    expect(nativeBackDestination("/plans")).toEqual({ kind: "minimize" });
    expect(nativeBackDestination("/settings")).toEqual({ kind: "minimize" });
  });

  it("returns settings landing from a settings tab", () => {
    expect(nativeBackDestination("/settings", "?tab=rules")).toEqual({
      kind: "goto",
      href: "/settings",
    });
  });

  it("walks settle → plan → hub while keeping scope query", () => {
    expect(nativeBackDestination("/plans/abc/settle", "?group=own")).toEqual({
      kind: "goto",
      href: "/plans/abc?group=own",
    });
    expect(nativeBackDestination("/plans/abc", "?group=own")).toEqual({
      kind: "goto",
      href: "/plans?group=own",
    });
  });

  it("treats import as nested under transactions", () => {
    expect(nativeBackDestination("/import")).toEqual({
      kind: "goto",
      href: "/transactions",
    });
  });
});

describe("native overlay stack", () => {
  afterEach(() => {
    resetNativeBackStateForTests();
  });

  it("closes the most recently registered overlay first", () => {
    const closed: string[] = [];
    registerNativeOverlayCloser(() => closed.push("a"));
    registerNativeOverlayCloser(() => closed.push("b"));

    expect(nativeOverlayCount()).toBe(2);
    expect(closeTopNativeOverlay()).toBe(true);
    expect(closed).toEqual(["b"]);
    expect(nativeOverlayCount()).toBe(1);
    expect(closeTopNativeOverlay()).toBe(true);
    expect(closed).toEqual(["b", "a"]);
    expect(nativeOverlayCount()).toBe(0);
    expect(closeTopNativeOverlay()).toBe(false);
  });

  it("does not retrigger a closer after it has been popped", () => {
    let calls = 0;
    registerNativeOverlayCloser(() => {
      calls += 1;
    });
    expect(closeTopNativeOverlay()).toBe(true);
    expect(closeTopNativeOverlay()).toBe(false);
    expect(calls).toBe(1);
  });

  it("lets a page handler consume back before routing", () => {
    const remove = registerNativeBackPageHandler(() => true);
    expect(runNativeBackPageHandler()).toBe(true);
    remove();
    expect(runNativeBackPageHandler()).toBe(false);
  });

  it("pads the page while a mobile plus button is mounted", () => {
    const classes = new Set<string>();
    vi.stubGlobal("document", {
      documentElement: {
        classList: {
          add: (name: string) => classes.add(name),
          remove: (name: string) => classes.delete(name),
        },
      },
    });
    const release = holdMobileFabClearance();
    expect(classes.has("mobile-fab-present")).toBe(true);
    release();
    expect(classes.has("mobile-fab-present")).toBe(false);
    vi.unstubAllGlobals();
  });

  it("keeps a page handler unused while an overlay is open", () => {
    let pageRan = false;
    const remove = registerNativeBackPageHandler(() => {
      pageRan = true;
      return true;
    });
    registerNativeOverlayCloser(() => {});
    expect(closeTopNativeOverlay()).toBe(true);
    expect(pageRan).toBe(false);
    expect(runNativeBackPageHandler()).toBe(true);
    remove();
  });
});
