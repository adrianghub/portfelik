import { expect, test } from "@playwright/test";
import changelog from "../../src/lib/content/changelog.json";

const release = changelog.versions[0];
const date = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
}).format(new Date(`${release.date}T12:00:00Z`));

test("changelog is public and closes back to the page that opened it", async ({ page }) => {
  await page.goto("/changelog?from=/login");

  await expect(page.getByRole("heading", { name: "Co nowego" })).toBeVisible();
  await expect(page.getByText(`Wersja ${release.version}`)).toBeVisible();
  await expect(page.getByRole("heading", { name: `${release.version}, ${date}` })).toBeVisible();
  await expect(
    page.getByText(release.items[0], {
      exact: false,
    })
  ).toBeVisible();

  await page.getByRole("link", { name: "Zamknij" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("changelog ignores an external return target", async ({ page }) => {
  await page.goto("/changelog?from=https://evil.example");
  await page.getByRole("link", { name: "Zamknij" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
