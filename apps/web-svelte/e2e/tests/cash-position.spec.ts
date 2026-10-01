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

test("private scope: strip shows live total and forecast", async ({ page }) => {
  await mockCash(page);
  await page.goto("/transactions?group=own");

  // Strip renders the live cash position. It first paints the opening balance,
  // then settles to live once the paid-history query resolves, so wait for the
  // settled value (auto-retrying).
  await expect(strip(page)).toBeVisible();
  await expect(strip(page).locator("p.text-3xl")).toHaveText(/1\D?300,00/); // 1000 + 500 − 200

  const forecast = strip(page).locator("p.text-2xl");
  await expect(forecast).toBeVisible();
  await expect(forecast).toContainText(/1\D?600,00/);
});

test("solo user (no groups) sees the cash view in the default scope", async ({ page }) => {
  // No groups → no own/all tabs; the page defaults to scope "all", but every row
  // is private so the pool must still be reachable.
  await mockCash(page); // default mock returns [] for user_groups
  await page.goto("/transactions");

  await expect(strip(page)).toBeVisible();
  await expect(strip(page).locator("p.text-3xl")).toHaveText(/1\D?300,00/);
});

test("group user: mixed all scope hides the cash view, own scope shows it", async ({ page }) => {
  await mockCash(page, { withGroup: true });

  // "all" scope mixes private + group rows → personal pool is hidden.
  await page.goto("/transactions?group=all");
  await expect(desktopTable(page).getByText("Wydatek gotówkowy")).toBeVisible();
  await expect(strip(page)).toHaveCount(0);

  // Switching to own scope brings the pool back.
  await page.goto("/transactions?group=own");
  await expect(strip(page)).toBeVisible();
});

test("private scope without an anchor: one control opens the balance sheet", async ({ page }) => {
  await mockCash(page, { withAnchor: false });
  await page.goto("/transactions?group=own");

  await expect(desktopTable(page).getByText("Wydatek gotówkowy")).toBeVisible();
  await expect(strip(page)).toHaveCount(0);
  const setBalance = page.getByRole("button", {
    name: "Ustaw saldo początkowe, aby zobaczyć saldo i prognozę",
  });
  await expect(setBalance).toBeVisible();
  await setBalance.click();
  await expect(page.getByRole("dialog", { name: "Saldo z transakcji" })).toBeVisible();
});

test("private scope: strip opens edit sheet with anchor fields", async ({ page }) => {
  await mockCash(page);
  await page.goto("/transactions?group=own");

  await expect(strip(page)).toBeVisible();
  await strip(page).getByRole("button", { name: "Zmień saldo początkowe" }).click();

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
    await page.getByRole("button", { name: "Zmień saldo początkowe", exact: true }).click();
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
