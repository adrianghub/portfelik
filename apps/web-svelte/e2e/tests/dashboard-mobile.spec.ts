import { test, expect } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";
import { isoDaysFromToday, TEST_USER_ID } from "../helpers/fixtures";

function currentCalendarMonthRange(): { start: string; end: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  return { start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2, "0")}` };
}

test.describe("dashboard mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: "Zobacz więcej" })).toBeVisible({
      timeout: 10000,
    });

    const overflowAtTop = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflowAtTop).toBe(false);

    await page.getByRole("button", { name: "Zobacz więcej" }).click();
    await page.getByRole("heading", { name: /wydatki w tym okresie/i }).scrollIntoViewIfNeeded();
    const overflowAtStatus = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflowAtStatus).toBe(false);
  });

  test("prefers a chosen greeting name while keeping the full profile name", async ({ page }) => {
    await page.route("**/rest/v1/profiles**", (route) =>
      route.fulfill({
        status: 200,
        json: {
          id: TEST_USER_ID,
          email: "test@portfelik.test",
          name: "Mr. Zinko",
          role: "user",
          settings: { preferredName: "Adrian", guidedTour: { dismissed: true } },
        },
      })
    );
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Hej, Adrian!" })).toBeVisible();
  });

  test("shows the full profile name and separates current cash from the 90-day forecast", async ({
    page,
  }) => {
    const today = isoDaysFromToday(0);
    const cashRows = [
      {
        id: "dashboard-cash-income",
        date: today,
        description: "Wpływ",
        amount: 500,
        type: "income",
        status: "paid",
        currency: "PLN",
        user_id: TEST_USER_ID,
        group_id: null,
        is_recurring: false,
      },
      {
        id: "dashboard-cash-expense",
        date: today,
        description: "Zakup",
        amount: 200,
        type: "expense",
        status: "paid",
        currency: "PLN",
        user_id: TEST_USER_ID,
        group_id: null,
        is_recurring: false,
      },
      {
        id: "dashboard-cash-upcoming",
        date: isoDaysFromToday(7),
        description: "Rachunek",
        amount: 300,
        type: "expense",
        status: "upcoming",
        currency: "PLN",
        user_id: TEST_USER_ID,
        group_id: null,
        is_recurring: false,
      },
    ];

    await page.route("**/rest/v1/profiles**", (route) =>
      route.fulfill({
        status: 200,
        json: {
          id: TEST_USER_ID,
          email: "test@portfelik.test",
          name: "Mr. Zinko",
          role: "user",
          settings: { guidedTour: { dismissed: true } },
        },
      })
    );
    await page.route("**/rest/v1/cash_positions**", (route) =>
      route.fulfill({
        status: 200,
        json: {
          owner_id: TEST_USER_ID,
          group_id: null,
          opening_amount: 1000,
          as_of_date: today,
        },
      })
    );
    await page.route("**/rest/v1/transactions_with_category**", (route) => {
      const url = route.request().url();
      return route.fulfill({
        status: 200,
        json: url.includes("is_recurring=eq.true") ? [] : cashRows,
      });
    });

    await page.goto("/dashboard");

    await expect(page.getByRole("heading", { name: "Hej, Mr. Zinko!" })).toBeVisible();
    const cash = page.getByTestId("dashboard-cash-position");
    await expect(cash.getByText("Dostępne teraz", { exact: true }).first()).toBeVisible();
    await expect(
      cash.getByText("Po nadchodzących płatnościach", { exact: true }).first()
    ).toBeVisible();
    await expect(cash).toContainText(/1\D?300,00/);
    await expect(cash).toContainText(/1\D?000,00/);
    await cash.getByText("Jak obliczamy saldo i prognozę?", { exact: true }).click();
    await expect(cash.getByText("Zaksięgowane wpływy", { exact: true })).toBeVisible();
    await expect(cash.getByText("Zaksięgowane wydatki", { exact: true })).toBeVisible();
  });

  test("first visit renders cash while unrelated plans and demo checks are still pending", async ({
    page,
  }) => {
    const today = isoDaysFromToday(0);
    let release!: () => void;
    const auxiliaryReady = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/rest/v1/plans**", async (route) => {
      await auxiliaryReady;
      await route.fulfill({ status: 200, json: [] });
    });
    await page.route("**/rest/v1/net_worth_items**", async (route) => {
      await auxiliaryReady;
      await route.fulfill({ status: 200, json: [] });
    });
    await page.route("**/rest/v1/cash_positions**", (route) =>
      route.fulfill({
        status: 200,
        json: { owner_id: TEST_USER_ID, group_id: null, opening_amount: 1000, as_of_date: today },
      })
    );
    await page.route("**/rest/v1/transactions_with_category**", (route) =>
      route.fulfill({ status: 200, json: [] })
    );
    try {
      await page.goto("/dashboard");
      const cash = page.getByTestId("dashboard-cash-position");
      await expect(cash).toBeVisible();
      await expect(cash.locator("p.text-3xl")).toHaveText(/1\D?000,00/);
      await expect(page.getByTestId("dashboard-cash-loading")).toHaveCount(0);
      await expect(page).toHaveURL(/\/dashboard$/);
    } finally {
      release();
    }
  });

  test("cash remains a skeleton until its history arrives, then recovers without navigation", async ({
    page,
  }) => {
    const today = isoDaysFromToday(0);
    let release!: () => void;
    const historyReady = new Promise<void>((resolve) => (release = resolve));
    await page.route("**/rest/v1/cash_positions**", (route) =>
      route.fulfill({
        status: 200,
        json: { owner_id: TEST_USER_ID, group_id: null, opening_amount: 1000, as_of_date: today },
      })
    );
    await page.route("**/rest/v1/transactions_with_category**", async (route) => {
      await historyReady;
      await route.fulfill({ status: 200, json: [] });
    });
    try {
      await page.goto("/dashboard");
      await expect(page.getByTestId("dashboard-cash-loading")).toBeVisible();
      await expect(page.getByTestId("dashboard-cash-position")).toHaveCount(0);
    } finally {
      release();
    }
    await expect(page.getByTestId("dashboard-cash-position").locator("p.text-3xl")).toHaveText(
      /1\D?000,00/
    );
    await expect(page.getByTestId("dashboard-cash-loading")).toHaveCount(0);
  });

  test("spending accordion expands on mobile", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Zobacz więcej" }).click();
    const toggle = page.getByRole("button", { name: /wydatki w tym okresie/i });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panel = page.locator("#dashboard-spending .expand-grid");
    await expect(panel).toHaveAttribute("aria-hidden", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await expect(page.getByText(/największe wydatki/i)).toBeVisible();
  });

  test("spend history accordion expands on mobile", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Zobacz więcej" }).click();
    const toggle = page.getByRole("button", { name: /historia wydatków/i });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await toggle.click();
    await expect(page.locator(".overflow-x-hidden.rounded-xl.border")).toBeVisible();
  });

  test("period chips and custom range drive the dashboard window", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Zobacz więcej" }).click();

    // Calendar month is the canonical default and is omitted from the URL.
    await expect(page.getByRole("tab", { name: /^ten miesiąc$/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page).not.toHaveURL(/period=/);

    // Week is a non-default view and remains explicit in the URL.
    await page.getByRole("tab", { name: /ostatnie 7 dni/i }).click();
    await expect(page).toHaveURL(/period=week/);

    // Picking a range via the date picker switches to custom (startDate/endDate,
    // period param dropped) — presets apply immediately.
    await page.getByRole("button", { name: /zakres dat/i }).click();
    await page.getByRole("button", { name: /^ten miesiąc$/i }).click();
    await expect(page).toHaveURL(/startDate=\d{4}-\d{2}-\d{2}/);
    await expect(page).not.toHaveURL(/period=/);

    // Clearing the range returns to the default calendar-month view.
    await page.getByRole("button", { name: /wróć do bieżącego miesiąca/i }).click();
    await expect(page).not.toHaveURL(/startDate=/);
    await expect(page).not.toHaveURL(/period=/);
    await expect(page.getByRole("tab", { name: /^ten miesiąc$/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
  });

  test("transaction links carry the exact inclusive month and group scope", async ({ page }) => {
    await page.goto("/dashboard?group=all");
    const range = currentCalendarMonthRange();
    const link = page.getByRole("link", { name: /wszystkie transakcje/i });

    await expect(link).toHaveAttribute(
      "href",
      `/transactions?startDate=${range.start}&endDate=${range.end}&group=all`
    );
  });
});
