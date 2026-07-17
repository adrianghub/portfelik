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
    await expect(page.getByRole("dialog", { name: "Poznaj aplikację" })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole("button", { name: WELCOME_TOUR_SKIP_BUTTON }).click();
    await expect(page.getByRole("dialog", { name: "Poznaj aplikację" })).toBeHidden();
    await expect.poll(() => page.url()).toContain("/import");
  });

  test("opens glossary from settings", async ({ page }) => {
    await page.goto("/settings?tab=profile");
    await page.getByRole("button", { name: "Słownik pojęć" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Import bankowy" })).toBeVisible();
  });

  test("loads demo from settings on empty ledger", async ({ page }) => {
    await page.goto("/settings?tab=profile");
    await page.getByRole("button", { name: "Załaduj przykład", exact: true }).click();
    await expect(page.getByText("Załadowano dane przykładowe.")).toBeVisible();
  });
});
