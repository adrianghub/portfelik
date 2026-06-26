/**
 * Settings IA: grouped section landing → drill into a subsection → back,
 * deep-link to a tab, and search.
 */
import { expect, test, type Page } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

async function gotoSettings(page: Page, query = ""): Promise<void> {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.goto(`/settings${query}`);
}

test("landing lists the three sections and their subsections", async ({ page }) => {
  await gotoSettings(page);

  await expect(page.getByRole("heading", { name: "Ustawienia" })).toBeVisible();
  for (const section of ["Konto", "Finanse", "Współdzielenie"]) {
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
  }
  for (const sub of ["Profil", "Personalizacja", "Kategorie", "Reguły", "Grupy"]) {
    await expect(page.getByRole("button", { name: sub, exact: true })).toBeVisible();
  }
});

test("drill into a subsection then back to the landing", async ({ page }) => {
  await gotoSettings(page);

  await page.getByRole("button", { name: "Personalizacja", exact: true }).click();
  await expect(page).toHaveURL(/tab=personalization/);
  // Back link returns to the settings landing.
  const back = page.getByRole("button", { name: "Ustawienia" });
  await expect(back).toBeVisible();

  await back.click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByPlaceholder("Szukaj ustawień")).toBeVisible();
});

test("deep link to a tab renders that panel directly", async ({ page }) => {
  await gotoSettings(page, "?tab=categories");

  // Landing search is not shown; the back link returns to the landing.
  await expect(page.getByPlaceholder("Szukaj ustawień")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ustawienia" })).toBeVisible();
});

test("search filters subsections and navigates", async ({ page }) => {
  await gotoSettings(page);

  await page.getByPlaceholder("Szukaj ustawień").fill("grupy");
  const result = page.getByRole("button", { name: "Grupy" });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/tab=groups/);
});
