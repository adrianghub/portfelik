import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";
import { MOCK_PROFILE } from "../helpers/fixtures";

const screens = [
  "/dashboard",
  "/transactions",
  "/import",
  "/plans",
  "/plans/plan-save-1",
  "/plans/plan-debt-1",
  "/plans/plan-save-1/settle",
  "/settings",
  ...[
    "profile",
    "notifications",
    "categories",
    "rules",
    "groups",
    "personalization",
    "help",
    "privacy",
  ].map((tab) => `/settings?tab=${tab}`),
  "/privacy",
  "/changelog",
];

async function layoutCheck(page: Page) {
  await expect(page.getByRole("main")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
    .toBeLessThanOrEqual(1);
}

async function accessibilityCheck(page: Page, scope?: string) {
  const builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]);
  if (scope) builder.include(scope);
  const results = await builder.analyze();
  await test.info().attach("accessibility", {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });
  expect(results.violations).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.addInitScript(() => localStorage.setItem("push_prompted_at", String(Date.now())));
});

for (const path of screens) {
  test(`screen ${path}: layout, dark theme, accessibility`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await layoutCheck(page);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await accessibilityCheck(page);
    expect(errors).toEqual([]);
  });
}

test("search dialog traps focus and restores it", async ({ page }) => {
  await page.goto("/transactions");
  const trigger = page.getByRole("button", { name: "Szukaj transakcji", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Szukaj transakcji" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("textbox")).toBeFocused();
  await accessibilityCheck(page, '[role="dialog"]');
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("system light preference keeps the supported dark theme usable", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/dashboard");
  await layoutCheck(page);
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("all six accent presets retain readable controls", async ({ page }) => {
  for (const accent of ["green", "blue", "amber", "pink", "purple", "orange"]) {
    await page.route("**/rest/v1/profiles**", (route) =>
      route.fulfill({
        status: 200,
        json: { ...MOCK_PROFILE, settings: { ...MOCK_PROFILE.settings, accentColor: accent } },
      })
    );
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");
    await layoutCheck(page);
    await accessibilityCheck(page);
    await page.unroute("**/rest/v1/profiles**");
  }
});
