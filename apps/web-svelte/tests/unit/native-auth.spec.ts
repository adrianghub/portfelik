import { beforeEach, describe, expect, it, vi } from "vitest";
const { app, goto, completeAuthCallback, closeOAuthBrowser, isNativeCapacitor } = vi.hoisted(
  () => ({
    app: { addListener: vi.fn(), getLaunchUrl: vi.fn() },
    goto: vi.fn(),
    completeAuthCallback: vi.fn(),
    closeOAuthBrowser: vi.fn(),
    isNativeCapacitor: vi.fn(),
  })
);
vi.mock("@capacitor/app", () => ({ App: app }));
vi.mock("$app/navigation", () => ({ goto }));
vi.mock("$lib/auth/callback", () => ({ completeAuthCallback }));
vi.mock("$lib/services/oauth", () => ({ closeOAuthBrowser }));
vi.mock("$lib/services/pwa", () => ({ isNativeCapacitor }));
import { registerNativeAuthDeepLinkHandler } from "$lib/services/native-auth";

beforeEach(() => {
  vi.resetAllMocks();
  isNativeCapacitor.mockReturnValue(true);
  app.addListener.mockResolvedValue({ remove: vi.fn() });
  app.getLaunchUrl.mockResolvedValue(undefined);
  completeAuthCallback.mockResolvedValue("/auth/setup?mode=recovery");
});

describe("Android authentication deep links", () => {
  it("consumes a cold-start password recovery link through the shared callback", async () => {
    app.getLaunchUrl.mockResolvedValue({
      url: "pl.jakstoimy.app://auth/callback#access_token=a&refresh_token=r&type=recovery",
    });
    await registerNativeAuthDeepLinkHandler();
    await vi.waitFor(() =>
      expect(goto).toHaveBeenCalledWith("/auth/setup?mode=recovery", { replaceState: true })
    );
    expect(completeAuthCallback.mock.calls[0][0].hash).toContain("type=recovery");
  });
  it("handles a warm-start invitation without accepting membership", async () => {
    await registerNativeAuthDeepLinkHandler();
    const handle = app.addListener.mock.calls[0][1];
    handle({ url: "https://app.jakstoimy.pl/invite/token" });
    await vi.waitFor(() =>
      expect(goto).toHaveBeenCalledWith("/invite/token", { replaceState: true })
    );
    expect(completeAuthCallback).not.toHaveBeenCalled();
  });
  it("shows a callback error on expired credentials instead of leaving a stale session", async () => {
    completeAuthCallback.mockRejectedValue(new Error("expired"));
    await registerNativeAuthDeepLinkHandler();
    app.addListener.mock.calls[0][1]({ url: "pl.jakstoimy.app://auth/callback?code=expired" });
    await vi.waitFor(() =>
      expect(goto).toHaveBeenCalledWith("/auth/callback?error=invalid_link", { replaceState: true })
    );
  });
  it("ignores duplicate launch events and rejects foreign callback origins", async () => {
    await registerNativeAuthDeepLinkHandler();
    const handle = app.addListener.mock.calls[0][1];
    handle({ url: "https://foreign.test/auth/callback?code=bad" });
    const event = { url: "pl.jakstoimy.app://auth/callback?code=once" };
    handle(event);
    handle(event);
    await vi.waitFor(() => expect(goto).toHaveBeenCalledTimes(1));
    expect(completeAuthCallback).toHaveBeenCalledTimes(1);
  });
  it("does not install native listeners in a web browser", async () => {
    isNativeCapacitor.mockReturnValue(false);
    await registerNativeAuthDeepLinkHandler();
    expect(app.addListener).not.toHaveBeenCalled();
  });
});
