import { expect, test } from "@playwright/test";
import { TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

/** A monthly recurring template seeded for all recurring-page tests. */
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

test.describe("recurring management page", () => {
  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page);
    await mockSupabaseAPI(page);

    // Override the transactions_with_category route to return the recurring
    // template when `is_recurring=eq.true` is queried (the recurring page) and
    // the standard mock for everything else.
    await page.route("**/rest/v1/transactions_with_category**", (route) => {
      const url = route.request().url();
      if (url.includes("is_recurring=eq.true")) {
        return route.fulfill({ status: 200, json: [RECURRING_TEMPLATE] });
      }
      // Single-row fetch for the end mutation's fetchTransactionById
      if (url.includes("id=eq.tmpl-rent")) {
        return route.fulfill({ status: 200, json: RECURRING_TEMPLATE });
      }
      return route.fulfill({ status: 200, json: [] });
    });
  });

  test("renders active recurring series list", async ({ page }) => {
    await page.goto("/recurring");
    // Page title
    await expect(page.getByText("Transakcje cykliczne")).toBeVisible();
    // Series title
    await expect(page.getByText("Czynsz")).toBeVisible();
    // Cadence — "Co miesiąc · 5. dnia"
    await expect(page.getByText("Co miesiąc")).toBeVisible();
    // "następne" label is present with a date
    await expect(page.getByText(/następne/)).toBeVisible();
    // Scope badge
    await expect(page.getByText("Prywatne")).toBeVisible();
  });

  test("Edytuj serię opens transaction dialog", async ({ page }) => {
    await page.goto("/recurring");
    await expect(page.getByText("Czynsz")).toBeVisible();

    await page.getByRole("button", { name: "Edytuj serię" }).click();
    // The TransactionDialog renders as a dialog with form fields
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("Zakończ od dziś confirms and removes the series", async ({ page }) => {
    // Track whether the end mutation has fired so post-invalidation
    // queries return an empty template list (the series is now ended).
    let endConfirmed = false;

    // Unroute the beforeEach catch-all, then re-register a combined handler
    // that covers both view and table endpoints in a single pattern.
    await page.unroute("**/rest/v1/transactions_with_category**");
    await page.route("**/rest/v1/transactions_with_category**", (route) => {
      const url = route.request().url();
      if (url.includes("is_recurring=eq.true")) {
        if (endConfirmed) {
          return route.fulfill({ status: 200, json: [] });
        }
        return route.fulfill({ status: 200, json: [RECURRING_TEMPLATE] });
      }
      if (url.includes("id=eq.tmpl-rent")) {
        return route.fulfill({ status: 200, json: RECURRING_TEMPLATE });
      }
      return route.fulfill({ status: 200, json: [] });
    });

    // Mock the transactions table endpoint for PATCH (update recurrence_end_date)
    // and DELETE (remove future materialized occurrences).
    // Use a narrow glob so it does NOT shadow transactions_with_category.
    await page.route("**/rest/v1/transactions?**", (route) => {
      const method = route.request().method();
      if (method === "PATCH") {
        return route.fulfill({ status: 200, json: [{ ...RECURRING_TEMPLATE }] });
      }
      if (method === "DELETE") {
        return route.fulfill({ status: 204, body: "" });
      }
      return route.fulfill({ status: 200, json: [] });
    });

    await page.goto("/recurring");
    await expect(page.getByText("Czynsz")).toBeVisible();

    await page.getByRole("button", { name: "Zakończ od dziś" }).click();

    // ConfirmDialog appears with the confirmation message
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(
      page.getByText("Zakończyć tę serię od dziś? Przyszłe wystąpienia znikną; historia zostaje.")
    ).toBeVisible();

    endConfirmed = true;
    await page.getByRole("alertdialog").getByRole("button", { name: "Usuń" }).click();

    // Success toast
    await expect(page.getByText("Serię zakończono.")).toBeVisible();
    // Empty state appears (or the row is gone)
    await expect(page.getByText("Nie masz aktywnych transakcji cyklicznych.")).toBeVisible();
  });

  test("transactions header Cykliczne link navigates to /recurring", async ({ page }) => {
    await page.goto("/transactions");
    // Wait for transactions page to load
    await expect(page.getByRole("heading", { name: "Transakcje" })).toBeVisible();

    // The "Cykliczne" link is md:inline-flex (desktop only, viewport is 1280px default)
    const recurringLink = page.getByRole("link", { name: "Cykliczne" });
    await expect(recurringLink.first()).toBeVisible();
    await recurringLink.first().click();

    await expect(page).toHaveURL(/\/recurring/);
    await expect(page.getByText("Transakcje cykliczne")).toBeVisible();
  });

  test("dashboard Cykliczne link navigates to /recurring", async ({ page }) => {
    await page.goto("/dashboard");
    // Wait for the dashboard to render the status band with the recurring link.
    // The link text is "Cykliczne (1)" since we have one active recurring template.
    const recurringLink = page.getByRole("link", { name: /Cykliczne \(\d+\)/ });
    await expect(recurringLink).toBeVisible({ timeout: 10000 });
    await recurringLink.click();

    await expect(page).toHaveURL(/\/recurring/);
    await expect(page.getByText("Transakcje cykliczne")).toBeVisible();
  });
});
