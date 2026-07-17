import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

// Desktop table locator helper - use this for all desktop-table assertions.
// Both mobile cards (sm:hidden) and desktop table (hidden sm:block) are in the DOM at 1280px.
// getByText() matches both, causing strict-mode violations; scope to the desktop table instead.
const desktopTable = (page: Page) => page.locator("table");

// Search palette renders card list (not table) at all breakpoints.
const palette = (page: Page) => page.getByRole("search");

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.goto("/transactions");
  // Wait for the desktop table to render at least one row
  await expect(desktopTable(page).getByText("Zakupy spożywcze")).toBeVisible();
});

test("renders mocked transaction list", async ({ page }) => {
  await expect(desktopTable(page).getByText("Zakupy spożywcze")).toBeVisible();
  await expect(desktopTable(page).getByText("Bilet miesięczny")).toBeVisible();
});

test("search filters results inside the command palette", async ({ page }) => {
  await page.getByRole("button", { name: "Szukaj transakcji" }).click();

  const search = palette(page);
  await expect(search).toBeVisible();

  await search.getByPlaceholder("Szukaj transakcji…").fill("bilet");
  await expect(search.getByText("Bilet miesięczny")).toBeVisible();
  await expect(search.getByText("Zakupy spożywcze")).toBeHidden();

  // Clicking a result card closes the palette and opens the detail sheet.
  await search.getByText("Bilet miesięczny").click();
  await expect(search).toBeHidden();
  await expect(page.locator("aside").getByText("Bilet miesięczny")).toBeVisible();
});

test("txId deep link opens transaction outside the current date range", async ({ page }) => {
  const oldLinkedTransaction = {
    id: "tx-old-linked",
    date: "2026-01-15",
    description: "Stara transakcja z planu",
    amount: 42,
    type: "expense",
    status: "paid",
    category_id: "cat-1",
    category_name: "Jedzenie",
    category_type: "expense",
    is_recurring: false,
    recurring_day: null,
    recurring_template_id: null,
    recurring_occurrence_date: null,
    currency: "PLN",
    user_id: TEST_USER_ID,
    group_id: null,
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-01-15T10:00:00Z",
  };

  await page.route("**/rest/v1/transactions_with_category**", (route) => {
    const url = route.request().url();
    if (url.includes("id=eq.tx-old-linked")) {
      return route.fulfill({ status: 200, json: oldLinkedTransaction });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto("/transactions?txId=tx-old-linked");

  const sheet = page.locator("aside");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Stara transakcja z planu")).toBeVisible();
});

test("far-future recurring forecast rows expose only scoped series actions", async ({ page }) => {
  const recurringTemplate = {
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
    recurring_day: 5,
    recurrence_frequency: "monthly",
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    recurring_occurrence_date: null,
    currency: "PLN",
    user_id: TEST_USER_ID,
    group_id: null,
    created_at: "2026-01-05T10:00:00Z",
    updated_at: "2026-01-05T10:00:00Z",
  };

  await page.route("**/rest/v1/transactions_with_category**", (route) => {
    const url = route.request().url();
    if (url.includes("is_recurring=eq.true")) {
      return route.fulfill({ status: 200, json: [recurringTemplate] });
    }
    return route.fulfill({ status: 200, json: [] });
  });

  await page.goto(
    "/transactions?startDate=2026-09-01&endDate=2026-09-30&status=upcoming"
  );

  const row = desktopTable(page).locator("tbody tr").filter({ hasText: "Czynsz" });
  await expect(row).toBeVisible();
  await expect(row.getByLabel("Płatność cykliczna, prognoza")).toBeVisible();
  await expect(row.getByRole("button", { name: "Oznacz jako zapłacone" })).toHaveCount(0);

  await row.click();
  const sheet = page.locator("aside");
  await expect(sheet.getByText("Płatność cykliczna")).toBeVisible();
  await expect(sheet.getByText("Jeszcze nie ma w historii")).toBeVisible();
  await expect(sheet.getByText("Seria cykliczna")).toBeVisible();
  await sheet.getByRole("button", { name: "Edytuj" }).click();
  await expect(sheet.getByRole("button", { name: "To wystąpienie" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Cała seria" })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Usuń" })).toBeVisible();
});

test("near-term recurring occurrence rows are manageable transactions", async ({ page }) => {
  const recurringOccurrence = {
    id: "tx-rent-july",
    date: "2026-07-05",
    description: "Czynsz",
    amount: 2500,
    type: "expense",
    status: "upcoming",
    category_id: "cat-1",
    category_name: "Jedzenie",
    category_type: "expense",
    is_recurring: false,
    recurring_day: null,
    recurrence_frequency: null,
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: "tmpl-rent",
    recurring_occurrence_date: "2026-07-05",
    currency: "PLN",
    user_id: TEST_USER_ID,
    group_id: null,
    created_at: "2026-07-05T10:00:00Z",
    updated_at: "2026-07-05T10:00:00Z",
  };

  await page.route("**/rest/v1/transactions_with_category**", (route) => {
    const url = route.request().url();
    if (url.includes("is_recurring=eq.true")) {
      return route.fulfill({ status: 200, json: [] });
    }
    return route.fulfill({ status: 200, json: [recurringOccurrence] });
  });

  await page.goto("/transactions?startDate=2026-07-01&endDate=2026-07-31&status=upcoming");

  const row = desktopTable(page).locator("tbody tr").filter({ hasText: "Czynsz" });
  await expect(row).toBeVisible();
  await expect(row.getByLabel("Płatność cykliczna")).toBeVisible();
  await expect(row.getByRole("button", { name: "Oznacz jako zapłacone" })).toBeVisible();

  await row.click();
  const sheet = page.locator("aside");
  await expect(sheet.getByText("Płatność cykliczna")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Edytuj" })).toHaveCount(2);
  await expect(sheet.getByRole("button", { name: "Usuń" })).toHaveCount(2);
});

test("add transaction: opens dialog and shows success toast", async ({ page }) => {
  // Click the desktop "+ Dodaj ręcznie" button (not the mobile FAB)
  // The page renders `+ {m.transaction_manual_add()}` = "+ Dodaj ręcznie"
  await page
    .getByRole("button", { name: /Dodaj ręcznie/ })
    .first()
    .click();

  // Dialog opens
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Nowa transakcja")).toBeVisible();

  // Fill form
  await page.locator("#tx-amount").fill("99.99");
  await page.locator("#tx-desc").fill("Nowa transakcja testowa");
  // Category is now a searchable combobox (not a native select): focus, type, pick.
  await page.locator("#tx-cat").click();
  await page.locator("#tx-cat").fill("Jedzenie");
  await page.getByRole("option", { name: "Jedzenie" }).click();

  // Submit
  await page.getByRole("button", { name: "Zapisz" }).click();

  // Toast appears
  await expect(page.getByText("Transakcja dodana")).toBeVisible();
});

test("single delete: confirm dialog then success toast", async ({ page }) => {
  // Click the first data row to open the detail sheet.
  // Due to Svelte 5 event delegation, clicking the delete button inside a role="button" TR
  // fires the row's onclick; so we use the sheet's own delete button instead.
  await desktopTable(page).locator("tbody tr").first().click();

  // Detail sheet appears
  const sheet = page.locator("aside");
  await expect(sheet).toBeVisible();

  // The sheet delete button is shown when isOwner=true (same user_id).
  // currentUserId is set via onMount; wait for the button to appear.
  const sheetDeleteBtn = sheet.getByRole("button", { name: "Usuń" });
  await expect(sheetDeleteBtn).toBeVisible({ timeout: 5000 });
  await sheetDeleteBtn.click();

  // Confirm dialog appears
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByText("Potwierdź usunięcie")).toBeVisible();

  // Confirm delete
  await page.getByRole("alertdialog").getByRole("button", { name: "Usuń" }).click();

  // Success toast
  await expect(page.getByText("Transakcja usunięta")).toBeVisible();
});

test("bulk delete: confirm and show success toast", async ({ page }) => {
  // Select both rows
  const rowCheckboxes = page.locator("tbody td:first-child button");
  await rowCheckboxes.nth(0).click();
  await rowCheckboxes.nth(1).click();

  const bulkBar = page.locator(".surface-hi").filter({ hasText: "Zaznaczono 2" });
  await bulkBar.getByRole("button", { name: "Usuń" }).click();

  // Confirm dialog appears
  await expect(page.getByRole("alertdialog")).toBeVisible();

  // Confirm
  await page.getByRole("alertdialog").getByRole("button", { name: "Usuń" }).click();

  // Success toast - message: "Usunięto 2 transakcji"
  await expect(page.getByText(/Usunięto 2 transakcji/)).toBeVisible();
});

test("quick-settle marks an upcoming transaction paid", async ({ page }) => {
  // tx-3 ("Rachunek za prąd") is seeded with status "upcoming" → eligible for quick-settle.
  await expect(desktopTable(page).getByText("Rachunek za prąd")).toBeVisible();
  const settle = page.getByRole("button", { name: "Oznacz jako zapłacone" }).first();
  await expect(settle).toBeVisible();
  await settle.click();
  // Success toast confirms the mark-paid mutation fired with an undo affordance.
  await expect(page.getByText("Oznaczono jako zapłacone")).toBeVisible();
});
