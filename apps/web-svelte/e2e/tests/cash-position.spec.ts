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
const strip = (page: Page) => page.getByRole("region", { name: "Pozycja" });

// Saldo cell of a given row (last cell when the running-balance column shows).
const saldoCell = (page: Page, description: string) =>
  desktopTable(page).locator("tbody tr").filter({ hasText: description }).locator("td").last();

async function mockCash(page: Page, withAnchor = true): Promise<void> {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  // Registered after the base handler, so these win (Playwright matches newest-first).
  await page.route("**/rest/v1/cash_positions**", (route) =>
    route.fulfill({ status: 200, json: withAnchor ? CASH_ANCHOR : null })
  );
  await page.route("**/rest/v1/transactions_with_category**", (route) =>
    route.fulfill({ status: 200, json: CASH_TXS })
  );
}

test("private scope: strip shows live total and the last paid row's running balance matches it", async ({
  page,
}) => {
  await mockCash(page);
  await page.goto("/transactions?group=own");

  // Strip renders the live cash position.
  await expect(strip(page)).toBeVisible();
  const liveText = (await strip(page).locator("p.text-2xl").textContent())?.trim() ?? "";
  expect(liveText).toMatch(/1\D?300,00/); // 1000 + 500 − 200

  // Forecast (live + upcoming income) is surfaced faintly.
  await expect(strip(page).getByText(/prognoza/)).toBeVisible();
  await expect(strip(page).getByText(/1\D?600,00/)).toBeVisible();

  // The running-balance column shows, and the latest paid row equals the live total.
  await expect(desktopTable(page).getByText("Saldo", { exact: true })).toBeVisible();
  const lastBalance = (await saldoCell(page, "Wydatek gotówkowy").textContent())?.trim() ?? "";
  expect(lastBalance).toBe(liveText);

  // The earlier paid row carries the intermediate balance (1000 + 500).
  const firstBalance = (await saldoCell(page, "Wpłata gotówki").textContent())?.trim() ?? "";
  expect(firstBalance).toMatch(/1\D?500,00/);
});

test("group/all scope hides the strip and the running-balance column", async ({ page }) => {
  await mockCash(page);
  await page.goto("/transactions"); // no group param → scope "all"

  await expect(desktopTable(page).getByText("Wydatek gotówkowy")).toBeVisible();
  await expect(strip(page)).toHaveCount(0);
  await expect(desktopTable(page).getByText("Saldo", { exact: true })).toHaveCount(0);
});
