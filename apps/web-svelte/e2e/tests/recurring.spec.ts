import { expect, test } from "@playwright/test";
import { TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

const RECURRING_TEMPLATE = {
  id: "tmpl-rent",
  date: "2026-01-05",
  description: "Czynsz",
  amount: 2500,
  type: "expense",
  status: "paid",
  category_id: "cat-1",
  category_name: "Jedzenie",
  category_type: "expense",
  is_recurring: true,
  is_hold: false,
  recurring_day: 5,
  recurrence_frequency: "monthly",
  recurrence_interval: 1,
  recurrence_weekday: null,
  recurrence_month: null,
  recurrence_end_date: null,
  recurring_template_id: null,
  recurring_occurrence_date: null,
  counterparty: null,
  currency: "PLN",
  user_id: TEST_USER_ID,
  group_id: null,
  created_at: "2026-01-05T10:00:00Z",
  updated_at: "2026-01-05T10:00:00Z",
};

const RECURRING_TX_VIEW = /\/transactions\?.*status=upcoming/;

test.describe("recurring entry links", () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page);
    await mockSupabaseAPI(page);

    await page.route("**/rest/v1/transactions_with_category**", (route) => {
      const url = route.request().url();
      if (url.includes("is_recurring=eq.true")) {
        return route.fulfill({ status: 200, json: [RECURRING_TEMPLATE] });
      }
      return route.fulfill({ status: 200, json: [] });
    });
  });

  test("/recurring redirects to upcoming recurring transactions", async ({ page }) => {
    await page.goto("/recurring");

    await expect(page).toHaveURL(RECURRING_TX_VIEW);
    await expect(page.getByRole("heading", { name: "Transakcje" })).toBeVisible();
  });

  test("transactions header Nadchodzące link opens upcoming transactions view", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Transakcje" })).toBeVisible();

    const recurringLink = page.getByRole("link", { name: "Nadchodzące" });
    await expect(recurringLink.first()).toBeVisible();
    await recurringLink.first().click();

    await expect(page).toHaveURL(RECURRING_TX_VIEW);
    await expect(page.getByRole("heading", { name: "Transakcje" })).toBeVisible();
  });

  test("dashboard Nadchodzące link opens upcoming transactions view", async ({ page }) => {
    await page.goto("/dashboard");

    const recurringLink = page.getByRole("link", { name: /Nadchodzące \(\d+\)/ });
    await expect(recurringLink).toBeVisible({ timeout: 10000 });
    await recurringLink.click();

    await expect(page).toHaveURL(RECURRING_TX_VIEW);
    await expect(page.getByRole("heading", { name: "Transakcje" })).toBeVisible();
  });
});
