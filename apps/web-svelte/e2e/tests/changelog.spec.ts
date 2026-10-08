import { expect, test } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";
import changelog from "../../src/lib/content/changelog.json" with { type: "json" };

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
    page.getByRole("article").first().getByText(release.items[0], {
      exact: true,
    })
  ).toBeVisible();

  await page.getByRole("link", { name: "Zamknij" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("opening the changelog clears the unread mark", async ({ page }) => {
  const patches: unknown[] = [];
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  page.on("request", (request) => {
    if (request.method() === "PATCH" && request.url().includes("/profiles")) {
      patches.push(request.postDataJSON());
    }
  });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "test@portfelik.test" }).click();
  await expect(page.getByRole("menuitem", { name: /Nieprzeczytane zmiany/ })).toBeVisible();

  await page.getByRole("menuitem", { name: "Co nowego" }).click();
  await expect(page).toHaveURL(/\/changelog/);
  await expect.poll(() => patches.length).toBeGreaterThan(0);
  expect(patches.at(-1)).toMatchObject({
    settings: {
      guidedTour: { dismissed: true },
      changelogSeenVersion: release.version,
    },
  });

  await page.getByRole("link", { name: "Zamknij" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "test@portfelik.test" }).click();
  await expect(page.getByRole("menuitem", { name: "Co nowego" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /Nieprzeczytane zmiany/ })).toHaveCount(0);
});

test("changelog ignores an external return target", async ({ page }) => {
  await page.goto("/changelog?from=https://evil.example");
  await page.getByRole("link", { name: "Zamknij" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
