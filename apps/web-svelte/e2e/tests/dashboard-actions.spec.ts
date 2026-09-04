import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const OVERDUE_TX = {
  id: "tx-overdue-1",
  description: "Zaległa rata",
  amount: 100,
  type: "expense",
  status: "overdue",
  date: daysAgoIso(10),
  category_id: "cat-1",
  category_name: "Inne wydatki",
  user_id: TEST_USER_ID,
  group_id: null,
};

async function mockTransactions(page: Page, rows: unknown[]): Promise<void> {
  await page.route("**/rest/v1/transactions_with_category**", (route) =>
    route.fulfill({ status: 200, json: rows })
  );
}

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await mockTransactions(page, [OVERDUE_TX]);
});

test("shows overdue scale and deep-links to the exact resolution view", async ({ page }) => {
  await page.goto("/dashboard");

  const panel = page.getByRole("region", { name: "Do zrobienia teraz" });
  const action = panel.getByRole("link", { name: /Zaległe płatności/ });
  await expect(action).toBeVisible();
  await expect(action).toContainText("100,00 zł");
  await expect(action).toContainText(/Najstarsza od \d+ dni/);
  await expect(panel.getByRole("button", { name: "Pomiń" })).toHaveCount(0);

  const href = await action.getAttribute("href");
  expect(href).not.toBeNull();
  const target = new URL(href!, "http://localhost");
  expect(target.pathname).toBe("/transactions");
  expect(target.searchParams.get("status")).toBe("overdue");
  expect(target.searchParams.get("group")).toBe("own");
  expect(target.searchParams.get("startDate")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(target.searchParams.get("endDate")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("keeps an old overdue payment actionable outside the chart history", async ({ page }) => {
  const oldOverdue = { ...OVERDUE_TX, id: "tx-overdue-old", date: daysAgoIso(240) };
  await page.route("**/rest/v1/transactions_with_category**", (route) => {
    const url = route.request().url();
    return route.fulfill({
      status: 200,
      json: url.includes("status=eq.overdue") ? [oldOverdue] : [],
    });
  });

  await page.goto("/dashboard");

  const action = page
    .getByRole("region", { name: "Do zrobienia teraz" })
    .getByRole("link", { name: /Zaległe płatności/ });
  await expect(action).toBeVisible();
  await expect(action).toContainText(/Najstarsza od 240 dni/);
});

test("plan progress respects the dashboard group scope", async ({ page }) => {
  const privatePlan = {
    id: "plan-private",
    name: "Prywatny cel",
    kind: "save",
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    budget_amount: null,
    target_amount: 1000,
    start_date: "2026-01-01",
    end_date: "2027-12-31",
    status: "active",
  };
  const groupPlan = {
    ...privatePlan,
    id: "plan-group",
    name: "Cel grupowy",
    group_id: "group-1",
  };
  await mockTransactions(page, []);
  await page.route("**/rest/v1/plans**", (route) =>
    route.fulfill({ status: 200, json: [privatePlan, groupPlan] })
  );

  await page.goto("/dashboard?group=group-1");

  const panel = page.getByRole("region", { name: "Postęp planów" });
  await expect(panel.getByText("Cel grupowy")).toBeVisible();
  await expect(panel.getByText("Prywatny cel")).toHaveCount(0);
  await expect(panel.getByRole("link", { name: /Cel grupowy/ })).toHaveAttribute(
    "href",
    /group=group-1/
  );
});

test("does not render an attention panel when there is no concrete action", async ({ page }) => {
  await mockTransactions(page, []);
  await page.goto("/dashboard");

  await expect(page.getByRole("region", { name: "Do zrobienia teraz" })).toHaveCount(0);
  await expect(page.getByText("Nic nie wymaga uwagi")).toHaveCount(0);
});

test("preserves the selected scope in an overdue deep link", async ({ page }) => {
  await page.goto("/dashboard?group=all");

  const action = page
    .getByRole("region", { name: "Do zrobienia teraz" })
    .getByRole("link", { name: /Zaległe płatności/ });
  const href = await action.getAttribute("href");
  expect(new URL(href!, "http://localhost").searchParams.get("group")).toBe("all");
});

test("shows an explicit error instead of a healthy empty state", async ({ page }) => {
  await mockTransactions(page, []);
  await page.route("**/rest/v1/plans**", (route) =>
    route.fulfill({ status: 500, json: { message: "planned failure" } })
  );
  await page.goto("/dashboard");

  const panel = page.getByRole("region", { name: "Do zrobienia teraz" });
  await expect(panel).toContainText("Nie udało się sprawdzić wszystkich działań.");
});
