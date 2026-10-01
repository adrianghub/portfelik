import { beforeEach, afterEach, expect, it, vi } from "vitest";
const { track, analyticsEnabled } = vi.hoisted(() => ({
  track: vi.fn(),
  analyticsEnabled: vi.fn(() => true),
}));
vi.mock("$lib/analytics", () => ({ track, analyticsEnabled }));
import { endpointClass, measuredFetch, reportVital } from "$lib/performance-monitoring";

beforeEach(() => {
  track.mockReset();
  analyticsEnabled.mockReturnValue(true);
  vi.spyOn(Math, "random").mockReturnValue(0);
});
afterEach(() => vi.restoreAllMocks());

it("reports CWV without attribution or private fields", () => {
  reportVital({ name: "CLS", value: 0.0123, rating: "good" });
  expect(track).toHaveBeenCalledWith("web_vital", {
    metric: "CLS",
    value: 12,
    unit: "thousandths",
    rating: "good",
  });
});
it("discards unsupported and nonfinite metrics", () => {
  reportVital({ name: "FCP", value: 100, rating: "good" });
  reportVital({ name: "LCP", value: NaN, rating: "good" });
  expect(track).not.toHaveBeenCalled();
});
it("does not retain URL identifiers, filters or auth tokens", async () => {
  const response = new Response("private financial data", { status: 200 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  const url = "https://example.test/rest/v1/transactions?user_id=private-id&amount=999.99";
  expect(await measuredFetch(url, { headers: { Authorization: "secret-token" } })).toBe(response);
  expect(track).toHaveBeenCalledWith(
    "api_timing",
    expect.objectContaining({ endpoint: "data", success: true })
  );
  expect(JSON.stringify(track.mock.calls)).not.toMatch(/private-id|999.99|secret-token|financial/);
  vi.unstubAllGlobals();
});
it("preserves a network failure even when telemetry fails", async () => {
  const failure = new TypeError("network failure");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(failure));
  track.mockImplementationOnce(() => {
    throw new Error("telemetry blocked");
  });
  await expect(measuredFetch("https://example.test/functions/v1/import")).rejects.toBe(failure);
  vi.unstubAllGlobals();
});
it("passes through requests when analytics is disabled", async () => {
  analyticsEnabled.mockReturnValue(false);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response()));
  await measuredFetch("https://example.test/auth/v1/user");
  expect(track).not.toHaveBeenCalled();
  expect(endpointClass(new Request("https://example.test/auth/v1/user"))).toBe("auth");
  vi.unstubAllGlobals();
});
