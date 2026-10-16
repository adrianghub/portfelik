import { expect, test } from "@playwright/test";
import { MOCK_NEW_TRANSACTION, TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`analysis flow filters at ${viewport.width}px`, () => {
    test.use({ viewport });
    test("filters several categories, preserves the selected balance day and drills into matching booked rows", async ({
      page,
    }, testInfo) => {
      await page.clock.setFixedTime(new Date("2026-10-13T12:00:00Z"));
      await injectFakeSession(page);
      await mockSupabaseAPI(page);
      const rows = [
        {
          ...MOCK_NEW_TRANSACTION,
          id: "prior",
          description: "Poprzedni lunch",
          date: "2026-09-20",
          amount: 40,
        },
        {
          ...MOCK_NEW_TRANSACTION,
          id: "food",
          description: "Lunch test",
          date: "2026-10-01",
          amount: 100,
        },
        {
          ...MOCK_NEW_TRANSACTION,
          id: "transport",
          description: "Bilet test",
          date: "2026-10-02",
          amount: 200,
          category_id: "cat-2",
          category_name: "Transport",
        },
        {
          ...MOCK_NEW_TRANSACTION,
          id: "salary",
          description: "Pensja test",
          date: "2026-10-03",
          amount: 1000,
          type: "income",
          category_id: "cat-salary",
          category_name: "Wypłata",
        },
      ];
      rows.push({
        ...rows[1],
        id: "foreign",
        description: "Lunch USD",
        amount: 500,
        currency: "USD",
      });
      await page.route("**/rest/v1/cash_positions**", (route) =>
        route.fulfill({
          json: {
            owner_id: TEST_USER_ID,
            group_id: null,
            opening_amount: 10000,
            as_of_date: "2026-10-13",
            balance_semantics: "end_of_day",
          },
        })
      );
      await page.route("**/rest/v1/transactions_with_category**", (route) => {
        const params = new URL(route.request().url()).searchParams;
        const from = params
          .getAll("date")
          .find((value) => value.startsWith("gte."))
          ?.slice(4, 14);
        const to = params
          .getAll("date")
          .find((value) => value.startsWith("lt."))
          ?.slice(3, 13);
        const category = params.get("category_id")?.slice(3);
        return route.fulfill({
          json: rows.filter(
            (row) =>
              (!from || row.date >= from) &&
              (!to || row.date < to) &&
              (!category || row.category_id === category) &&
              params.get("is_recurring") !== "eq.true"
          ),
        });
      });
      await page.goto("/analysis?span=custom&from=2026-10-01&to=2026-10-13");
      await expect(page.getByTestId("analysis-income")).toContainText(/1\D?000,00/);
      await expect(page.getByTestId("analysis-expense")).toContainText("300,00");
      await expect(page.getByTestId("analysis-balance-change")).toContainText("700,00");
      await page
        .getByTestId("analysis-balance")
        .getByRole("button", { name: "Saldo na dzień", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "Saldo na dzień", exact: true })
        .locator('[data-date="2026-10-04"]')
        .click();
      await page.getByText("Kategorie i grupowanie", { exact: true }).click();
      const filters = page.getByTestId("analysis-category-filters");
      await filters.getByRole("button", { name: "Jedzenie", exact: true }).click();
      await expect(page.getByTestId("analysis-expense")).toContainText("100,00");
      await expect(page.getByTestId("analysis-day-balance")).toContainText(/10\D?000,00/);
      await expect(
        page
          .getByTestId("analysis-balance")
          .getByRole("button", { name: "Saldo na dzień", exact: true })
      ).toContainText("04.10.2026");
      await filters.getByRole("button", { name: "Transport", exact: true }).click();
      await expect(page.getByTestId("analysis-expense")).toContainText("300,00");
      await expect(page.getByTestId("analysis-income")).toContainText("0,00");
      await page.getByRole("combobox", { name: "Grupuj przepływy" }).selectOption("week");
      await expect(page.getByTestId("analysis-bar-link")).toHaveCount(2);
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
        )
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("analysis-flow-filters.png"),
        fullPage: true,
      });
      await page.getByTestId("analysis-bar-link").first().click();
      await expect(page).toHaveURL(/startDate=2026-10-01/);
      await expect(page).toHaveURL(/endDate=2026-10-07/);
      await expect(page).toHaveURL(/categoryIds=cat-1%2Ccat-2/);
      await expect(
        page.getByText("Lunch test", { exact: true }).filter({ visible: true })
      ).toBeVisible();
      await expect(
        page.getByText("Bilet test", { exact: true }).filter({ visible: true })
      ).toBeVisible();
      await expect(page.getByText("Pensja test", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Lunch USD", { exact: true })).toHaveCount(0);
      await page.goBack();
      await expect(filters.getByRole("button", { name: "Jedzenie", exact: true })).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      await filters.getByRole("button", { name: "Wszystkie kategorie", exact: true }).click();
      await expect(page.getByTestId("analysis-income")).toContainText(/1\D?000,00/);
    });
  });
}
