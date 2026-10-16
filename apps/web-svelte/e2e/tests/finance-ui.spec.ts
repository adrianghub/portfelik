import { expect, test } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";
import { MOCK_NEW_TRANSACTION, TEST_USER_ID } from "../helpers/fixtures";

for (const width of [390, 1280]) {
  test.describe(`finance exploration at ${width}px`, () => {
    test.use({ viewport: { width, height: 700 } });
    test.beforeEach(async ({ page }) => {
      await page.clock.setFixedTime(new Date("2026-10-16T10:00:00Z"));
      await injectFakeSession(page);
      await mockSupabaseAPI(page);
      await page.addInitScript(() => localStorage.setItem("push_prompted_at", String(Date.now())));
      await page.route("**/rest/v1/cash_positions**", (route) =>
        route.fulfill({
          json: {
            owner_id: TEST_USER_ID,
            group_id: null,
            opening_amount: 10000,
            as_of_date: "2026-10-01",
            balance_semantics: "end_of_day",
          },
        })
      );
      await page.route("**/rest/v1/transactions_with_category**", (route) =>
        route.fulfill({
          json: route.request().url().includes("is_recurring=eq.true")
            ? []
            : [
                {
                  ...MOCK_NEW_TRANSACTION,
                  id: "salary-ui",
                  type: "income",
                  amount: 5000,
                  description: "Pensja",
                  status: "upcoming",
                  date: "2026-10-26",
                },
                {
                  ...MOCK_NEW_TRANSACTION,
                  id: "hotel-ui",
                  type: "expense",
                  amount: 2000,
                  description: "Nocleg",
                  status: "upcoming",
                  date: "2026-11-03",
                },
              ],
        })
      );
      await page.route("**/rest/v1/plans**", (route) => route.fulfill({ json: [] }));
    });

    test("opens forecast by default, shows dates on hover and keeps the viewport when selecting a month", async ({
      page,
    }) => {
      await page.goto("/analysis");
      await expect(page.getByRole("tab", { name: "Prognoza", exact: true })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      const chart = page.getByTestId("cockpit-chart");
      await chart.scrollIntoViewIfNeeded();
      const box = await chart.boundingBox();
      await chart.hover({ position: { x: box!.width * 0.75, y: box!.height / 2 } });
      await expect(page.getByTestId("cockpit-scrub")).toContainText(/\d{2}\.\d{2}\.2026/);
      await expect(page.getByTestId("cockpit-scrub")).toContainText("Prognoza");
      const bar = page.getByTestId("analysis-forecast-bar-link").last();
      await bar.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(100);
      await bar.click();
      await expect(page.getByTestId("analysis-forecast-month-detail")).toBeAttached();
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 50);
      const detailLink = page.getByTestId("analysis-forecast-month-detail").getByRole("link");
      await detailLink.scrollIntoViewIfNeeded();
      const returnY = await page.evaluate(() => window.scrollY);
      const returnUrl = page.url();
      await detailLink.click();
      await page.getByTestId("back-to-analysis").click();
      await expect(page).toHaveURL(returnUrl);
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(returnY - 50);
    });

    test("maps a status set to a readable filter without surfacing the PLN calculation context", async ({
      page,
    }) => {
      await page.goto(
        "/transactions?startDate=2026-10-01&endDate=2026-11-30&currency=PLN&status=overdue,paid,upcoming"
      );
      await expect(page.getByText("Zrealizowane i zaplanowane", { exact: true })).toBeVisible();
      await expect(page.getByText("overdue,paid,upcoming", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /^Waluta: PLN/ })).toHaveCount(0);
      const summary = page.getByTestId("transaction-summary-cards");
      await expect(summary).toContainText("Zaplanowane wpływy");
      await summary.getByRole("button", { name: /Zaplanowane wpływy/ }).click();
      await expect(page).toHaveURL(/status=upcoming%2Coverdue/);
      await expect(page.getByText("Zaplanowane i zaległe", { exact: true })).toBeVisible();
    });
  });
}
