import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";
import { TEST_USER_ID } from "../helpers/fixtures";

const ARTIFACTS = "/opt/cursor/artifacts";

function row(id: string, date: string, amount: number, type: "income" | "expense") {
  return {
    id,
    date,
    description: id,
    amount,
    type,
    status: "paid",
    currency: "PLN",
    user_id: TEST_USER_ID,
    group_id: null,
    category_id: null,
    category_name: null,
    is_recurring: false,
  };
}

function frozenToday(): { at: Date; today: string; earlier: string } {
  const at = new Date(Date.now() - 5 * 60 * 1000);
  const today = at.toISOString().slice(0, 10);
  const earlier = new Date(at.getTime() - 40 * 86_400_000).toISOString().slice(0, 10);
  return { at, today, earlier };
}

test.describe("confirmed balance", () => {
  test.use({ viewport: { width: 1280, height: 800 }, colorScheme: "dark" });

  test("saves a new balance as the end of the chosen day", async ({ page }) => {
    const { at, today } = frozenToday();
    await page.clock.setFixedTime(at);
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
    let saved: { balance_semantics?: string; opening_amount?: number; as_of_date?: string } | null =
      null;
    await page.route("**/rest/v1/cash_positions**", async (route) => {
      if (route.request().method() === "POST") {
        const payload = route.request().postDataJSON();
        saved = Array.isArray(payload) ? payload[0] : payload;
        await route.fulfill({
          json: {
            id: "cash-1",
            owner_id: TEST_USER_ID,
            group_id: null,
            created_at: "2026-10-13T09:00:00Z",
            updated_at: "2026-10-13T09:00:00Z",
            ...saved,
          },
        });
        return;
      }
      await route.fulfill({ json: null });
    });
    await page.route("**/rest/v1/transactions_with_category**", (route) =>
      route.fulfill({ json: [row("paid", today, 20, "expense")] })
    );

    await page.goto("/transactions?group=own");
    await page.getByRole("button", { name: "Potwierdź saldo", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Potwierdź saldo" });
    await expect(sheet.getByText(/na koniec dnia/)).toBeVisible();
    await sheet.locator("#cash-opening-amount").fill("12000");
    await sheet.getByRole("button", { name: "Zapisz", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    expect(saved).toMatchObject({
      opening_amount: 12000,
      as_of_date: today,
      balance_semantics: "end_of_day",
    });
  });

  test("shows reconstructed history behind a confirmed balance", async ({ page }) => {
    const { at, today, earlier } = frozenToday();
    await page.clock.setFixedTime(at);
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
    await page.route("**/rest/v1/cash_positions**", (route) =>
      route.fulfill({
        json: {
          id: "cash-1",
          owner_id: TEST_USER_ID,
          group_id: null,
          opening_amount: 12000,
          as_of_date: today,
          balance_semantics: "end_of_day",
          created_at: "2026-10-13T09:00:00Z",
          updated_at: "2026-10-13T09:00:00Z",
        },
      })
    );
    await page.route("**/rest/v1/transactions_with_category**", (route) =>
      route.fulfill({
        json: [row("old", earlier, 400, "expense"), row("today", today, 1000, "income")],
      })
    );

    await page.goto("/analysis");
    const balance = page.getByTestId("analysis-balance");
    await expect(balance.getByTestId("analysis-reconstructed-note")).toBeVisible();
    await expect(balance.getByTestId("cockpit-chart")).toBeVisible();
    await expect(balance.getByTestId("confirmed-balance-dot")).toBeVisible();
    await expect(page.getByTestId("analysis-flows")).toContainText(/1\D?000,00/);
    mkdirSync(ARTIFACTS, { recursive: true });
    await balance.screenshot({ path: `${ARTIFACTS}/analysis-reconstructed-balance.png` });
  });
});
