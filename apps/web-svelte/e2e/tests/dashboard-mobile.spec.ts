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

  test("shows the full profile name and the month cockpit indicators", async ({ page }) => {
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
        date: today,
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
    await expect(cash.getByText("Stan salda", { exact: true })).toBeVisible();
    await expect(cash.getByText("Wydatki", { exact: true })).toBeVisible();
    await expect(cash.getByText("Prognoza", { exact: true })).toBeVisible();
    await expect(cash.getByTestId("cockpit-balance")).toContainText(/1\D?300,00/);
    await expect(cash.getByTestId("cockpit-payments")).toContainText(/500,00/);
    await expect(cash.getByTestId("cockpit-forecast")).toContainText(/1\D?000,00/);
    const forecastBox = await cash.getByTestId("cockpit-forecast").boundingBox();
    const balanceBox = await cash.getByTestId("cockpit-balance").boundingBox();
    const paymentsBox = await cash.getByTestId("cockpit-payments").boundingBox();
    expect(forecastBox && balanceBox && paymentsBox).toBeTruthy();
    expect(forecastBox!.y).toBeLessThan(balanceBox!.y);
    expect(forecastBox!.width).toBeGreaterThan(balanceBox!.width + 40);
    expect(Math.abs(balanceBox!.y - paymentsBox!.y)).toBeLessThan(8);
    const balanceArc = await cash.getByTestId("cockpit-balance").locator("svg").boundingBox();
    const balanceLabel = await cash.getByText("Stan salda", { exact: true }).boundingBox();
    const balanceAmount = await cash
      .getByTestId("cockpit-balance")
      .getByText(/1\D?300,00/)
      .boundingBox();
    expect(balanceArc && balanceLabel && balanceAmount).toBeTruthy();
    expect(balanceLabel!.y).toBeGreaterThan(balanceArc!.y + balanceArc!.height - 1);
    expect(balanceAmount!.y).toBeGreaterThan(balanceLabel!.y);
    expect(
      await cash
        .getByTestId("cockpit-balance")
        .getByText(/1\D?300,00/)
        .evaluate((el) => getComputedStyle(el).position)
    ).not.toBe("absolute");

    async function indicatorBoxes() {
      const forecast = await cash.getByTestId("cockpit-forecast").boundingBox();
      const balance = await cash.getByTestId("cockpit-balance").boundingBox();
      const payments = await cash.getByTestId("cockpit-payments").boundingBox();
      expect(forecast && balance && payments).toBeTruthy();
      return { forecast: forecast!, balance: balance!, payments: payments! };
    }

    await page.setViewportSize({ width: 320, height: 800 });
    const stacked = await indicatorBoxes();
    expect(stacked.forecast.y).toBeLessThan(stacked.balance.y);
    expect(stacked.balance.y).toBeLessThan(stacked.payments.y);
    expect(Math.abs(stacked.forecast.width - stacked.balance.width)).toBeLessThan(8);

    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await indicatorBoxes();
    expect(phone.forecast.y).toBeLessThan(phone.balance.y);
    expect(phone.forecast.width).toBeGreaterThan(phone.balance.width + 40);
    expect(Math.abs(phone.balance.y - phone.payments.y)).toBeLessThan(8);

    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const wide = await indicatorBoxes();
      expect(wide.balance.x).toBeLessThan(wide.payments.x);
      expect(wide.payments.x).toBeLessThan(wide.forecast.x);
      expect(Math.abs(wide.balance.y - wide.forecast.y)).toBeLessThan(8);
      expect(Math.abs(wide.balance.width - wide.payments.width)).toBeLessThan(24);
      expect(Math.abs(wide.payments.width - wide.forecast.width)).toBeLessThan(24);
    }

    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "32px";
    });
    for (const id of ["cockpit-balance", "cockpit-payments", "cockpit-forecast"]) {
      const clips = await cash
        .getByTestId(id)
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(clips).toBe(false);
    }
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.setViewportSize({ width: 1280, height: 800 });

    await cash.getByRole("button", { name: "Następny miesiąc" }).click();
    await expect(page).toHaveURL(/cashMonth=/);
    await expect(cash.getByTestId("cockpit-payments")).toContainText(/0,00/);
    await expect(cash.getByTestId("cockpit-balance")).toContainText(/1\D?000,00/);
    await cash.getByRole("button", { name: "Poprzedni miesiąc" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(cash.getByTestId("cockpit-payments")).toContainText(/500,00/);

    await cash.getByText("Wyliczenie na dziś i 90 dni", { exact: true }).click();
    await expect(cash.getByText("Zaksięgowane wpływy", { exact: true })).toBeVisible();
    await expect(cash.getByText("Zaksięgowane wydatki", { exact: true })).toBeVisible();
    await expect(cash.getByText("Saldo na dziś", { exact: true })).toBeVisible();
    await expect(cash).toContainText("osobno od liczników wybranego miesiąca");
    await expect(cash).not.toContainText("Wybór okresu i filtrów nie zmienia tych kwot");
    await expect(cash).not.toContainText("Dostępne teraz");
  });

  test("missing opening balance shows a dash and one short action", async ({ page }) => {
    await page.goto("/dashboard");
    const cash = page.getByTestId("dashboard-cash-position");
    await expect(cash.getByTestId("cockpit-balance")).toContainText("-");
    await expect(cash.getByTestId("cockpit-forecast")).toContainText("-");
    await expect(cash.getByText("Brak danych", { exact: true })).toHaveCount(0);
    await expect(cash.getByTestId("cockpit-balance")).toHaveAttribute(
      "aria-label",
      "Stan salda: Brak danych"
    );
    const action = cash.getByRole("link", { name: "Ustaw saldo początkowe", exact: true });
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("href", "/transactions?group=own");
    await expect(cash).not.toContainText("aby zobaczyć saldo i prognozę");
    const help = cash.getByRole("button", { name: "Objaśnienie" });
    await help.click();
    await expect(help).toHaveAttribute("aria-expanded", "true");
    await expect(
      cash.getByText("Saldo i prognoza pojawią się po ustawieniu salda początkowego.")
    ).toBeVisible();
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
      await expect(cash.getByTestId("cockpit-balance")).toContainText(/1\D?000,00/);
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
    await expect(page.getByTestId("cockpit-balance")).toContainText(/1\D?000,00/);
    await expect(page.getByTestId("dashboard-cash-loading")).toHaveCount(0);
  });

  test("large and negative indicator amounts stay inside the card", async ({ page }) => {
    const today = isoDaysFromToday(0);
    await page.route("**/rest/v1/cash_positions**", (route) =>
      route.fulfill({
        status: 200,
        json: {
          owner_id: TEST_USER_ID,
          group_id: null,
          opening_amount: 1_000_000,
          as_of_date: today,
        },
      })
    );
    await page.route("**/rest/v1/transactions_with_category**", (route) =>
      route.fulfill({
        status: 200,
        json: [
          {
            id: "wide-upcoming",
            date: today,
            description: "Rachunek",
            amount: 1_500_000,
            type: "expense",
            status: "upcoming",
            currency: "PLN",
            user_id: TEST_USER_ID,
            group_id: null,
            is_recurring: false,
          },
        ],
      })
    );
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/dashboard");
    const cash = page.getByTestId("dashboard-cash-position");
    await expect(cash.getByTestId("cockpit-balance")).toContainText(/1\D?000\D?000,00/);
    await expect(cash.getByTestId("cockpit-payments")).toContainText(/1\D?500\D?000,00/);
    await expect(cash.getByTestId("cockpit-forecast")).toContainText(/-500\D?000,00/);
    for (const id of ["cockpit-balance", "cockpit-payments", "cockpit-forecast"]) {
      const clips = await cash
        .getByTestId(id)
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(clips).toBe(false);
    }
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
