import { test, expect } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

test.describe("dashboard mobile layout", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /wydatki w tym okresie/i })).toBeVisible({
      timeout: 10000,
    });

    const overflowAtTop = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflowAtTop).toBe(false);

    await page.getByRole("heading", { name: /status/i }).scrollIntoViewIfNeeded();
    const overflowAtStatus = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflowAtStatus).toBe(false);
  });

  test("spending accordion expands on mobile", async ({ page }) => {
    await page.goto("/dashboard");
    const toggle = page.getByRole("button", { name: /wydatki w tym okresie/i });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const panel = page.locator("#dashboard-spending .expand-grid");
    await expect(panel).toHaveAttribute("aria-hidden", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toHaveAttribute("aria-hidden", "false");
    await expect(page.getByText(/top kategorie/i)).toBeVisible();
  });

  test("spend history accordion expands on mobile", async ({ page }) => {
    await page.goto("/dashboard");
    const toggle = page.getByRole("button", { name: /historia wydatków/i });
    await expect(toggle).toBeVisible({ timeout: 10000 });
    await toggle.click();
    await expect(page.locator(".overflow-x-hidden.rounded-xl.border")).toBeVisible();
  });

  test("period chips and custom range drive the dashboard window", async ({ page }) => {
    await page.goto("/dashboard");

    // Rolling 30-day chip writes the period param.
    await page.getByRole("tab", { name: "30 dni" }).click();
    await expect(page).toHaveURL(/period=month/);

    // Picking a range via the date picker switches to custom (startDate/endDate,
    // period param dropped) — presets apply immediately.
    await page.getByRole("button", { name: /^daty$/i }).click();
    await page.getByRole("button", { name: /^ten miesiąc$/i }).click();
    await expect(page).toHaveURL(/startDate=\d{4}-\d{2}-\d{2}/);
    await expect(page).not.toHaveURL(/period=/);

    // Clearing the range returns to the default 7-day view.
    await page.getByRole("button", { name: /wróć do widoku 7 dni/i }).click();
    await expect(page).not.toHaveURL(/startDate=/);
  });
});
