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

  test("import and navigation remain labelled at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await page.goto("/transactions");
    const importLink = page.getByRole("link", { name: "Import", exact: true });
    await expect(importLink).toHaveText("Import");
    const importBox = await importLink.boundingBox();
    expect(importBox!.height).toBeGreaterThanOrEqual(44);

    const nav = page.locator(".mobile-bottom-nav");
    for (const label of ["Kokpit", "Transakcje", "Plany"]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveText(label);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ).toBeLessThanOrEqual(1);
  });

  test("search is reachable from the filter bar without a floating overlay", async ({ page }) => {
    await page.goto("/transactions");
    const search = page.getByRole("button", { name: "Szukaj transakcji", exact: true });
    await expect(search).toBeVisible();
    await expect(search).not.toHaveClass(/mobile-floating-action/);
    expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await search.click();
    await expect(page.getByRole("search", { name: "Szukaj transakcji" })).toBeVisible();
  });

  test("sheet close target stays usable on a short mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 568 });
    await page.goto("/transactions");
    await page.getByRole("button", { name: /^filtry/i }).click();
    const close = page.getByRole("dialog").getByRole("button", { name: "Zamknij", exact: true });
    await expect(close).toBeVisible();
    const box = await close.boundingBox();
    expect(Math.round(box!.width)).toBeGreaterThanOrEqual(44);
    expect(Math.round(box!.height)).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
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
    await page
      .getByRole("button", { name: /transport/i })
      .first()
      .click();
    expect(page.url()).toBe(urlBefore);

    await page.getByRole("button", { name: /zastosuj filtry/i }).click();
    await expect(page).toHaveURL(/categoryId=/);
  });
});
