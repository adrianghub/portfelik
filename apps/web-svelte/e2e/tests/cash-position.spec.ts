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
const strip = (page: Page) => page.getByRole("region", { name: "Stan środków" });

// Saldo cell of a given row (last cell when the running-balance column shows).
const saldoCell = (page: Page, description: string) =>
  desktopTable(page).locator("tbody tr").filter({ hasText: description }).locator("td").last();

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

test("private scope: strip shows live total and the last paid row's running balance matches it", async ({
  page,
}) => {
  await mockCash(page);
  await page.goto("/transactions?group=own");

  // Strip renders the live cash position. It first paints the opening balance,
  // then settles to live once the paid-history query resolves, so wait for the
  // settled value (auto-retrying) before capturing it for reuse below.
  await expect(strip(page)).toBeVisible();
  const liveLocator = strip(page).locator("p.text-2xl");
  await expect(liveLocator).toHaveText(/1\D?300,00/); // 1000 + 500 − 200
  const liveText = (await liveLocator.textContent())?.trim() ?? "";

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

test("solo user (no groups) sees the cash view in the default scope", async ({ page }) => {
  // No groups → no own/all tabs; the page defaults to scope "all", but every row
  // is private so the pool must still be reachable.
  await mockCash(page); // default mock returns [] for user_groups
  await page.goto("/transactions");

  await expect(strip(page)).toBeVisible();
  await expect(desktopTable(page).getByText("Saldo", { exact: true })).toBeVisible();
  // For solo users the cash view only engages once groupsQuery resolves (no groups),
  // and the running-balance map fills after the paid-history query. Assert with
  // auto-retry instead of a one-shot read, else we race the "—" placeholder.
  await expect(saldoCell(page, "Wydatek gotówkowy")).toHaveText(/1\D?300,00/);
});

test("group user: mixed all scope hides the cash view, own scope shows it", async ({ page }) => {
  await mockCash(page, { withGroup: true });

  // "all" scope mixes private + group rows → personal pool is hidden.
  await page.goto("/transactions?group=all");
  await expect(desktopTable(page).getByText("Wydatek gotówkowy")).toBeVisible();
  await expect(strip(page)).toHaveCount(0);
  await expect(desktopTable(page).getByText("Saldo", { exact: true })).toHaveCount(0);

  // Switching to own scope brings the pool back.
  await page.goto("/transactions?group=own");
  await expect(strip(page)).toBeVisible();
  await expect(desktopTable(page).getByText("Saldo", { exact: true })).toBeVisible();
});

test("private scope without an anchor: strip prompts to set a balance, no Saldo column", async ({
  page,
}) => {
  await mockCash(page, { withAnchor: false });
  await page.goto("/transactions?group=own");

  await expect(desktopTable(page).getByText("Wydatek gotówkowy")).toBeVisible();
  // Strip still renders, but as a prompt — no fabricated total.
  await expect(strip(page).getByText(/Ustaw saldo początkowe/)).toBeVisible();
  // The running-balance column stays hidden until an opening anchor exists.
  await expect(desktopTable(page).getByText("Saldo", { exact: true })).toHaveCount(0);
});
