import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

// Private cash pool anchored at 1000 zł on 2026-06-01.
const CASH_ANCHOR = {
  owner_id: TEST_USER_ID,
  group_id: null,
  opening_amount: 1000,
  as_of_date: "2026-06-01",
  created_at: "2026-06-01T10:00:00Z",
  updated_at: "2026-06-01T10:00:00Z",
};

// Two paid rows after the anchor (income +500, expense −200) → live 1300 zł,
// plus one upcoming income (+300) → forecast 1600 zł. All private (group_id null).
const CASH_TXS = [
  {
    id: "tx-cash-income",
    date: "2026-06-05",
    description: "Wpłata gotówki",
    amount: 500,
    type: "income",
    status: "paid",
    category_id: "cat-3",
    category_name: "Wynagrodzenie",
    is_recurring: false,
    recurring_day: null,
    currency: "PLN",
    user_id: TEST_USER_ID,
    group_id: null,
    created_at: "2026-06-05T10:00:00Z",
    updated_at: "2026-06-05T10:00:00Z",
  },
  {
    id: "tx-cash-expense",
    date: "2026-06-10",
    description: "Wydatek gotówkowy",
    amount: 200,
    type: "expense",
    status: "paid",
    category_id: "cat-1",
    category_name: "Jedzenie",
    is_recurring: false,
    recurring_day: null,
    currency: "PLN",
    user_id: TEST_USER_ID,
    group_id: null,
    created_at: "2026-06-10T10:00:00Z",
    updated_at: "2026-06-10T10:00:00Z",
  },
  {
    id: "tx-cash-upcoming",
    date: "2026-06-20",
    description: "Przyszły wpływ",
    amount: 300,
    type: "income",
    status: "upcoming",
    category_id: "cat-3",
    category_name: "Wynagrodzenie",
    is_recurring: false,
    recurring_day: null,
    currency: "PLN",
    user_id: TEST_USER_ID,
    group_id: null,
    created_at: "2026-06-18T10:00:00Z",
    updated_at: "2026-06-18T10:00:00Z",
  },
];

const desktopTable = (page: Page) => page.locator("table");
const strip = (page: Page) => page.getByTestId("transaction-cash-position");

async function openBalanceEditor(page: Page) {
  await page.getByRole("button", { name: "Więcej akcji" }).click();
  await page.getByRole("menuitem", { name: "Zmień saldo początkowe" }).click();
}

const MOCK_GROUP = {
  id: "group-1",
  name: "Wspólny budżet",
  owner_id: TEST_USER_ID,
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

async function mockCash(
  page: Page,
  opts: { withAnchor?: boolean; withGroup?: boolean } = {}
): Promise<void> {
  const { withAnchor = true, withGroup = false } = opts;
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  // Registered after the base handler, so these win (Playwright matches newest-first).
  await page.route("**/rest/v1/cash_positions**", (route) =>
    route.fulfill({ status: 200, json: withAnchor ? CASH_ANCHOR : null })
  );
  await page.route("**/rest/v1/transactions_with_category**", (route) =>
    route.fulfill({ status: 200, json: CASH_TXS })
  );
  if (withGroup) {
    await page.route("**/rest/v1/user_groups**", (route) =>
      route.fulfill({ status: 200, json: [MOCK_GROUP] })
    );
  }
}

test("default date order uses status bands and another sort uses one list", async ({ page }) => {
  await mockCash(page);
  await page.goto("/transactions?group=own");

  const table = desktopTable(page);
  await expect(table.getByRole("rowheader", { name: "Nadchodzące", exact: true })).toBeVisible();
  await table.getByRole("button", { name: /Kwota/ }).click();
  await expect(table.getByRole("rowheader", { name: "Nadchodzące", exact: true })).toHaveCount(0);
  const rows = table.locator("tbody tr").filter({ has: page.locator("td") });
  await expect(rows.nth(0)).toContainText("Wydatek gotówkowy");
  await expect(rows.nth(1)).toContainText("Przyszły wpływ");
  await expect(rows.nth(2)).toContainText("Wpłata gotówki");
});

test("collapsing Nadchodzące leaves the history rows", async ({ page }) => {
  await mockCash(page);
  await page.goto("/transactions?group=own");

  const table = desktopTable(page);
  await expect(table.getByText("Przyszły wpływ")).toBeVisible();
  const toggle = table.getByRole("button", { name: "Nadchodzące", exact: true });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(table.getByText("Przyszły wpływ")).toHaveCount(0);
  await expect(table.getByText("Wydatek gotówkowy")).toBeVisible();
  await expect(table.getByText("Wpłata gotówki")).toBeVisible();
  await toggle.click();
  await expect(table.getByText("Przyszły wpływ")).toBeVisible();
});

test("search still finds an upcoming row after Nadchodzące is collapsed", async ({ page }) => {
  await mockCash(page);
  await page.goto("/transactions?group=own");

  const table = desktopTable(page);
  await table.getByRole("button", { name: "Nadchodzące", exact: true }).click();
  await expect(table.getByText("Przyszły wpływ")).toHaveCount(0);

  await page.getByRole("button", { name: "Szukaj transakcji", exact: true }).click();
  const search = page.getByRole("dialog", { name: "Szukaj transakcji" });
  await search.getByPlaceholder("Szukaj transakcji…").fill("Przyszły");
  await expect(search.getByText("Przyszły wpływ")).toBeVisible();
  await expect(search.getByRole("heading", { name: "Nadchodzące", exact: true })).toHaveCount(0);
  await expect(table.getByText("Przyszły wpływ")).toHaveCount(0);
});

test("private scope keeps the opening-balance editor off the list", async ({ page }) => {
  await mockCash(page);
  await page.goto("/transactions?group=own");

  await expect(page.getByText("Prognoza salda")).toHaveCount(0);
  await expect(page.locator("p.text-3xl")).toHaveCount(0);
  const table = desktopTable(page);
  await expect(table.getByRole("rowheader", { name: "Nadchodzące", exact: true })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "Historia", exact: true })).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Zmień saldo początkowe", exact: true })
  ).toHaveCount(0);
  await openBalanceEditor(page);

  const sheet = page.getByRole("dialog", { name: "Saldo z transakcji" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText(/1\D?300,00/);
  await expect(sheet).not.toContainText("Prognoza salda");
});

test("solo user (no groups) can still edit the opening balance", async ({ page }) => {
  // No groups → no own/all tabs; the page defaults to scope "all", but every row
  // is private so the editor must still be reachable.
  await mockCash(page); // default mock returns [] for user_groups
  await page.goto("/transactions");

  await expect(page.locator("p.text-3xl")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Zmień saldo początkowe", exact: true })
  ).toHaveCount(0);
  await openBalanceEditor(page);
  await expect(page.getByRole("dialog", { name: "Saldo z transakcji" })).toBeVisible();
});

test("group user: mixed all scope hides the cash view, own scope shows it", async ({ page }) => {
  await mockCash(page, { withGroup: true });

  // "all" scope mixes private + group rows → personal pool is hidden.
  await page.goto("/transactions?group=all");
  await expect(desktopTable(page).getByText("Wydatek gotówkowy")).toBeVisible();
  await page.getByRole("button", { name: "Więcej akcji" }).click();
  await expect(page.getByRole("menuitem", { name: "Zmień saldo początkowe" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // Switching to own scope brings the editor back, inside the actions menu.
  await page.goto("/transactions?group=own");
  await page.getByRole("button", { name: "Więcej akcji" }).click();
  await expect(page.getByRole("menuitem", { name: "Zmień saldo początkowe" })).toBeVisible();
});

test("private scope without an anchor: one control opens the balance sheet", async ({ page }) => {
  await mockCash(page, { withAnchor: false });
  await page.goto("/transactions?group=own");

  await expect(desktopTable(page).getByText("Wydatek gotówkowy")).toBeVisible();
  await expect(strip(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Więcej akcji" }).click();
  await expect(page.getByRole("menuitem", { name: "Zmień saldo początkowe" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  const setBalance = page.getByRole("button", {
    name: "Ustaw saldo początkowe, aby zobaczyć saldo i prognozę",
  });
  await expect(setBalance).toBeVisible();
  await setBalance.click();
  await expect(page.getByRole("dialog", { name: "Saldo z transakcji" })).toBeVisible();
});

test("phone without an anchor keeps the opening-balance hint", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockCash(page, { withAnchor: false });
  await page.goto("/transactions?group=own");

  const setBalance = page.getByRole("button", {
    name: "Ustaw saldo początkowe, aby zobaczyć saldo i prognozę",
  });
  await expect(setBalance).toBeVisible();
  await page.getByRole("button", { name: "Więcej akcji" }).click();
  await expect(page.getByRole("menuitem", { name: "Zmień saldo początkowe" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await setBalance.click();
  const sheet = page.getByRole("dialog", { name: "Saldo z transakcji" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Saldo początkowe")).toBeVisible();
  await expect(sheet.locator("#cash-opening-amount")).toHaveValue("");
});

test("private scope: strip opens edit sheet with anchor fields", async ({ page }) => {
  await mockCash(page);
  await page.goto("/transactions?group=own");

  await expect(
    page.getByRole("button", { name: "Zmień saldo początkowe", exact: true })
  ).toHaveCount(0);
  await openBalanceEditor(page);

  const sheet = page.getByRole("dialog", { name: "Saldo z transakcji" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("Dzień salda początkowego")).toBeVisible();
  await expect(sheet.locator("#cash-opening-amount")).toHaveValue("1000");
  await expect(sheet.getByLabel("Saldo początkowe")).toBeVisible();
  await expect(sheet.getByText(/na początku wybranego dnia/)).toBeVisible();
});

test.describe("nested balance date sheet", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("announces each dialog separately and Escape closes only the calendar", async ({ page }) => {
    await mockCash(page);
    await page.goto("/transactions?group=own");
    await openBalanceEditor(page);
    const balance = page.getByRole("dialog", { name: "Saldo z transakcji", exact: true });
    const trigger = balance.getByRole("button", { name: "Dzień salda początkowego", exact: true });
    await trigger.click();
    const calendar = page.getByRole("dialog", { name: "Dzień salda początkowego", exact: true });
    await expect(calendar).toBeVisible();
    await expect(balance).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(calendar).toHaveCount(0);
    await expect(balance).toBeVisible();
    await expect(trigger).toBeFocused();
    await balance.locator("#cash-opening-amount").fill("");
    await expect(balance.getByRole("button", { name: "Zapisz", exact: true })).toBeDisabled();
  });
});
