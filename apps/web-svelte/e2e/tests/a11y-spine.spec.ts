import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

const spinePaths = ["/dashboard", "/transactions", "/import", "/plans", "/settings"];

test.describe("a11y spine flows", () => {
  for (const path of spinePaths) {
    test(`no serious axe violations on ${path}`, async ({ page }) => {
      await injectFakeSession(page);
      await mockSupabaseAPI(page);
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path.replace("/", "\\/")}(\\?.*)?$`));
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical"
      );
      expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    });
  }
});
