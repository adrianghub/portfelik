import { test, expect } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

test.describe("transactions mobile filters", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await injectFakeSession(page);
    await mockSupabaseAPI(page);
  });

  test("no horizontal overflow at 375px", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: /transakcje/i })).toBeVisible({
      timeout: 10000,
    });

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 1;
    });
    expect(overflow).toBe(false);
  });

  test("mobile filters sheet opens with consolidated controls", async ({ page }) => {
    await page.goto("/transactions");
    await page.getByRole("button", { name: /^filtry/i }).click();
    await expect(page.getByRole("dialog").getByText(/kategoria/i)).toBeVisible();
    await expect(page.getByText(/szybkie filtry/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /zastosuj filtry/i })).toBeVisible();
  });

  test("apply footer is pinned inside the viewport without scrolling", async ({ page }) => {
    // Regression: the sheet body once collapsed its max-height (percentage in a
    // flex item) and overflow-hidden clipped the footer out of reach. toBeVisible
    // can't catch clipping, so assert the button's box sits inside the viewport.
    await page.goto("/transactions");
    await page.getByRole("button", { name: /^filtry/i }).click();
    const apply = page.getByRole("button", { name: /zastosuj filtry/i });
    await expect(apply).toBeVisible();
    // Poll: the sheet flies in from the bottom, so the box is only meaningful
    // once the enter transition settles.
    await expect(async () => {
      const box = await apply.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(812);
      expect(box!.y).toBeGreaterThanOrEqual(0);
    }).toPass({ timeout: 3000 });
  });

  test("sheet filters apply only after Zastosuj filtry", async ({ page }) => {
    await page.goto("/transactions");
    const urlBefore = page.url();

    await page.getByRole("button", { name: /^filtry/i }).click();
    await page.getByRole("button", { name: /transport/i }).first().click();
    expect(page.url()).toBe(urlBefore);

    await page.getByRole("button", { name: /zastosuj filtry/i }).click();
    await expect(page).toHaveURL(/categoryId=/);
  });
});
