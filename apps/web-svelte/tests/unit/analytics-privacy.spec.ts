import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("$app/environment", () => ({ browser: true }));
vi.mock("$env/static/public", () => ({ PUBLIC_PLAUSIBLE_DOMAIN: "app.example" }));
import { analyticsPath, track } from "$lib/analytics";

afterEach(() => vi.unstubAllGlobals());
describe("analytics transport privacy", () => {
  it("sends a bounded route without tokens, IDs, query, hash or referrer", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("window", {
      location: {
        origin: "https://app.example",
        pathname: "/invite/private-bearer-token",
        search: "?group=private-id",
        hash: "#access_token=secret",
      },
    });
    track("web_vital", { metric: "LCP", value: 300 });
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://plausible.io/api/event");
    expect(JSON.parse(options.body)).toEqual({
      name: "web_vital",
      domain: "app.example",
      url: "https://app.example/invite",
      props: { metric: "LCP", value: "300" },
    });
    expect(options.referrerPolicy).toBe("no-referrer");
    expect(options.credentials).toBe("omit");
    expect(JSON.stringify(options)).not.toMatch(/private|secret|access_token/);
  });
  it("collapses plan IDs and rejects unknown paths", () => {
    expect(analyticsPath("/plans/user-specific-id/settle")).toBe("/plans");
    expect(analyticsPath("/unknown/private-user-name")).toBe("/");
  });
  it("does not propagate a telemetry outage", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.example", pathname: "/dashboard" },
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Offline")));
    expect(() => track("pageview")).not.toThrow();
    await Promise.resolve();
  });
});
