import { expect, test } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

test.describe("native spine on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("web login still offers email and password", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Zaloguj się z Google" })).toBeVisible();
    await expect(page.getByLabel("Adres e-mail")).toBeVisible();
    await expect(page.getByLabel("Hasło")).toBeVisible();
  });

  test("walks Kokpit, Transakcje, Import, Plany, settle, and rules", async ({ page }) => {
    await injectFakeSession(page);
    await mockSupabaseAPI(page);

    await page.goto("/dashboard");
    await expect(page.locator(".md\\:hidden p")).toContainText(/Cześć|Hej|Witaj|Dzień dobry/, {
      timeout: 10_000,
    });
    await expect(page.getByText(/^Yo,/)).toHaveCount(0);
    await expect(page.getByText(/^Siemka,/)).toHaveCount(0);

    const nav = page.locator(".mobile-bottom-nav");
    await nav.getByRole("link", { name: "Transakcje", exact: true }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByRole("heading", { name: /transakcje/i })).toBeVisible();

    await page.getByRole("button", { name: /^filtry/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Zamknij", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("link", { name: "Import", exact: true }).click();
    await expect(page).toHaveURL(/\/import/);
    await expect(page.getByText("Wybierz wyciąg")).toBeVisible();

    await nav.getByRole("link", { name: "Plany", exact: true }).click();
    await expect(page).toHaveURL(/\/plans/);
    await expect(page.getByRole("heading", { name: /plany/i })).toBeVisible();

    await page.goto("/plans/plan-1/settle");
    await expect(page.getByRole("link", { name: "Szczegóły planu" })).toBeVisible();

    await page.goto("/settings?tab=rules");
    await expect(
      page.getByText(
        "Reguły uczą się przy imporcie. Ta lista to zaawansowana edycja już zapisanych nawyków."
      )
    ).toBeVisible();
  });

  test("auth callback uses the dark shell and Paraglide back link", async ({ page }) => {
    await page.goto("/auth/callback");
    await expect(page.getByRole("link", { name: "Wróć do logowania" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("body")).toHaveCSS("background-color", "rgb(2, 6, 23)");
  });
});
