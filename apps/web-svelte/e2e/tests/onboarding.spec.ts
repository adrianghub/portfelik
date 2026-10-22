import { expect, test } from "@playwright/test";
import {
  MOCK_CATEGORIES,
  MOCK_PROFILE,
  MOCK_PROFILE_FRESH_TOUR,
  MOCK_USER,
  WELCOME_TOUR_SKIP_BUTTON,
} from "../helpers/fixtures";
import {
  fulfillSupabaseJson,
  mockSupabaseAPI,
  stubServiceWorkerForTests,
} from "../helpers/mock-auth";

async function mockLegacyExample(page: import("@playwright/test").Page) {
  let present = true;
  await page.route("**/rest/v1/transactions**", (route) =>
    route.fulfill({
      headers: { "content-range": present ? "*/1" : "*/0" },
      json: present ? [{ id: "legacy-demo-tx", description: "Pensja", is_demo: true }] : [],
    })
  );
  await page.route("**/rest/v1/rpc/clear_demo_data**", (route) => {
    present = false;
    return route.fulfill({ json: { deleted: 1 } });
  });
}

test.describe("onboarding hardening", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem("onboarding-dismissed");
      localStorage.removeItem("guided-tour-progress");
    });
    await page.addInitScript((user) => {
      if (sessionStorage.getItem("onboarding-session-injected")) return;
      sessionStorage.setItem("onboarding-session-injected", "1");
      localStorage.setItem(
        "sb-emqzcygfwcvbmhxhfkcc-auth-token",
        JSON.stringify({
          access_token: "fake-access-token",
          refresh_token: "fake-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user,
        })
      );
      localStorage.setItem("guided-tour-progress", JSON.stringify({ dismissed: true }));
    }, MOCK_USER);
    await stubServiceWorkerForTests(page);
    await mockSupabaseAPI(page);

    let demoSeeded = false;

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
        if (demoSeeded) {
          const rows = [{ id: "demo-tx-1", description: "Demo: Pensja", is_demo: true }];
          return route.fulfill({
            status: 200,
            headers: { "content-range": `*/${rows.length}`, "content-type": "application/json" },
            json: rows,
          });
        }
        return route.fulfill({
          status: 200,
          headers: { "content-range": "*/0", "content-type": "application/json" },
          json: [],
        });
      }
      if (method === "POST") {
        demoSeeded = true;
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

    await page.route("**/rest/v1/rpc/clear_demo_data**", (route) => {
      demoSeeded = false;
      return route.fulfill({
        status: 200,
        json: { deleted: 3, plans: 1, transactions: 1, net_worth_items: 1 },
      });
    });

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
      name: "Poznaj JakStoimy",
    });
    await expect(welcome).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: WELCOME_TOUR_SKIP_BUTTON }).click();
    await expect(welcome).toBeHidden();
    await expect.poll(() => page.url()).toContain("/import");
  });

  test("empty dashboard hides the financial grid until demo or import", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Brak transakcji" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("link", { name: "Kokpit" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Transakcje" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Plany" }).first()).toBeVisible();
    await expect(page.locator("[data-tour-id=tour-balance-ring]")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Ten miesiąc" })).toHaveCount(0);
    await expect(page.getByText("Historia wydatków")).toHaveCount(0);
  });

  test("closing welcome leaves the empty kokpit discovery", async ({ page }) => {
    await page.route("**/rest/v1/profiles**", async (route) => {
      if (route.request().method() === "PATCH") {
        return fulfillSupabaseJson(route, MOCK_PROFILE_FRESH_TOUR);
      }
      return fulfillSupabaseJson(route, MOCK_PROFILE_FRESH_TOUR);
    });
    await page.goto("/dashboard");
    const welcome = page.getByRole("dialog", {
      name: "Poznaj JakStoimy",
    });
    await expect(welcome).toBeVisible({ timeout: 10_000 });
    await welcome.getByRole("button", { name: "Zamknij" }).click();
    await expect(welcome).toBeHidden();
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.getByRole("heading", { name: "Brak transakcji" })).toBeVisible();
    await expect(page.locator("[data-tour-id=tour-balance-ring]")).toHaveCount(0);
  });

  test("empty transactions and plans point to import and demo", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Brak transakcji" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("link", { name: "Importuj wyciąg" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Otwórz konto demo" })).toBeVisible();

    await page.goto("/plans");
    await expect(page.getByRole("heading", { name: "Brak planów" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Najpierw importuj wyciąg albo wczytaj przykład.")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Importuj wyciąg" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Otwórz konto demo" })).toBeVisible();
  });

  test("mobile tour keeps manual scroll and advances across routes", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route("**/rest/v1/profiles**", async (route) => {
      if (route.request().method() === "PATCH") {
        return fulfillSupabaseJson(route, MOCK_PROFILE_FRESH_TOUR);
      }
      return fulfillSupabaseJson(route, MOCK_PROFILE_FRESH_TOUR);
    });

    await mockLegacyExample(page);
    let replayProfile = {
      ...MOCK_PROFILE_FRESH_TOUR,
      settings: { guidedTour: { path: "demo", dismissed: false, completedSceneIds: ["4.3"] } },
    };
    await page.route("**/rest/v1/profiles**", (route) => {
      if (route.request().method() === "PATCH")
        replayProfile = { ...replayProfile, ...route.request().postDataJSON() };
      return fulfillSupabaseJson(route, replayProfile);
    });
    await page.goto("/dashboard");

    const tour = page.locator("[data-guided-tour-chrome]");
    await expect(tour).toContainText("1 z 8", { timeout: 15_000 });
    const counters = page.getByTestId("cockpit-indicators");
    await expect(counters).toHaveAttribute("data-tour-id", "tour-balance-ring");
    await expect(counters.getByText("Saldo na dziś", { exact: true })).toBeVisible();
    const spotlight = page.getByTestId("tour-spotlight");
    await expect(spotlight).toBeVisible();
    const targetBox = await counters.boundingBox();
    const spotlightBox = await spotlight.boundingBox();
    expect(targetBox && spotlightBox).toBeTruthy();
    expect(spotlightBox!.y).toBeLessThan(targetBox!.y + targetBox!.height);
    expect(spotlightBox!.y + spotlightBox!.height).toBeGreaterThan(targetBox!.y);
    expect(spotlightBox!.x).toBeLessThan(targetBox!.x + targetBox!.width);
    expect(spotlightBox!.x + spotlightBox!.width).toBeGreaterThan(targetBox!.x);
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
    await page.goto("/settings?tab=help");
    await page.getByRole("button", { name: "Słownik pojęć" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Import bankowy" })).toBeVisible();
  });

  test("settings opens the gated dedicated demo entry without writing real-account sample rows", async ({
    page,
  }) => {
    let writes = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        /rest\/v1\/(transactions|plans|rpc\/create_demo_car_loan)/.test(request.url())
      )
        writes += 1;
    });
    await page.goto("/settings?tab=help");
    await page.getByRole("button", { name: "Wypełnij przykładowymi danymi" }).click();
    await expect(page).toHaveURL(/\/login\?account=demo/);
    await expect(page.getByTestId("open-demo-account")).toBeVisible();
    expect(writes).toBe(0);
    expect(
      await page.evaluate(() => localStorage.getItem("jakstoimy.auth.real.session.v1") !== null)
    ).toBe(true);
  });

  test("demo banner is on kokpit, transactions, and plans, and clearing it works", async ({
    page,
  }) => {
    await mockLegacyExample(page);
    await page.goto("/dashboard");
    await expect(page.getByText("To przykładowe dane.", { exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await page.goto("/transactions");
    await expect(page.getByText("To przykładowe dane.", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "Usuń przykład" })).toBeVisible();

    await page.goto("/plans");
    await expect(page.getByText("Tryb demonstracyjny")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("To przykładowe dane.", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Usuń przykład" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Usuń", exact: true }).click();
    await expect(page.getByText("Tryb demonstracyjny")).toHaveCount(0);
  });
  test("failed cleanup retains the banner and confirmation and never claims success", async ({
    page,
  }) => {
    await mockLegacyExample(page);
    await page.route("**/rest/v1/rpc/clear_demo_data**", (route) =>
      route.fulfill({
        status: 400,
        json: { code: "P0001", message: "demo_legacy_origin_unconfirmed" },
      })
    );
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Usuń przykład", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Usuń", exact: true }).click();
    await expect(page.getByText("To przykładowe dane.", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("alertdialog").getByRole("button", { name: "Usuń", exact: true })
    ).toBeEnabled();
    await expect(
      page.getByText("Przykładowe dane usunięte. Twoje dane bez zmian.", { exact: true })
    ).toHaveCount(0);
    await expect(page.getByText(/Nie usunięto danych:/)).toBeVisible();
  });
});
