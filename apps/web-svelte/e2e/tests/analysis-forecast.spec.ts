import { expect, test } from "@playwright/test";
import { MOCK_NEW_TRANSACTION, TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`analysis forecast at ${viewport.width}px`, () => {
    test.use({ viewport });
    test("includes salary cycles, respects a skipped December and agrees with Kokpit", async ({
      page,
    }, testInfo) => {
      await page.clock.setFixedTime(new Date("2026-10-13T12:00:00Z"));
      await injectFakeSession(page);
      await mockSupabaseAPI(page);
      const salary = {
        ...MOCK_NEW_TRANSACTION,
        id: "salary",
        type: "income",
        date: "2026-06-26",
        amount: 13076.57,
        status: "paid",
        is_recurring: true,
        recurring_day: 26,
        recurrence_frequency: "monthly",
        recurrence_interval: 1,
        recurrence_end_date: null,
      };
      const rent = {
        ...salary,
        id: "rent",
        type: "expense",
        date: "2026-06-15",
        amount: 1500,
        recurring_day: 15,
      };
      const november = {
        ...salary,
        id: "salary-nov",
        status: "upcoming",
        date: "2026-11-26",
        is_recurring: false,
        recurring_template_id: "salary",
        recurring_occurrence_date: "2026-11-26",
      };
      await page.route("**/rest/v1/cash_positions**", (route) =>
        route.fulfill({
          json: {
            owner_id: TEST_USER_ID,
            group_id: null,
            opening_amount: 9462.34,
            as_of_date: "2026-10-13",
            balance_semantics: "end_of_day",
          },
        })
      );
      await page.route("**/rest/v1/transactions_with_category**", (route) =>
        route.fulfill({
          json: route.request().url().includes("is_recurring=eq.true")
            ? [salary, rent]
            : [salary, rent, november],
        })
      );
      await page.route("**/rest/v1/recurring_occurrence_skips**", (route) =>
        route.fulfill({
          json: [{ recurring_template_id: "salary", occurrence_date: "2026-12-26" }],
        })
      );
      await page.route("**/rest/v1/plans**", (route) => route.fulfill({ json: [] }));
      await page.goto("/analysis?mode=forecast");
      const forecast = page.getByTestId("analysis-forecast");
      await expect(forecast.getByTestId("analysis-forecast-today")).toContainText(/9\D?462,34/);
      await expect(forecast.getByTestId("analysis-forecast-final")).toContainText(/31\D?115,48/);
      await expect(forecast.getByTestId("analysis-forecast-income")).toContainText(/26\D?153,14/);
      await expect(forecast).toContainText("Nie obejmuje przyszłych, niezaplanowanych wydatków");
      await page.getByRole("tab", { name: "Do końca miesiąca", exact: true }).click();
      await expect(forecast.getByTestId("analysis-forecast-final")).toContainText(/21\D?038,91/);
      await page.goto("/dashboard");
      await expect(page.getByTestId("cockpit-forecast")).toContainText(/21\D?038,91/);
      await page.goto("/analysis?mode=forecast&horizon=12months");
      await expect(forecast.getByTestId("analysis-forecast-final")).toContainText(/146\D?881,18/);
      await forecast.getByRole("button", { name: "Prognoza na dzień", exact: true }).click();
      const picker = page.getByRole("dialog", { name: "Prognoza na dzień", exact: true });
      await picker.getByRole("spinbutton").fill("2026");
      await picker.getByRole("combobox").selectOption("10");
      await expect(picker.locator('[data-date="2026-10-01"]')).toHaveAttribute(
        "data-disabled",
        ""
      );
      await picker.locator('[data-date="2026-10-26"]').click();
      await expect(forecast.getByTestId("analysis-forecast-day")).toContainText(/21\D?038,91/);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath("analysis-forecast.png"), fullPage: true });
      await page.getByRole("tab", { name: "Historia", exact: true }).click();
      await expect(page.getByTestId("analysis-forecast")).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "30 dni", exact: true })).toBeVisible();
    });
  });
}
