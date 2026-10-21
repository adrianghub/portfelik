/** Browser wiring only: Cloudflare and Edge replies are controlled fixtures.
 * Actual Siteverify/Turnstile remains a staging gate. No Auth users are created.
 */
import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

type FixtureWindow = Window & {
  renderCount?: number;
  removedCount?: number;
  challenge: {
    sitekey: string;
    size: string;
    retry: string;
    "refresh-expired": string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  };
};

test.skip(!process.env.QUALITY_TURNSTILE_SITE_KEY, "Run with a configured test site key.");

test.beforeEach(async ({ page }) => {
  const headers = await readFile(new URL("../../static/_headers", import.meta.url), "utf8");
  const policy = headers
    .split("\n")
    .find((line) => line.includes("Content-Security-Policy:"))!
    .split("Content-Security-Policy:")[1]
    .trim()
    // Only the loopback Supabase origin differs from deployed HTTPS Supabase.
    .replace("connect-src 'self'", `connect-src 'self' ${process.env.QUALITY_SUPABASE_URL}`);
  await page.route("**/login", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": policy },
    });
  });
});

test("demo requires a fresh challenge after expiry and after a failed request", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const requests: { token: string; header: string | undefined }[] = [];
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js?*", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.turnstile = {
      render(element, options) { window.challenge = options; window.renderCount = (window.renderCount || 0) + 1; element.textContent = 'Challenge fixture'; const frame = document.createElement('iframe'); frame.src = 'https://challenges.cloudflare.com/fixture-widget'; element.appendChild(frame); return String(window.renderCount); },
      remove() { window.removedCount = (window.removedCount || 0) + 1; }
    };`,
    })
  );
  let frameRequests = 0;
  await page.route("https://challenges.cloudflare.com/fixture-widget", (route) => {
    frameRequests += 1;
    return route.fulfill({ contentType: "text/html", body: "Challenge frame fixture" });
  });
  await page.route("**/functions/v1/open-demo-account", async (route) => {
    requests.push({
      token: route.request().postDataJSON().turnstileToken,
      header: route.request().headers()["x-turnstile-token"],
    });
    await route.fulfill({ status: 503, json: { error: "demo_provision_disabled" } });
  });
  await page.goto("/login");
  const open = page.getByTestId("open-demo-account");
  await expect(open).toBeDisabled();
  await expect.poll(() => page.evaluate(() => (window as FixtureWindow).renderCount)).toBe(1);
  await expect.poll(() => frameRequests).toBe(1);
  expect(await page.evaluate(() => (window as FixtureWindow).challenge.sitekey)).toBe(
    process.env.QUALITY_TURNSTILE_SITE_KEY
  );
  expect(
    await page.evaluate(() => ({
      size: (window as FixtureWindow).challenge.size,
      retry: (window as FixtureWindow).challenge.retry,
      expiry: (window as FixtureWindow).challenge["refresh-expired"],
    }))
  ).toEqual({ size: "compact", retry: "never", expiry: "manual" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => (window as FixtureWindow).challenge.callback("expired-fixture"));
  await expect(open).toBeEnabled();
  await page.evaluate(() => (window as FixtureWindow).challenge["expired-callback"]());
  await expect(open).toBeDisabled();
  expect(requests).toHaveLength(0);

  expect(await page.evaluate(() => (window as FixtureWindow).renderCount)).toBe(1);
  await page.getByRole("button", { name: "Sprawdź ponownie" }).click();
  await expect.poll(() => page.evaluate(() => (window as FixtureWindow).renderCount)).toBe(2);
  await page.evaluate(() => (window as FixtureWindow).challenge.callback("error-fixture"));
  await expect(open).toBeEnabled();
  await page.evaluate(() => (window as FixtureWindow).challenge["error-callback"]());
  await expect(open).toBeDisabled();
  expect(requests).toHaveLength(0);

  await page.evaluate(() => (window as FixtureWindow).challenge.callback("first-fixture"));
  await open.click();
  await expect(page.getByRole("alert")).toContainText("chwilowo niedostępne");
  await expect.poll(() => page.evaluate(() => (window as FixtureWindow).renderCount)).toBe(3);
  await expect(open).toBeDisabled();
  expect(requests).toEqual([{ token: "first-fixture", header: "first-fixture" }]);
  expect(await page.evaluate(() => (window as FixtureWindow).removedCount)).toBe(2);

  await page.evaluate(() => (window as FixtureWindow).challenge.callback("second-fixture"));
  await open.click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toEqual({ token: "second-fixture", header: "second-fixture" });
});

test("failed challenge script blocks demo while password login remains usable", async ({
  page,
}) => {
  let provisionRequests = 0;
  await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js?*", (route) =>
    route.abort()
  );
  await page.route("**/functions/v1/open-demo-account", (route) => {
    provisionRequests += 1;
    return route.abort();
  });
  await page.goto("/login");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByTestId("open-demo-account")).toBeDisabled();
  await expect(page.locator("#email")).toBeEnabled();
  await expect(page.locator("#password")).toBeEnabled();
  expect(provisionRequests).toBe(0);
});
