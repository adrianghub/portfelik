/**
 * Settings IA: grouped section landing → drill into a subsection → back,
 * deep-link to a tab, and search.
 */
import { expect, test, type Page } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";
import { MOCK_CATEGORIES } from "../helpers/fixtures";

async function gotoSettings(page: Page, query = ""): Promise<void> {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await page.goto(`/settings${query}`);
}

test("saves a category color, icon and a comma-decimal limit without changing identity", async ({
  page,
}) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  let saved: Record<string, unknown> | undefined;
  await page.route(/.*\/rest\/v1\/categories.*/, async (route) => {
    if (route.request().method() === "PATCH") {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 200, json: { ...MOCK_CATEGORIES[0], ...saved } });
    }
    return route.fallback();
  });
  await page.goto("/settings?tab=categories");
  await page
    .getByRole("button", { name: "Edytuj", exact: true })
    .filter({ visible: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Edytuj kategorię" });
  await dialog.getByLabel("Ikona", { exact: true }).selectOption("home");
  await dialog.getByLabel("Kolor", { exact: true }).selectOption("#38bdf8");
  await dialog.getByLabel("Limit wydatków", { exact: true }).fill("1 234,56");
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(saved).toMatchObject({ color: "#38bdf8", icon: "home", cap_amount: 1234.56 });
});

test("landing lists the sections and their subsections", async ({ page }) => {
  await gotoSettings(page);

  await expect(page.getByRole("heading", { name: "Ustawienia" })).toBeVisible();
  for (const section of ["Konto", "Finanse", "Współdzielenie", "Aplikacja", "Dane i prywatność"]) {
    await expect(page.getByRole("heading", { name: section, exact: true })).toBeVisible();
  }
  for (const sub of [
    "Profil",
    "Powiadomienia",
    "Kategorie i limity",
    "Reguły",
    "Grupy",
    "Wygląd",
    "Pomoc i przewodnik",
    "Eksport i konto",
  ]) {
    await expect(
      page.getByRole("main").getByRole("button", { name: sub, exact: true })
    ).toBeVisible();
  }
});

test("drill into a subsection then back to the landing", async ({ page }) => {
  await gotoSettings(page);

  await page.getByRole("button", { name: "Wygląd", exact: true }).click();
  await expect(page).toHaveURL(/tab=personalization/);
  // Back link returns to the settings landing.
  const back = page.getByRole("button", { name: "Ustawienia" });
  await expect(back).toBeVisible();

  await back.click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByPlaceholder("Szukaj ustawień")).toBeVisible();
});

test("push banner reserves layout space and does not intercept the settings back button", async ({
  page,
}) => {
  await injectFakeSession(page);
  await page.addInitScript(() => {
    localStorage.removeItem("push_prompted_at");
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: { permission: "default", requestPermission: async () => "default" },
    });
    if (!("PushManager" in window)) {
      Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
    }
  });
  await mockSupabaseAPI(page);
  await page.goto("/settings?tab=personalization");

  const banner = page.getByTestId("push-notification-banner");
  const back = page.getByRole("button", { name: "Ustawienia" });
  await expect(banner).toBeVisible();
  await expect(back).toBeVisible();
  await expect(async () => {
    const bannerBox = await banner.boundingBox();
    const backBox = await back.boundingBox();
    expect(bannerBox).not.toBeNull();
    expect(backBox).not.toBeNull();
    expect(backBox!.y).toBeGreaterThanOrEqual(bannerBox!.y + bannerBox!.height);
  }).toPass();

  await back.click();
  await expect(page).toHaveURL(/\/settings$/);
});

test("deep link to a tab renders that panel directly", async ({ page }) => {
  await gotoSettings(page, "?tab=categories");

  // Landing search is not shown; the back link returns to the landing.
  await expect(page.getByPlaceholder("Szukaj ustawień")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ustawienia" })).toBeVisible();
});

test("rules tab says they are learned at import", async ({ page }) => {
  await gotoSettings(page, "?tab=rules");
  await expect(
    page.getByText(
      "Reguły uczą się przy imporcie. Ta lista to zaawansowana edycja już zapisanych nawyków."
    )
  ).toBeVisible();
});

test("search filters subsections and navigates", async ({ page }) => {
  await gotoSettings(page);

  await page.getByPlaceholder("Szukaj ustawień").fill("grupy");
  const result = page.getByRole("button", { name: "Grupy" });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/tab=groups/);
});

test("search finds the demo on Pomoc and account deletion on Eksport", async ({ page }) => {
  await gotoSettings(page);

  await page.getByPlaceholder("Szukaj ustawień").fill("przykład");
  await expect(
    page.getByRole("main").getByRole("button", { name: "Pomoc i przewodnik" })
  ).toBeVisible();

  await page.getByPlaceholder("Szukaj ustawień").fill("usuń dane");
  const privacy = page.getByRole("main").getByRole("button", { name: "Eksport i konto" });
  await expect(privacy).toBeVisible();
  await privacy.click();
  await expect(page).toHaveURL(/tab=privacy/);
  await expect(page.getByText(/Kasuje konto i prywatne dane/)).toBeVisible();
});

test("help offers public feedback without putting private data in the external URL", async ({
  page,
}) => {
  await gotoSettings(page, "?tab=help");
  const feedback = page.getByRole("region", { name: "Zgłoś błąd", exact: true });
  await expect(feedback).toContainText("Zgłoszenia w GitHub są publiczne");
  await expect(feedback).toContainText(
    "Nie dołączaj wyciągów, danych finansowych ani danych osobowych."
  );
  const link = feedback.getByRole("link", {
    name: "Otwórz zgłoszenie w GitHub (nowa karta)",
    exact: true,
  });
  await expect(link).toHaveAttribute("href", "https://github.com/adrianghub/portfelik/issues/new");
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  await link.focus();
  await expect(link).toBeFocused();
});
