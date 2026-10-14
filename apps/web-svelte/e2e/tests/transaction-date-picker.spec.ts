import { expect, test } from "@playwright/test";
import { MOCK_NEW_TRANSACTION } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`transaction date at ${viewport.width}px`, () => {
    test.use({ viewport, timezoneId: "Europe/Warsaw" });
    for (const selected of ["2025-02-17", "2027-01-07"]) {
      test(`keeps ${selected} through selection, save and reopen`, async ({ page }) => {
        await injectFakeSession(page);
        await mockSupabaseAPI(page);
        let saved: Record<string, unknown> | null = null;
        await page.route(/\/rest\/v1\/transactions(?:\?|$)/, async (route) => {
          if (route.request().method() !== "POST") return route.fallback();
          saved = route.request().postDataJSON();
          await route.fulfill({ json: { ...MOCK_NEW_TRANSACTION, ...saved } });
        });
        await page.route("**/rest/v1/transactions_with_category**", (route) => {
          const url = new URL(route.request().url());
          const row = { ...MOCK_NEW_TRANSACTION, ...saved };
          return route.fulfill({ json: url.searchParams.has("id") ? row : saved ? [row] : [] });
        });
        await page.goto("/transactions?group=own");
        await page
          .getByRole("button", { name: /Dodaj ręcznie/ })
          .first()
          .click();
        const form = page.getByRole("dialog", { name: "Nowa transakcja" });
        await form.locator("#tx-amount").fill("99.99");
        await form.locator("#tx-desc").fill("Data regresja");
        await form.locator("#tx-cat").fill("Jedzenie");
        await page.getByRole("option", { name: "Jedzenie", exact: true }).click();
        await form.getByRole("button", { name: "Data", exact: true }).click();
        const calendar = page.getByRole("dialog", { name: "Data", exact: true });
        await calendar.getByRole("spinbutton").fill(selected.slice(0, 4));
        await calendar.getByRole("combobox").selectOption(String(Number(selected.slice(5, 7))));
        await calendar.locator(`[data-date="${selected}"]`).click();
        await expect(calendar).toBeHidden();
        const display = selected.split("-").reverse().join(".");
        await expect(form.getByRole("button", { name: "Data", exact: true })).toContainText(
          display
        );
        await form.getByRole("button", { name: "Zapisz", exact: true }).click();
        await expect(form).toBeHidden();
        expect(saved).toMatchObject({
          date: selected,
          status: selected < new Date().toISOString().slice(0, 10) ? "paid" : "upcoming",
        });
        await page.goto("/transactions?group=own&txId=tx-new");
        await page.locator("aside").getByRole("button", { name: "Edytuj", exact: true }).click();
        const edit = page.getByRole("dialog", { name: "Edytuj transakcję" });
        await expect(edit.getByRole("button", { name: "Data", exact: true })).toContainText(
          display
        );
      });
    }
  });
}
