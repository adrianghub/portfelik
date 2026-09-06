import { expect, test } from "@playwright/test";
import {
  MOCK_CATEGORIES,
  MOCK_PROFILE,
  MOCK_PROFILE_FRESH_TOUR,
  WELCOME_TOUR_SKIP_BUTTON,
} from "../helpers/fixtures";
import { fulfillSupabaseJson, injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

test.describe("onboarding hardening", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("onboarding-dismissed");
      localStorage.removeItem("guided-tour-progress");
    });
    await injectFakeSession(page);
    await mockSupabaseAPI(page);

    await page.route("**/rest/v1/transactions_with_category**", (route) =>
      route.fulfill({ status: 200, json: [] })
    );

    await page.route("**/rest/v1/transactions**", async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      if (method === "GET" || method === "HEAD") {
        if (url.includes("description=like")) {
          return route.fulfill({ status: 200, json: [] });
        }
        return route.fulfill({
          status: 200,
          headers: { "content-range": "0-0/0" },
          json: [],
        });
      }
      if (method === "POST") {
        return route.fulfill({ status: 201, json: { id: "demo-tx-1" } });
      }
      return route.fulfill({ status: 200, json: [] });
    });

    await page.route("**/rest/v1/plans**", async (route) => {
      const method = route.request().method();
      if (method === "GET") return route.fulfill({ status: 200, json: [] });
      if (method === "POST") {
        return route.fulfill({
          status: 201,
          json: {
            id: "demo-plan-1",
            name: "Demo: Wakacje",
            kind: "save",
            start_date: "2026-01-01",
            end_date: "2026-12-31",
            user_id: "00000000-0000-0000-0000-000000000001",
            status: "active",
          },
        });
      }
      return route.fulfill({ status: 200, json: [] });
    });

    await page.route("**/rest/v1/categories**", (route) =>
      route.fulfill({ status: 200, json: MOCK_CATEGORIES })
    );

    await page.route("**/rest/v1/plan_debt_terms**", (route) =>
      route.fulfill({ status: 201, json: { plan_id: "demo-plan-1" } })
    );

    await page.route("**/rest/v1/import_sessions**", (route) =>
      route.fulfill({ status: 200, json: [] })
    );

    await page.route("**/rest/v1/financial_snapshots**", (route) =>
      route.fulfill({ status: 200, json: [] })
    );

    await page.route("**/rest/v1/profiles**", async (route) => {
      if (route.request().method() === "PATCH") {
        return fulfillSupabaseJson(route, MOCK_PROFILE);
      }
      return fulfillSupabaseJson(route, MOCK_PROFILE);
    });
  });

  test("shows guided tour welcome on dashboard", async ({ page }) => {
    await page.route("**/rest/v1/profiles**", async (route) => {
      if (route.request().method() === "PATCH") {
        return fulfillSupabaseJson(route, MOCK_PROFILE_FRESH_TOUR);
      }
      return fulfillSupabaseJson(route, MOCK_PROFILE_FRESH_TOUR);
    });
    await page.goto("/dashboard");
    const welcome = page.getByRole("dialog", {
      name: "Zobacz, jak pieniądze dostają kierunek",
    });
    await expect(welcome).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: WELCOME_TOUR_SKIP_BUTTON }).click();
    await expect(welcome).toBeHidden();
    await expect.poll(() => page.url()).toContain("/import");
  });

  test("mobile tour keeps manual scroll and advances across routes", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route("**/rest/v1/profiles**", async (route) => {
      if (route.request().method() === "PATCH") {
        return fulfillSupabaseJson(route, MOCK_PROFILE_FRESH_TOUR);
      }
      return fulfillSupabaseJson(route, MOCK_PROFILE_FRESH_TOUR);
    });

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Uruchom przykładowy miesiąc" }).click();

    const tour = page.locator("[data-guided-tour-chrome]");
    await expect(tour).toContainText("1 z 8", { timeout: 15_000 });
    await page.waitForTimeout(800);
    const before = await page.evaluate(() => window.scrollY);
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before);

    await tour.getByRole("button", { name: "Dalej" }).click();
    await expect(tour).toContainText("2 z 8");
    await tour.getByRole("button", { name: "Dalej" }).click();
    await expect(tour).toContainText("3 z 8");
    await tour.getByRole("button", { name: "Dalej" }).click();
    await expect(page).toHaveURL("/transactions", { timeout: 10_000 });
    await expect(tour).toContainText("4 z 8");
  });

  test("opens glossary from settings", async ({ page }) => {
    await page.goto("/settings?tab=profile");
    await page.getByRole("button", { name: "Słownik pojęć" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Import bankowy" })).toBeVisible();
  });

  test("loads demo from settings on empty ledger", async ({ page }) => {
    await page.goto("/settings?tab=profile");
    await page.getByRole("button", { name: "Wczytaj przykładowy miesiąc" }).click();
    await expect(page.getByText("Przykładowy miesiąc jest gotowy.")).toBeVisible();
  });
});
