import { expect, test, type Page } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";
import { MOCK_CATEGORIES, MOCK_PROFILE, MOCK_TRANSACTIONS, MOCK_USER } from "../helpers/fixtures";

async function mockPasswordLogin(page: Page) {
  let signedIn = false;

  await page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/token") && route.request().method() === "POST") {
      signedIn = true;
      return route.fulfill({
        status: 200,
        json: {
          access_token: "fake-access-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: "fake-refresh-token",
          user: MOCK_USER,
        },
      });
    }

    if (signedIn) return route.fulfill({ status: 200, json: MOCK_USER });
    return route.fulfill({ status: 401, json: { message: "Auth session missing" } });
  });

  await page.route("**/rest/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/profiles")) return route.fulfill({ status: 200, json: [MOCK_PROFILE] });
    if (url.includes("/categories")) return route.fulfill({ status: 200, json: MOCK_CATEGORIES });
    if (url.includes("/transactions_with_category")) {
      return route.fulfill({ status: 200, json: MOCK_TRANSACTIONS });
    }
    return route.fulfill({ status: 200, json: [] });
  });
}

test("unauthenticated: /transactions redirects to /login with return path", async ({ page }) => {
  await page.goto("/transactions");
  await expect(page).toHaveURL("/login?redirectTo=%2Ftransactions", { timeout: 10000 });
});

test("login page renders Google sign-in button", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Zaloguj się z Google" })).toBeVisible();
});

test("password login redirects to dashboard by default", async ({ page }) => {
  await mockPasswordLogin(page);
  await page.goto("/login");

  await page.getByLabel("Adres e-mail").fill(" test@portfelik.test ");
  await page.getByLabel("Hasło").fill("test-password");
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();

  await expect(page).toHaveURL("/dashboard", { timeout: 10000 });
});

test("password login returns to the requested protected route", async ({ page }) => {
  await mockPasswordLogin(page);
  await page.goto("/transactions?startYear=2026&startMonth=5");

  await expect(page).toHaveURL(
    "/login?redirectTo=%2Ftransactions%3FstartYear%3D2026%26startMonth%3D5",
    { timeout: 10000 }
  );

  await page.getByLabel("Adres e-mail").fill("test@portfelik.test");
  await page.getByLabel("Hasło").fill("test-password");
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();

  await expect(page).toHaveURL("/transactions?startYear=2026&startMonth=5", { timeout: 10000 });
});

test("authenticated: /transactions loads without redirect", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.goto("/transactions");
  await expect(page).toHaveURL("/transactions", { timeout: 10000 });
});
