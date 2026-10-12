import { expect, test } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";
import { TEST_USER_ID } from "../helpers/fixtures";

const ARTIFACTS = "/opt/cursor/artifacts";

function tx(
  id: string,
  date: string,
  amount: number,
  status: "paid" | "upcoming",
  type: "expense" | "income" = "expense"
) {
  return {
    id,
    date,
    description: id,
    amount,
    type,
    status,
    currency: "PLN",
    user_id: TEST_USER_ID,
    group_id: null,
    is_recurring: false,
  };
}

async function openCashCard(page: import("@playwright/test").Page) {
  await page.clock.setFixedTime(new Date("2026-10-12T10:00:00.000Z"));
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.addInitScript(() => {
    localStorage.setItem("push_prompted_at", String(Date.now()));
  });
  await page.route("**/rest/v1/cash_positions**", (route) =>
    route.fulfill({
      json: {
        owner_id: TEST_USER_ID,
        group_id: null,
        opening_amount: 20000,
        as_of_date: "2026-09-01",
      },
    })
  );
  await page.route("**/rest/v1/transactions_with_category**", (route) => {
    const url = route.request().url();
    return route.fulfill({
      json: url.includes("is_recurring=eq.true")
        ? []
        : [
            tx("sep-a", "2026-09-03", 1200, "paid"),
            tx("sep-b", "2026-09-09", 800, "paid"),
            tx("oct-a", "2026-10-02", 700, "paid"),
            tx("oct-b", "2026-10-06", 500, "paid"),
            tx("oct-c", "2026-10-10", 560, "paid"),
            tx("rent", "2026-10-20", 4000, "upcoming"),
            tx("bills", "2026-10-28", 2120, "upcoming"),
          ],
    });
  });
  await page.goto("/dashboard");
  const card = page.getByTestId("dashboard-cash-position");
  await expect(card.getByText("Przewidywane saldo na koniec miesiąca")).toBeVisible();
  return card;
}

function saveCard(card: import("@playwright/test").Locator, name: string) {
  if (!existsSync(ARTIFACTS)) return Promise.resolve();
  mkdirSync(ARTIFACTS, { recursive: true });
  return card.screenshot({ path: `${ARTIFACTS}/${name}.png` });
}

test.describe("cockpit forecast chart", () => {
  test.use({ viewport: { width: 390, height: 844 }, colorScheme: "dark" });

  test("pulses today, scrubs history, and returns to today", async ({ page }) => {
    const card = await openCashCard(page);
    await expect(card.getByTestId("cockpit-forecast")).toContainText(/10\D?120,00/);
    await expect(card.getByTestId("cockpit-balance")).toContainText(/16\D?240,00/);
    await expect(card.getByTestId("cockpit-payments")).toContainText(/1\D?760,00/);
    await expect(card.getByText("12% mniej niż we wrześniu")).toBeVisible();

    const todayLine = await card.getByTestId("cockpit-today").boundingBox();
    const todayLabel = await card.getByTestId("cockpit-today-label").boundingBox();
    expect(todayLine && todayLabel).toBeTruthy();
    expect(
      Math.abs(todayLine!.x + todayLine!.width / 2 - (todayLabel!.x + todayLabel!.width / 2))
    ).toBeLessThan(12);

    const ring = card.locator(".today-ring");
    await expect(ring).toHaveCSS("animation-name", /cockpit-today-pulse/);
    await expect(ring).not.toHaveClass(/quiet/);
    expect(await ring.evaluate((el) => el.tagName)).toBe("SPAN");
    const phoneBalance = await card.getByTestId("cockpit-balance").boundingBox();
    const phonePayments = await card.getByTestId("cockpit-payments").boundingBox();
    expect(phoneBalance && phonePayments).toBeTruthy();
    expect(Math.abs(phoneBalance!.y - phonePayments!.y)).toBeLessThan(8);
    for (const id of ["cockpit-balance", "cockpit-payments", "cockpit-forecast"]) {
      const clips = await card
        .getByTestId(id)
        .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
      expect(clips).toBe(false);
    }
    await saveCard(card, "cockpit-mobile");
    if (existsSync(ARTIFACTS)) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `${ARTIFACTS}/cockpit-mobile-viewport.png` });
    }

    const chart = card.getByTestId("cockpit-chart");
    const box = await chart.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.height).toBeGreaterThan(160);
    expect(box!.height).toBeLessThan(180);
    await page.mouse.move(box!.x + box!.width * 0.12, box!.y + 80);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.2, box!.y + 80, { steps: 8 });
    const scrub = card.getByTestId("cockpit-scrub");
    await expect(scrub).toBeVisible();
    await expect(scrub).not.toContainText("Prognoza");
    await expect(ring).toHaveClass(/quiet/);
    await saveCard(card, "cockpit-scrub-history");
    await page.mouse.up();
    await expect(scrub).toHaveCount(0);
    await expect(ring).not.toHaveClass(/quiet/);

    await page.mouse.move(box!.x + box!.width * 0.7, box!.y + 80);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width * 0.82, box!.y + 80, { steps: 8 });
    await expect(scrub).toContainText("Prognoza");
    await saveCard(card, "cockpit-scrub-forecast");
    await page.mouse.up();
    await expect(scrub).toHaveCount(0);

    await page.setViewportSize({ width: 1440, height: 900 });
    const forecast = await card.getByTestId("cockpit-forecast").boundingBox();
    const balance = await card.getByTestId("cockpit-balance").boundingBox();
    const payments = await card.getByTestId("cockpit-payments").boundingBox();
    expect(forecast && balance && payments).toBeTruthy();
    expect(forecast!.x).toBeLessThan(balance!.x);
    expect(balance!.y).toBeLessThan(payments!.y);
    await saveCard(card, "cockpit-desktop");
    if (existsSync(ARTIFACTS)) {
      await page.screenshot({ path: `${ARTIFACTS}/cockpit-desktop-viewport.png` });
    }
  });

  test("does not stack Dziś on the last day of the month", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-09-30T10:00:00.000Z"));
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
    await page.addInitScript(() => {
      localStorage.setItem("push_prompted_at", String(Date.now()));
    });
    await page.route("**/rest/v1/cash_positions**", (route) =>
      route.fulfill({
        json: {
          owner_id: TEST_USER_ID,
          group_id: null,
          opening_amount: 2635.81,
          as_of_date: "2026-09-01",
        },
      })
    );
    await page.route("**/rest/v1/transactions_with_category**", (route) =>
      route.fulfill({ json: [] })
    );
    await page.goto("/dashboard");
    const card = page.getByTestId("dashboard-cash-position");
    await expect(card.getByTestId("cockpit-today-label")).toHaveText("Dziś");
    await expect(card.getByText("30 wrz")).toHaveCount(0);
    await expect(card.getByText("1 wrz")).toBeVisible();
  });

  test("keeps the today dot still when motion is reduced", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const card = await openCashCard(page);
    const ring = card.locator(".today-ring");
    await expect(ring).toBeVisible();
    await expect(ring).toHaveCSS("animation-name", "none");
    const todayLine = await card.getByTestId("cockpit-today").boundingBox();
    expect(todayLine).toBeTruthy();
    await saveCard(card, "cockpit-reduced-motion");
  });
});
