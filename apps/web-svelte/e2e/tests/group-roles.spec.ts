/**
 * Group-role UX: member readonly vs co-owner manage on shared rows.
 */

import { expect, test, type Page } from "@playwright/test";
import { MOCK_CATEGORIES, TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

const GROUP_ID = "group-shared-1";
const PEER_USER_ID = "00000000-0000-0000-0000-000000000002";
const SHARED_PLAN_ID = "plan-shared-save";

const MOCK_GROUP = {
  id: GROUP_ID,
  name: "Dom wspólny",
  owner_id: PEER_USER_ID,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

const SHARED_TX = {
  id: "tx-shared-1",
  description: "Wspólny wydatek",
  amount: 120,
  date: "2026-06-10",
  type: "expense",
  status: "paid",
  category_id: "cat-1",
  category_name: "Jedzenie",
  category_type: "expense",
  user_id: PEER_USER_ID,
  group_id: GROUP_ID,
  is_recurring: false,
  recurring_day: null,
  recurrence_frequency: null,
  recurrence_interval: 1,
  recurrence_weekday: null,
  recurrence_month: null,
  recurring_template_id: null,
  recurring_occurrence_date: null,
  currency: "PLN",
  created_at: "2026-06-10T10:00:00Z",
  updated_at: "2026-06-10T10:00:00Z",
};

const SHARED_SAVE_PLAN = {
  id: SHARED_PLAN_ID,
  name: "Wspólny cel",
  kind: "save",
  user_id: PEER_USER_ID,
  group_id: GROUP_ID,
  category_id: null,
  budget_amount: null,
  target_amount: 12000,
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

async function setupGroupRoleMocks(page: Page, role: "member" | "co_owner"): Promise<void> {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  await page.route(/.*\/rest\/v1\/user_groups.*/, (route) => {
    route.fulfill({ status: 200, json: [MOCK_GROUP] });
  });

  await page.route(/.*\/rest\/v1\/group_members.*/, (route) => {
    const url = route.request().url();
    if (url.includes(`user_id=eq.${TEST_USER_ID}`)) {
      return route.fulfill({
        status: 200,
        json: [{ group_id: GROUP_ID, user_id: TEST_USER_ID, role, joined_at: "2026-06-01T00:00:00Z" }],
      });
    }
    route.fulfill({ status: 200, json: [] });
  });

  await page.route(/.*\/rest\/v1\/categories.*/, (route) => {
    route.fulfill({ status: 200, json: MOCK_CATEGORIES });
  });

  await page.route(/.*\/rest\/v1\/transactions_with_category.*/, (route) => {
    route.fulfill({ status: 200, json: [SHARED_TX] });
  });

  await page.route(/.*\/rest\/v1\/plan_transaction_links.*/, (route) => {
    route.fulfill({ status: 200, json: [] });
  });
}

test.describe("group roles", () => {
  test("member sees peer shared transaction as readonly", async ({ page }) => {
    await setupGroupRoleMocks(page, "member");
    await page.goto("/transactions?group=all");

    await page.locator("tbody tr").first().click();
    await expect(page.getByText(/Tylko do odczytu/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Edytuj" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Usuń" })).not.toBeVisible();
  });

  test("co-owner can edit peer shared transaction", async ({ page }) => {
    await setupGroupRoleMocks(page, "co_owner");
    await page.goto("/transactions?group=all");

    await page.locator("tbody tr").first().click();
    await expect(page.getByRole("button", { name: "Edytuj" })).toBeVisible();
  });

  test("member sees readonly hint on shared save plan but can open settle", async ({ page }) => {
    await setupGroupRoleMocks(page, "member");

    await page.route(/.*\/rest\/v1\/plans.*id=eq\.plan-shared-save.*/, (route) => {
      route.fulfill({ status: 200, json: SHARED_SAVE_PLAN });
    });

    await page.route(/.*\/rest\/v1\/plans(?!.*id=eq)/, (route) => {
      if (route.request().url().includes("id=in.")) {
        return route.fulfill({ status: 200, json: [SHARED_SAVE_PLAN] });
      }
      return route.fulfill({ status: 200, json: [SHARED_SAVE_PLAN] });
    });

    await page.goto(`/plans/${SHARED_PLAN_ID}`);

    await expect(page.getByText(/Edycja tylko dla właściciela planu/)).toBeVisible();
    await expect(page.getByRole("link", { name: "Powiąż wpłaty" })).toBeVisible();
  });
});
