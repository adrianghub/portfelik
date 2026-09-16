import { expect, test } from "@playwright/test";
import { TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

const PLAN = {
  id: "plan-match-1",
  name: "Wakacje",
  kind: "save",
  user_id: TEST_USER_ID,
  group_id: null,
  category_id: "cat-1",
  budget_amount: null,
  target_amount: 5000,
  start_date: "2026-01-01",
  end_date: "2027-12-31",
  status: "active",
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:00:00Z",
};

const TX = {
  id: "tx-match-1",
  date: "2026-09-10",
  description: "Hotel wakacje",
  amount: 420,
  type: "expense",
  status: "paid",
  category_id: "cat-1",
  category_name: "Jedzenie",
  user_id: TEST_USER_ID,
  group_id: null,
  is_recurring: false,
  currency: "PLN",
  created_at: "2026-09-10T10:00:00Z",
  updated_at: "2026-09-10T10:00:00Z",
};

test("kokpit offers Powiąż and Pomiń for a high-rank plan match", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  await page.route("**/rest/v1/plans**", (route) => {
    const url = route.request().url();
    if (url.includes("id=eq.plan-match-1")) {
      return route.fulfill({ status: 200, json: PLAN });
    }
    return route.fulfill({ status: 200, json: [PLAN] });
  });
  await page.route("**/rest/v1/transactions_with_category**", (route) =>
    route.fulfill({ status: 200, json: [TX] })
  );
  await page.route("**/rest/v1/plan_transaction_links**", (route) =>
    route.fulfill({ status: 200, json: [] })
  );
  await page.route("**/rest/v1/plan_settlement_dismissals**", (route) =>
    route.fulfill({ status: 200, json: [] })
  );

  await page.goto("/dashboard");

  const panel = page.getByRole("region", { name: "Do sprawdzenia" });
  await expect(panel.getByText("Hotel wakacje")).toBeVisible({ timeout: 10_000 });
  await expect(panel.getByRole("link", { name: "Wakacje", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Powiąż" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Pomiń" })).toBeVisible();
  await expect(panel.getByText(/dopasowanie|Może pasować|Słabe trafienie/)).toHaveCount(0);
});
