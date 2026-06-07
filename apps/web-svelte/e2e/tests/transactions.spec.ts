import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

// Desktop table locator helper - use this for all desktop-table assertions.
// Both mobile cards (sm:hidden) and desktop table (hidden sm:block) are in the DOM at 1280px.
// getByText() matches both, causing strict-mode violations; scope to the desktop table instead.
const desktopTable = (page: Page) => page.locator("table");

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

test("shows import and export as direct desktop actions", async ({ page }) => {
  await expect(page.getByRole("link", { name: "Import" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Eksportuj CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Więcej akcji" })).toHaveCount(0);
});

test("search filters results inside the command palette", async ({ page }) => {
  await page.getByRole("button", { name: "Szukaj transakcji" }).click();

  // The palette is a role="search" region that renders its own results table.
  const palette = page.getByRole("search");
  await expect(palette).toBeVisible();

  await palette.getByPlaceholder("Szukaj transakcji…").fill("bilet");
  const paletteTable = palette.locator("table");
  await expect(paletteTable.getByText("Bilet miesięczny")).toBeVisible();
  await expect(paletteTable.getByText("Zakupy spożywcze")).toBeHidden();

  // Clicking a result row closes the palette and opens the detail sheet.
  await paletteTable.getByText("Bilet miesięczny").click();
  await expect(palette).toBeHidden();
  await expect(page.locator("aside").getByText("Bilet miesięczny")).toBeVisible();
});

test("search palette opens and closes via Escape", async ({ page }) => {
  await page.getByRole("button", { name: "Szukaj transakcji" }).click();
  await expect(page.getByRole("search")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("search")).toBeHidden();
});

test("closing the palette clears the search query", async ({ page }) => {
  const toggle = page.getByRole("button", { name: "Szukaj transakcji" });
  await toggle.click();

  const palette = page.getByRole("search");
  await palette.getByPlaceholder("Szukaj transakcji…").fill("bilet");
  await expect(palette.locator("table").getByText("Zakupy spożywcze")).toBeHidden();

  // Close via the palette's ESC chip (the toggle is covered by the backdrop while open).
  await palette.getByRole("button", { name: "Zamknij wyszukiwanie" }).click();
  await expect(palette).toBeHidden();

  // Reopen: query is reset and the full list is back - no silent filter.
  await toggle.click();
  await expect(palette.getByPlaceholder("Szukaj transakcji…")).toHaveValue("");
  await expect(palette.locator("table").getByText("Zakupy spożywcze")).toBeVisible();
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

test("mobile date range sheet stays open while interacting with controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/transactions");
  await expect(page.locator("li").filter({ hasText: "Zakupy spożywcze" }).first()).toBeVisible();

  await page.getByRole("button", { name: /2026/i }).click();
  const dialog = page.getByRole("dialog", { name: "Zakres dat" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Dni", exact: true }).click();
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Miesiące", exact: true }).click();
  await expect(dialog).toBeVisible();
});

test("mobile import and export stay as direct header actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/transactions");
  await expect(page.locator("li").filter({ hasText: "Zakupy spożywcze" }).first()).toBeVisible();

  await expect(page.getByRole("link", { name: "Import" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Eksportuj CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Więcej akcji" })).toHaveCount(0);
});

test("mobile bank actions stay available when category filters are unavailable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/rest/v1/categories**", (route) =>
    route.fulfill({ status: 500, json: { message: "categories unavailable" } })
  );
  await page.goto("/transactions");
  await expect(page.locator("li").filter({ hasText: "Zakupy spożywcze" }).first()).toBeVisible();

  await expect(page.getByRole("button", { name: "Kategoria" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Import" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Eksportuj CSV" })).toBeVisible();
});

test("mobile bank actions stay available while rows are selected", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/transactions");
  const row = page.locator("li").filter({ hasText: "Zakupy spożywcze" }).first();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Zaznacz wszystkie" }).click();
  await expect(page.getByText("Zaznaczono 1")).toBeVisible();
  await expect(page.getByRole("link", { name: "Import" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Eksportuj CSV" })).toBeVisible();
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

test('bulk select: "Zaznaczono 2" bar appears', async ({ page }) => {
  // Click individual row checkboxes in the desktop table body
  const rowCheckboxes = page.locator("tbody td:first-child button");
  await rowCheckboxes.nth(0).click();
  await rowCheckboxes.nth(1).click();

  const bulkBar = page.locator(".surface-hi").filter({ hasText: "Zaznaczono 2" });
  await expect(bulkBar).toBeVisible();
  await expect(bulkBar.getByRole("button", { name: "Usuń" })).toBeVisible();
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
