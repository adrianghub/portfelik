import { expect, test } from "@playwright/test";
import { MOCK_NEW_TRANSACTION, TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`historical analysis at ${viewport.width}px`, () => {
    test.use({ viewport });
    test("explores a custom past range without forecasting or inventing January history", async ({
      page,
    }, testInfo) => {
      await injectFakeSession(page);
      await mockSupabaseAPI(page);
      const today = new Date().toISOString().slice(0, 10);
      await page.route("**/rest/v1/cash_positions**", (route) =>
        route.fulfill({
          json: {
            owner_id: TEST_USER_ID,
            group_id: null,
            opening_amount: 10000,
            as_of_date: today,
            balance_semantics: "end_of_day",
          },
        })
      );
      await page.route("**/rest/v1/transactions_with_category**", (route) =>
        route.fulfill({
          json: [
            { ...MOCK_NEW_TRANSACTION, id: "old", date: "2026-07-31", amount: 100 },
            { ...MOCK_NEW_TRANSACTION, id: "sep", date: "2026-09-10", amount: 25.55 },
            { ...MOCK_NEW_TRANSACTION, id: "today", date: today, type: "income", amount: 1000 },
            {
              ...MOCK_NEW_TRANSACTION,
              id: "scheduled",
              date: "2026-09-15",
              status: "upcoming",
              amount: 5000,
            },
          ],
        })
      );
      await page.goto("/analysis?span=custom&from=2026-01-01&to=2026-09-30");
      const balance = page.getByTestId("analysis-balance");
      await expect(balance.getByTestId("cockpit-chart")).toBeVisible();
      await expect(balance.getByText("30 lip", { exact: true })).toBeVisible();
      await expect(balance.getByText("Prognoza", { exact: true })).toHaveCount(0);
      await expect(page.getByTestId("analysis-day-balance")).toContainText(/9\D?000,00/);
      await balance.getByRole("button", { name: "Saldo na dzień", exact: true }).click();
      const picker = page.getByRole("dialog", { name: "Saldo na dzień", exact: true });
      await picker.locator('[data-date="2026-09-15"]').click();
      await expect(page.getByTestId("analysis-day-balance")).toContainText(/9\D?000,00/);
      await page.getByRole("tab", { name: "30 dni", exact: true }).click();
      await expect(page.getByTestId("analysis-day-balance")).toContainText(/10\D?000,00/);
      await expect(page.getByTestId("analysis-bars")).toContainText("Dni");
      await page.screenshot({
        path: testInfo.outputPath("historical-analysis.png"),
        fullPage: true,
      });
    });
  });
}
