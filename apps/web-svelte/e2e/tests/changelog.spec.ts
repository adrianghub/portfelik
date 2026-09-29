import { expect, test } from "@playwright/test";

test("changelog is public and closes back to the page that opened it", async ({ page }) => {
  await page.goto("/changelog?from=/login");

  await expect(page.getByRole("heading", { name: "Co nowego" })).toBeVisible();
  await expect(page.getByText("Wersja 1.3.0")).toBeVisible();
  await expect(page.getByRole("heading", { name: /1\.3\.0, 28 września 2026/ })).toBeVisible();
  await expect(
    page.getByText("Kokpit wita Hej i pokazuje limity kategorii w bieżącym okresie.")
  ).toBeVisible();

  await page.getByRole("link", { name: "Zamknij" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("changelog ignores an external return target", async ({ page }) => {
  await page.goto("/changelog?from=https://evil.example");
  await page.getByRole("link", { name: "Zamknij" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
