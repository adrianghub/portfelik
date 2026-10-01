import { expect, test, type Page } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

async function dismissPushBanner(page: Page) {
  const banner = page.getByTestId("push-notification-banner");
  await expect(banner).toBeVisible({ timeout: 20000 });
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
    await expect(page.getByTestId("push-notification-banner")).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveScreenshot("settings-push-banner-mobile.png");
  });
});

// Cover the desktop layout separately: table actions and wide balance cards do
// not share the mobile layout. Keep bank dates fixed independently of run date.
test.describe("desktop visual regression", () => {
  test.use({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-30T10:00:00.000Z"));
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
    await page.addInitScript(() => localStorage.setItem("push_prompted_at", String(Date.now())));
    await page.route("**/rest/v1/cash_positions**", (route) =>
      route.fulfill({
        json: {
          owner_id: "00000000-0000-0000-0000-000000000001",
          group_id: null,
          opening_amount: 2635.81,
          as_of_date: "2026-09-01",
        },
      })
    );
    await page.route("**/rest/v1/transactions_with_category**", (route) =>
      route.fulfill({
        json: [
          {
            id: "visual-overdue",
            user_id: "00000000-0000-0000-0000-000000000001",
            group_id: null,
            amount: 35,
            currency: "PLN",
            type: "expense",
            status: "overdue",
            date: "2026-09-13",
            description: "Orange Flex",
            counterparty: "Orange",
            category_id: "cat-1",
            category_name: "Jedzenie",
            is_recurring: false,
          },
          {
            id: "visual-upcoming",
            user_id: "00000000-0000-0000-0000-000000000001",
            group_id: null,
            amount: 200,
            currency: "PLN",
            type: "expense",
            status: "upcoming",
            date: "2026-10-07",
            description: "Terapia",
            category_id: "cat-1",
            category_name: "Jedzenie",
            is_recurring: false,
          },
        ],
      })
    );
  });
  test("balance with explanation and calculation", async ({ page }) => {
    await page.goto("/dashboard");
    const card = page.getByTestId("dashboard-cash-position");
    await expect(card).toContainText("2 635,81 zł");
    await card.getByText("Jak obliczamy saldo i prognozę?", { exact: true }).click();
    await expect(card).toContainText("Nie jest to saldo pobrane z banku");
    await expect(page).toHaveScreenshot("dashboard-desktop.png");
  });
  test("transaction desktop action stays on one line", async ({ page }) => {
    await page.goto("/transactions");
    const action = page
      .locator("table")
      .getByRole("button", { name: "Oznacz jako opłacone", exact: true })
      .first();
    await expect(action).toBeVisible();
    expect(await action.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("nowrap");
    await expect(page).toHaveScreenshot("transactions-desktop.png");
  });
  for (const [name, path] of [
    ["plans-desktop", "/plans"],
    ["debt-plan-desktop", "/plans/plan-debt-1"],
    ["save-plan-desktop", "/plans/plan-save-1"],
    ["settings-desktop", "/settings"],
    ["privacy-desktop", "/settings?tab=privacy"],
  ]) {
    test(name, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.getByRole("main")).toBeVisible();
      await expect(page).toHaveScreenshot(`${name}.png`);
    });
  }
  test("empty transactions", async ({ page }) => {
    await page.route("**/rest/v1/transactions_with_category**", (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto("/transactions");
    await expect(page.getByRole("main")).toContainText("Brak transakcji");
    await expect(page).toHaveScreenshot("transactions-empty-desktop.png");
  });
  test("empty plans", async ({ page }) => {
    await page.route("**/rest/v1/plans**", (route) => route.fulfill({ json: [] }));
    await page.goto("/plans");
    await expect(page.getByRole("main")).toContainText("Brak planów");
    await expect(page).toHaveScreenshot("plans-empty-desktop.png");
  });
  test("mobile balance sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/transactions?group=own");
    await page.getByRole("button", { name: "Zmień saldo początkowe", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Saldo z transakcji" })).toBeVisible();
    await expect(page).toHaveScreenshot("cash-sheet-mobile.png");
  });
  test("transaction error", async ({ page }) => {
    await page.route("**/rest/v1/transactions_with_category**", (route) =>
      route.fulfill({ status: 500, json: { message: "Unavailable" } })
    );
    await page.goto("/transactions");
    await expect(page.getByRole("button", { name: "Spróbuj ponownie" }).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(page).toHaveScreenshot("transactions-error-desktop.png");
  });
});
