import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

const OVERDUE_ACTION = /zaległ/i;

type DismissRow = { action_key: string; dismissed_until: string | null };

async function mockDismissals(page: Page): Promise<void> {
  const dismissed: DismissRow[] = [];
  await page.route("**/rest/v1/action_dismissals**", async (route: Route) => {
    const method = route.request().method();
    if (method === "POST") {
      const body = route.request().postDataJSON() as DismissRow | DismissRow[];
      const rows = Array.isArray(body) ? body : [body];
      for (const r of rows) {
        if (!dismissed.some((d) => d.action_key === r.action_key)) {
          dismissed.push({ action_key: r.action_key, dismissed_until: r.dismissed_until ?? null });
        }
      }
      return route.fulfill({ status: 201, json: dismissed });
    }
    if (method === "DELETE") {
      const match = route.request().url().match(/action_key=eq\.([^&]+)/);
      if (match) {
        const key = decodeURIComponent(match[1]);
        const idx = dismissed.findIndex((d) => d.action_key === key);
        if (idx >= 0) dismissed.splice(idx, 1);
      }
      return route.fulfill({ status: 200, json: [] });
    }
    return route.fulfill({ status: 200, json: dismissed });
  });
}

test.beforeEach(async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await mockDismissals(page);

  await page.route("**/rest/v1/transactions_with_category**", (route) => {
    const url = route.request().url();
    if (url.includes("status=eq.overdue")) {
      return route.fulfill({
        status: 200,
        json: [
          {
            id: "tx-overdue-1",
            description: "Zaległa rata",
            amount: 100,
            type: "expense",
            status: "overdue",
            date: "2026-06-01",
            category_id: "cat-1",
            category_name: "Inne wydatki",
            user_id: "00000000-0000-0000-0000-000000000001",
            group_id: null,
          },
        ],
      });
    }
    return route.fulfill({ status: 200, json: [] });
  });
});

test("surfaces a deterministic action that deep-links to its resolution", async ({ page }) => {
  await page.goto("/dashboard");

  const action = page.getByRole("link", { name: OVERDUE_ACTION });
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute("href", "/transactions?status=overdue");
});

test("dismissing an action persists across reload", async ({ page }) => {
  await page.goto("/dashboard");

  const action = page.getByRole("link", { name: OVERDUE_ACTION });
  await expect(action).toBeVisible();

  const row = page.locator("li").filter({ hasText: OVERDUE_ACTION });
  await row.getByRole("button", { name: "Pomiń" }).click();
  await expect(page.getByRole("link", { name: OVERDUE_ACTION })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("link", { name: OVERDUE_ACTION })).toHaveCount(0);
});
