import { expect, test } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

test("privacy policy distinguishes private wipe from group history", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.goto("/privacy");

  await expect(page.getByRole("heading", { name: "Polityka prywatności" })).toBeVisible();
  await expect(page.getByText(/kasujemy Twoje prywatne dane/i)).toBeVisible();
  await expect(page.getByText(/Wspólne wpisy grupy zostają u jej właściciela/i)).toBeVisible();
});
