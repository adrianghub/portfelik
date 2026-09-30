import { expect, test, type Page } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

async function dismissPushBanner(page: Page) {
  const banner = page.getByTestId("push-notification-banner");
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: "Zamknij", exact: true }).click();
  await expect(banner).toHaveCount(0);
}

test.describe("mobile visual regression", () => {
  test.use({ viewport: { width: 375, height: 812 }, colorScheme: "dark" });

  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-30T10:00:00.000Z"));
    await injectFakeSession(page);
    await page.addInitScript(() => {
      localStorage.removeItem("push_prompted_at");
      Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        value:
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      });
      Object.defineProperty(window, "Notification", {
        configurable: true,
        value: { permission: "default", requestPermission: async () => "default" },
      });
      if (!("PushManager" in window)) {
        Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
      }
      Object.defineProperty(navigator, "serviceWorker", {
        configurable: true,
        value: {
          register: async () => null,
          addEventListener: () => {},
          removeEventListener: () => {},
        },
      });
    });
    await mockSupabaseAPI(page);
  });

  test("Kokpit", async ({ page }) => {
    await page.goto("/dashboard");
    await dismissPushBanner(page);
    await expect(page.getByText(/Hej/).first()).toBeVisible();
    await expect(page).toHaveScreenshot("dashboard-mobile.png");
  });

  test("Transakcje and open action menu", async ({ page }) => {
    await page.goto("/transactions");
    await dismissPushBanner(page);
    await expect(page.getByRole("heading", { name: "Transakcje" })).toBeVisible();
    await page.getByRole("button", { name: "Więcej akcji" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page).toHaveScreenshot("transactions-menu-mobile.png");
  });

  test("transaction filters sheet", async ({ page }) => {
    await page.goto("/transactions");
    await dismissPushBanner(page);
    await page.getByRole("button", { name: /^filtry/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page).toHaveScreenshot("transactions-filters-mobile.png");
  });

  test("Plany", async ({ page }) => {
    await page.goto("/plans");
    await dismissPushBanner(page);
    await expect(page.getByRole("heading", { name: /plany/i })).toBeVisible();
    await expect(page).toHaveScreenshot("plans-mobile.png");
  });

  test("Ustawienia with push prompt", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByTestId("push-notification-banner")).toBeVisible();
    await expect(page).toHaveScreenshot("settings-push-banner-mobile.png");
  });
});
