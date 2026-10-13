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
    await expect(balance.getByTestId("cockpit-chart")).toBeVisible();
    await expect(balance.getByText("Odtworzone")).toHaveCount(0);
    await expect(balance.getByTestId("cockpit-reconstructed")).toHaveCount(0);
    await expect(balance.getByTestId("confirmed-balance-dot")).toHaveCount(0);
    await expect(balance.getByTestId("analysis-balance-source")).toHaveText(
      "Na podstawie historii transakcji"
    );
    await expect(balance.getByTestId("analysis-confirmed-caption")).toHaveText(
      "Saldo potwierdzone"
    );
    await expect(page.getByTestId("analysis-flows")).toContainText(/1\D?000,00/);
    mkdirSync(ARTIFACTS, { recursive: true });
    await balance.screenshot({ path: `${ARTIFACTS}/analysis-balance-history.png` });

    const helpButton = balance.getByRole("button", { name: "Jak liczymy to saldo" });
    await helpButton.focus();
    const help = page.getByRole("tooltip");
    await expect(help).toContainText("różnić od salda bankowego");
    await expect(help).toContainText("koniec dnia");
    await help.screenshot({ path: `${ARTIFACTS}/analysis-balance-help.png` });
    await page.keyboard.press("Escape");

    const chart = balance.getByTestId("cockpit-chart");
    const box = await chart.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width * 0.7, box!.y + 70);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.92, box!.y + 70, { steps: 8 });
    await expect(balance.getByTestId("cockpit-scrub")).toContainText("Saldo potwierdzone");
    await page.mouse.up();
  });

  test("keeps history, a legacy balance, and the month-end forecast distinct", async ({ page }) => {
    const at = new Date(Date.now() - 5 * 60 * 1000);
    const today = at.toISOString().slice(0, 10);
    test.skip(today !== "2026-10-13", "the checked amounts use 13 October 2026");
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
        json: route.request().url().includes("is_recurring=eq.true")
          ? []
          : [
              row("jul", "2026-07-31", 1500, "income"),
              row("aug", "2026-08-31", 700, "expense"),
              row("sep", "2026-09-30", 1200, "income"),
              row("oct", today, 1000, "income"),
              {
                ...row("plan", "2026-10-21", 500, "expense"),
                status: "upcoming",
              },
            ],
      })
    );

    await page.goto("/analysis");
    const balance = page.getByTestId("analysis-balance");
    const chart = balance.getByTestId("cockpit-chart");
    await expect(chart).toBeVisible();

    async function scrub(ratio: number) {
      const box = await chart.boundingBox();
      expect(box).toBeTruthy();
      await page.mouse.move(box!.x + box!.width * 0.5, box!.y + 70);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width * ratio, box!.y + 70, { steps: 12 });
      return balance.getByTestId("cockpit-scrub");
    }

    await expect(balance.getByText("30 lip")).toBeVisible();
    const wholeLeft = await scrub(0);
    await expect(wholeLeft).toContainText(/9\D?000,00/);
    await expect(wholeLeft).not.toContainText("Prognoza");
    await page.mouse.up();
    const wholeRight = await scrub(0.98);
    await expect(wholeRight).toContainText("Saldo potwierdzone");
    await expect(wholeRight).toContainText(/12\D?000,00/);
    await page.mouse.up();
    mkdirSync(ARTIFACTS, { recursive: true });
    await balance.screenshot({ path: `${ARTIFACTS}/analysis-span-all.png` });

    await page.getByRole("tab", { name: "Ten rok" }).click();
    await expect(balance.getByText("Prognoza", { exact: true })).toBeVisible();
    await expect(balance.getByText("Historia salda", { exact: true })).toBeVisible();
    await expect(balance.getByText("30 lip")).toBeVisible();
    const yearLeft = await scrub(0);
    await expect(yearLeft).toContainText(/9\D?000,00/);
    await page.mouse.up();
    const yearRight = await scrub(0.98);
    await expect(yearRight).toContainText("Prognoza");
    await expect(yearRight).toContainText(/11\D?500,00/);
    await page.mouse.up();
    await balance.screenshot({ path: `${ARTIFACTS}/analysis-span-year.png` });

    await page.getByRole("tab", { name: "Ten miesiąc" }).click();
    await expect(balance.getByText("Prognoza", { exact: true })).toBeVisible();
    const monthLeft = await scrub(0.02);
    await expect(monthLeft).toContainText(/11\D?000,00/);
    await expect(monthLeft).not.toContainText("Prognoza");
    await page.mouse.up();
    const monthRight = await scrub(0.98);
    await expect(monthRight).toContainText("Prognoza");
    await expect(monthRight).toContainText(/11\D?500,00/);
    await page.mouse.up();
    const dashes = await chart
      .locator("path")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("stroke-dasharray")).filter((value) => value != null)
      );
    expect(dashes).toContain("6 5");
    expect(dashes).not.toContain("1.5 4");
    await balance.screenshot({ path: `${ARTIFACTS}/analysis-span-month.png` });

    await page.getByRole("tab", { name: "7 dni" }).click();
    await expect(chart).toBeVisible();
    await expect(balance.getByText("Prognoza", { exact: true })).toHaveCount(0);
    const weekLeft = await scrub(0.02);
    await expect(weekLeft).toContainText(/11\D?000,00/);
    await page.mouse.up();
    const weekRight = await scrub(0.98);
    await expect(weekRight).toContainText("Saldo potwierdzone");
    await expect(weekRight).toContainText(/12\D?000,00/);
    await page.mouse.up();
    await balance.screenshot({ path: `${ARTIFACTS}/analysis-span-week.png` });

    await page.goto("/dashboard");
    const cockpit = page.getByTestId("dashboard-cash-position");
    await expect(cockpit.getByTestId("cockpit-balance")).toContainText(/12\D?000,00/);
    await expect(cockpit.getByTestId("cockpit-forecast")).toContainText(/11\D?500,00/);
    await cockpit.screenshot({ path: `${ARTIFACTS}/cockpit-matches-analysis-month.png` });
  });

  test("leaves an unedited start-of-day balance unchanged on Kokpit and Transakcje", async ({
    page,
  }) => {
    const at = new Date(Date.now() - 5 * 60 * 1000);
    const today = at.toISOString().slice(0, 10);
    test.skip(today !== "2026-10-13", "the checked amounts use 13 October 2026");
    await page.clock.setFixedTime(at);
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
    await page.route("**/rest/v1/cash_positions**", (route) => {
      if (route.request().method() !== "GET") {
        return route.fulfill({ status: 500, json: { message: "legacy row must not be saved" } });
      }
      return route.fulfill({
        json: {
          id: "cash-legacy",
          owner_id: TEST_USER_ID,
          group_id: null,
          opening_amount: 10000,
          as_of_date: "2026-09-01",
          balance_semantics: "start_of_day",
          created_at: "2026-06-01T09:00:00Z",
          updated_at: "2026-06-01T09:00:00Z",
        },
      });
    });
    await page.route("**/rest/v1/transactions_with_category**", (route) =>
      route.fulfill({
        json: [
          row("same-day", "2026-09-01", 100, "expense"),
          row("october", "2026-10-02", 400, "expense"),
          { ...row("rent", "2026-10-20", 250, "expense"), status: "upcoming" },
        ],
      })
    );

    await page.goto("/dashboard");
    const cockpit = page.getByTestId("dashboard-cash-position");
    await expect(cockpit.getByTestId("cockpit-balance")).toContainText(/9\D?500,00/);
    await expect(cockpit.getByTestId("cockpit-forecast")).toContainText(/9\D?250,00/);
    mkdirSync(ARTIFACTS, { recursive: true });
    await cockpit.screenshot({ path: `${ARTIFACTS}/legacy-cockpit-balance.png` });

    await page.goto("/transactions?group=own");
    await page.getByRole("button", { name: "Więcej akcji" }).click();
    await page.getByRole("menuitem", { name: "Potwierdź saldo" }).click();
    const sheet = page.getByRole("dialog", { name: "Potwierdź saldo" });
    await expect(sheet.getByText(/na początku wybranego dnia/)).toBeVisible();
    await expect(sheet.locator("#cash-end-of-day")).not.toBeChecked();
    await expect(sheet.getByText(/9\D?500,00/)).toBeVisible();
    await sheet.screenshot({ path: `${ARTIFACTS}/legacy-transactions-balance.png` });
    await sheet.getByRole("button", { name: "Anuluj" }).click();
    await expect(sheet).toHaveCount(0);

    await page.goto("/analysis?span=month");
    const balance = page.getByTestId("analysis-balance");
    const chart = balance.getByTestId("cockpit-chart");
    await expect(chart).toBeVisible();
    const box = await chart.boundingBox();
    expect(box).toBeTruthy();
    await page.mouse.move(box!.x + box!.width * 0.2, box!.y + 70);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.3, box!.y + 70, { steps: 8 });
    await expect(balance.getByTestId("cockpit-scrub")).not.toContainText("Prognoza");
    await page.mouse.up();
    await page.mouse.move(box!.x + box!.width * 0.7, box!.y + 70);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.96, box!.y + 70, { steps: 8 });
    const forecast = balance.getByTestId("cockpit-scrub");
    await expect(forecast).toContainText("Prognoza");
    await expect(forecast).toContainText(/9\D?250,00/);
    await page.mouse.up();
  });
});
