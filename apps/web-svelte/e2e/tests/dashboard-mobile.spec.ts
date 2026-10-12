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
    await page.getByRole("heading", { name: /^kategorie$/i }).scrollIntoViewIfNeeded();
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
    await expect(cash.getByText("Saldo na dziś", { exact: true })).toBeVisible();
    await expect(cash.getByText("Wydano w tym miesiącu", { exact: true })).toBeVisible();
    await expect(cash.getByText("Przewidywane saldo na koniec miesiąca")).toBeVisible();
    await expect(cash.getByRole("link", { name: "Zobacz transakcje →" })).toBeVisible();
    await expect(cash.getByTestId("cockpit-balance")).toContainText(/1\D?300,00/);
    await expect(cash.getByTestId("cockpit-payments")).toContainText(/200,00/);
    await expect(cash.getByTestId("cockpit-forecast")).toContainText(/1\D?000,00/);
    const forecastBox = await cash.getByTestId("cockpit-forecast").boundingBox();
    const balanceBox = await cash.getByTestId("cockpit-balance").boundingBox();
    const paymentsBox = await cash.getByTestId("cockpit-payments").boundingBox();
    expect(forecastBox && balanceBox && paymentsBox).toBeTruthy();
    expect(forecastBox!.y).toBeLessThan(balanceBox!.y);
    expect(Math.abs(balanceBox!.y - paymentsBox!.y)).toBeLessThan(8);
    expect(balanceBox!.x).toBeLessThan(paymentsBox!.x);
    const todayLine = await cash.getByTestId("cockpit-today").boundingBox();
    const todayLabel = await cash.getByTestId("cockpit-today-label").boundingBox();
    expect(todayLine && todayLabel).toBeTruthy();
    const lineCenter = todayLine!.x + todayLine!.width / 2;
    const labelCenter = todayLabel!.x + todayLabel!.width / 2;
    expect(Math.abs(lineCenter - labelCenter)).toBeLessThan(12);

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

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const phone = await indicatorBoxes();
    expect(phone.forecast.y).toBeLessThan(phone.balance.y);
    expect(Math.abs(phone.balance.y - phone.payments.y)).toBeLessThan(8);
    expect(phone.balance.x).toBeLessThan(phone.payments.x);
    for (const id of ["cockpit-balance", "cockpit-payments", "cockpit-forecast"]) {
      const clips = await cash
        .getByTestId(id)
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(clips).toBe(false);
    }
    const peek = await page.evaluate(() => {
      const card = document.querySelector("[data-testid='dashboard-cash-position']");
      const nav = document.querySelector(".mobile-bottom-nav");
      if (!(card instanceof HTMLElement) || !(nav instanceof HTMLElement)) return null;
      let sibling = card.nextElementSibling;
      let nextTop: number | null = null;
      while (sibling) {
        const rect = sibling.getBoundingClientRect();
        if (rect.height > 8) {
          nextTop = rect.top;
          break;
        }
        sibling = sibling.nextElementSibling;
      }
      return {
        cardBottom: card.getBoundingClientRect().bottom,
        navTop: nav.getBoundingClientRect().top,
        nextTop,
      };
    });
    expect(peek?.nextTop).not.toBeNull();
    expect(peek!.cardBottom).toBeLessThan(peek!.navTop);
    expect(peek!.nextTop!).toBeLessThan(peek!.navTop);

    for (const width of [768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const wide = await indicatorBoxes();
      expect(wide.forecast.x).toBeLessThan(wide.balance.x);
      expect(Math.abs(wide.balance.x - wide.payments.x)).toBeLessThan(24);
      expect(wide.balance.y).toBeLessThan(wide.payments.y);
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

    await expect(cash.getByRole("button", { name: "Następny miesiąc" })).toHaveCount(0);
    await expect(cash.getByText("Wyliczenie na dziś i 90 dni")).toHaveCount(0);
    await expect(cash).not.toContainText("Dostępne teraz");
    await expect(page.locator("#dashboard-spending")).toBeVisible();
    await expect(page.getByTestId("cockpit-category-period").first()).toBeVisible();
    await expect(page.getByTestId("cockpit-history")).toBeVisible();
    await expect(page.getByTestId("cockpit-history-span")).toHaveText("Ostatnie miesiące");
    const countersHelp = cash.getByRole("button", { name: "Zakres liczników" });
    await countersHelp.hover();
    await expect(countersHelp).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("tooltip")).toContainText(/nie są saldem z banku/);

    await page.getByRole("tab", { name: /ostatnie 7 dni/i }).click();
    await expect(page).toHaveURL(/period=week/);
    await expect(cash.getByTestId("cockpit-payments")).toContainText(/200,00/);
    await expect(page.getByTestId("cockpit-category-period").first()).toHaveText("Ostatnie 7 dni");
    await expect(page.getByTestId("cockpit-history-span")).toHaveText("Ostatnie tygodnie");
  });

  test("missing opening balance shows a dash and one short action", async ({ page }) => {
    await page.goto("/dashboard");
    const cash = page.getByTestId("dashboard-cash-position");
    await expect(cash.getByTestId("cockpit-balance")).toContainText("-");
    await expect(cash.getByTestId("cockpit-forecast")).toContainText("-");
    await expect(cash.getByText("Brak danych", { exact: true })).toHaveCount(0);
    await expect(cash.getByTestId("cockpit-balance")).toHaveAttribute(
      "aria-label",
      "Saldo na dziś: Brak danych"
    );
    await expect(cash.getByRole("link", { name: /Zobacz transakcje/ })).toHaveCount(0);
    const action = cash.getByRole("link", { name: "Ustaw saldo początkowe", exact: true });
    await expect(action).toBeVisible();
    await expect(action).toHaveAttribute("href", "/transactions?group=own");
    await expect(cash).not.toContainText("aby zobaczyć saldo i prognozę");
    const help = cash.getByRole("button", { name: "Objaśnienie", exact: true });
    await help.hover();
    await expect(help).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("tooltip")).toHaveText(
      "Saldo i prognoza pojawią się po ustawieniu salda początkowego."
    );
  });

  test("expenses clipped by an anchor show the start day", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-20T10:00:00.000Z"));
    const rows = [
      {
        id: "before-anchor",
        date: "2026-06-10",
        description: "Przed",
        amount: 300,
        type: "expense",
        status: "paid",
        currency: "PLN",
        user_id: TEST_USER_ID,
        group_id: null,
        is_recurring: false,
      },
      {
        id: "after-anchor",
        date: "2026-06-16",
        description: "Po",
        amount: 500,
        type: "expense",
        status: "paid",
        currency: "PLN",
        user_id: TEST_USER_ID,
        group_id: null,
        is_recurring: false,
      },
    ];
    await page.route("**/rest/v1/cash_positions**", (route) =>
      route.fulfill({
        status: 200,
        json: {
          owner_id: TEST_USER_ID,
          group_id: null,
          opening_amount: 12000,
          as_of_date: "2026-06-15",
        },
      })
    );
    await page.route("**/rest/v1/transactions_with_category**", (route) => {
      const url = route.request().url();
      return route.fulfill({
        status: 200,
        json: url.includes("is_recurring=eq.true") ? [] : rows,
      });
    });

    await page.goto("/dashboard");
    const payments = page.getByTestId("cockpit-payments");
    await expect(payments).toContainText(/500,00/);
    await expect(payments).not.toContainText(/800,00/);
    await expect(payments.getByText("Od 15.06")).toHaveCount(0);
    const help = payments.getByRole("button", { name: "Zakres wydatków" });
    await help.hover();
    await expect(help).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("tooltip")).toContainText(
      "Wydatki obejmują okres od 15.06, od dnia salda początkowego."
    );
  });

  test("household expenses stay blank until their sources are complete", async ({ page }) => {
    const today = isoDaysFromToday(0);
    await page.route("**/rest/v1/transactions_with_category**", (route) => {
      const url = route.request().url();
      return route.fulfill({
        status: 200,
        json: url.includes("is_recurring=eq.true")
          ? []
          : [
              {
                id: "dom-expense",
                date: today,
                description: "Czynsz",
                amount: 400,
                type: "expense",
                status: "paid",
                currency: "PLN",
                user_id: TEST_USER_ID,
                group_id: "group-dom",
                is_recurring: false,
              },
            ],
      });
    });

    await page.goto("/dashboard?group=group-dom");
    const payments = page.getByTestId("cockpit-payments");
    await expect(payments).toHaveAttribute("aria-label", "Wydano w tym miesiącu: Brak danych");
    await expect(payments).toContainText("-");
    await expect(payments).not.toContainText("400");
    await expect(payments).not.toContainText("0,00");
    const help = payments.getByRole("button", { name: "Kompletność wydatków" });
    await help.hover();
    await expect(help).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("tooltip")).toContainText(
      "Wydatki pokażemy, gdy obejmą transakcje, potwierdzone zobowiązania i serie cykliczne."
    );
  });

  test("all-scope expenses stay blank until their sources are complete", async ({ page }) => {
    const today = isoDaysFromToday(0);
    await page.route("**/rest/v1/transactions_with_category**", (route) => {
      const url = route.request().url();
      return route.fulfill({
        status: 200,
        json: url.includes("is_recurring=eq.true")
          ? []
          : [
              {
                id: "own-expense",
                date: today,
                description: "Zakup",
                amount: 250,
                type: "expense",
                status: "paid",
                currency: "PLN",
                user_id: TEST_USER_ID,
                group_id: null,
                is_recurring: false,
              },
              {
                id: "dom-expense",
                date: today,
                description: "Czynsz",
                amount: 400,
                type: "expense",
                status: "paid",
                currency: "PLN",
                user_id: TEST_USER_ID,
                group_id: "group-dom",
                is_recurring: false,
              },
            ],
      });
    });

    await page.goto("/dashboard?group=all");
    const payments = page.getByTestId("cockpit-payments");
    await expect(payments).toContainText("-");
    await expect(payments).not.toContainText("250");
    await expect(payments).not.toContainText("400");
    await expect(payments).not.toContainText("650");
    await expect(payments).not.toContainText("0,00");
    await payments.getByRole("button", { name: "Kompletność wydatków" }).hover();
    await expect(page.getByRole("tooltip")).toContainText(
      "potwierdzone zobowiązania i serie cykliczne"
    );
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
    await expect(cash.getByTestId("cockpit-payments")).toContainText(/0,00/);
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
    const toggle = page.getByRole("button", { name: /kategorie/i });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panel = page.locator("#dashboard-spending .expand-grid");
    await expect(panel).toHaveAttribute("aria-hidden", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await expect(page.getByText(/największe wydatki/i)).toBeVisible();
  });

  test("spend history is visible without extra steps", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Historia", exact: true })).toBeVisible();
    await expect(page.getByTestId("cockpit-history-span")).toHaveText("Ostatnie miesiące");
  });

  test("period chips and custom range drive the dashboard window", async ({ page }) => {
    await page.goto("/dashboard");

    // Calendar month is the canonical default and is omitted from the URL.
    await expect(page.getByRole("tab", { name: /^ten miesiąc$/i })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(page).not.toHaveURL(/period=/);

    // Week is a non-default view and remains explicit in the URL.
    // Categories, the chart, and the counters follow it.
    await page.getByRole("tab", { name: /ostatnie 7 dni/i }).click();
    await expect(page).toHaveURL(/period=week/);
    await expect(page.getByTestId("cockpit-category-period").first()).toHaveText("Ostatnie 7 dni");
    await expect(page.getByTestId("cockpit-history-span")).toHaveText("Ostatnie tygodnie");

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
