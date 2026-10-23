import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DemoTurnstile from "$lib/components/demo/DemoTurnstile.svelte";

const browser = window as Window & {
  turnstile?: { render: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
};
const findScript = () => document.querySelector<HTMLScriptElement>("script[data-demo-turnstile]");
async function pendingScript(): Promise<HTMLScriptElement> {
  await waitFor(() => expect(findScript()).not.toBeNull());
  return findScript()!;
}
function mount(onError = vi.fn()) {
  return render(DemoTurnstile, { siteKey: "test-site-key", onToken: vi.fn(), onError });
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
});
afterEach(() => {
  cleanup();
  document.querySelectorAll("script[data-demo-turnstile]").forEach((script) => script.remove());
  delete browser.turnstile;
  vi.unstubAllGlobals();
});

describe("Turnstile script recovery across SPA navigation", () => {
  it.each(["error", "load"])("reloads after %s without an available API", async (event) => {
    const onError = vi.fn();
    const first = mount(onError);
    const failed = await pendingScript();
    await fireEvent(failed, new Event(event));
    expect(onError).toHaveBeenCalledOnce();
    expect(failed.isConnected).toBe(false);
    expect(screen.getByRole("button", { name: "Sprawdź ponownie" })).toBeTruthy();
    first.unmount();

    mount();
    const fresh = await pendingScript();
    expect(fresh).not.toBe(failed);
    browser.turnstile = { render: vi.fn().mockReturnValue("fresh-widget"), remove: vi.fn() };
    await fireEvent.load(fresh);
    expect(browser.turnstile.render).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Sprawdź ponownie" })).toBeNull();
  });

  it("removes an abandoned loading script before navigation back", async () => {
    const onError = vi.fn();
    const first = mount(onError);
    const abandoned = await pendingScript();
    first.unmount();
    expect(abandoned.isConnected).toBe(false);
    await fireEvent.error(abandoned);
    expect(onError).not.toHaveBeenCalled();
    mount();
    expect(await pendingScript()).not.toBe(abandoned);
  });

  it("replaces a stale tag that has no pending load event", async () => {
    const stale = document.createElement("script");
    stale.dataset.demoTurnstile = "true";
    document.head.appendChild(stale);
    mount();
    await waitFor(() => expect(stale.isConnected).toBe(false));
    expect(await pendingScript()).not.toBe(stale);
  });

  it("retries a failed download in the same mounted screen", async () => {
    mount();
    const failed = await pendingScript();
    await fireEvent.error(failed);
    await fireEvent.click(screen.getByRole("button", { name: "Sprawdź ponownie" }));
    expect(await pendingScript()).not.toBe(failed);
  });
});
