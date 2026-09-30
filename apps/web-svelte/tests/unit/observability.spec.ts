import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { track } = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock("$lib/analytics", () => ({ track }));

import { reportError, installGlobalErrorReporting } from "$lib/observability";

describe("privacy-safe error reporting", () => {
  beforeEach(() => {
    track.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  it("reports database codes without descriptions or financial values", () => {
    reportError({ code: "42501", message: "account 12 345 678 and amount 999.99" }, "mutation");

    expect(track).toHaveBeenCalledWith("mutation_failure", {
      context: "mutation",
      code: "42501",
    });
    expect(JSON.stringify(track.mock.calls)).not.toContain("12 345 678");
    expect(JSON.stringify(track.mock.calls)).not.toContain("999.99");
  });

  it("uses the error class when no database code exists", () => {
    reportError(new TypeError("private message"), "parser");
    expect(track).toHaveBeenCalledWith("parser_failure", {
      context: "parser",
      code: "TypeError",
    });
  });

  it("installs and tears down global window listeners", () => {
    const testWindow = new EventTarget();
    vi.stubGlobal("window", testWindow);
    const teardown = installGlobalErrorReporting();
    const errorEvent = new Event("error") as Event & { error: Error };
    errorEvent.error = new Error("boom");
    testWindow.dispatchEvent(errorEvent);
    expect(track).toHaveBeenCalledWith("client_error", {
      context: "global",
      code: "Error",
    });
    teardown();
    track.mockReset();
    const afterEvent = new Event("error") as Event & { error: Error };
    afterEvent.error = new Error("after");
    testWindow.dispatchEvent(afterEvent);
    expect(track).not.toHaveBeenCalled();
  });
});
