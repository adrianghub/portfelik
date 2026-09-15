import { afterEach, describe, expect, it } from "vitest";
import { nativeBackDestination } from "$lib/services/native-back-policy";
import {
  closeTopNativeOverlay,
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
    const removeA = registerNativeOverlayCloser(() => closed.push("a"));
    const removeB = registerNativeOverlayCloser(() => closed.push("b"));

    expect(nativeOverlayCount()).toBe(2);
    expect(closeTopNativeOverlay()).toBe(true);
    expect(closed).toEqual(["b"]);
    removeB();
    expect(closeTopNativeOverlay()).toBe(true);
    expect(closed).toEqual(["b", "a"]);
    removeA();
    expect(closeTopNativeOverlay()).toBe(false);
  });

  it("lets a page handler consume back before routing", () => {
    const remove = registerNativeBackPageHandler(() => true);
    expect(runNativeBackPageHandler()).toBe(true);
    remove();
    expect(runNativeBackPageHandler()).toBe(false);
  });
});
