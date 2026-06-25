import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

// The deterministic-actions surface ("Co wymaga uwagi") aggregates already-computed
// dashboard signals. With no committed import session in the mocks, the "import never"
// action always renders — a zero-seed signal we can assert and dismiss reliably.
const IMPORT_ACTION = /Zaimportuj pierwszy wyciąg/;

type DismissRow = { action_key: string; dismissed_until: string | null };

/**
 * Stateful action_dismissals mock so a dismiss survives reload (the memory contract).
 * Registered AFTER mockSupabaseAPI so Playwright's newest-first matching prefers it.
 */
async function mockDismissals(page: Page): Promise<void> {
  const dismissed: DismissRow[] = [];
  await page.route("**/rest/v1/action_dismissals**", async (route: Route) => {
    const method = route.request().method();
    if (method === "POST") {
      const body = route.request().postDataJSON() as DismissRow | DismissRow[];
      const rows = Array.isArray(body) ? body : [body];
      for (const r of rows) {
        if (!dismissed.some((d) => d.action_key === r.action_key)) {
          dismissed.push({ action_key: r.action_key, dismissed_until: r.dismissed_until ?? null });
        }
      }
      return route.fulfill({ status: 201, json: dismissed });
    }
    if (method === "DELETE") {
      const match = route.request().url().match(/action_key=eq\.([^&]+)/);
      if (match) {
        const key = decodeURIComponent(match[1]);
        const idx = dismissed.findIndex((d) => d.action_key === key);
        if (idx >= 0) dismissed.splice(idx, 1);
      }
      return route.fulfill({ status: 200, json: [] });
    }
    return route.fulfill({ status: 200, json: dismissed });
  });
}

test("surfaces a deterministic action that deep-links to its resolution", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await mockDismissals(page);
  await page.goto("/dashboard");

  const action = page.getByRole("link", { name: IMPORT_ACTION });
  await expect(action).toBeVisible();
  await expect(action).toHaveAttribute("href", "/import");
});

test("dismissing an action persists across reload", async ({ page }) => {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);
  await mockDismissals(page);
  await page.goto("/dashboard");

  const action = page.getByRole("link", { name: IMPORT_ACTION });
  await expect(action).toBeVisible();

  // Dismiss via the row's ✕ button.
  const row = page.locator("li").filter({ hasText: IMPORT_ACTION });
  await row.getByRole("button", { name: "Pomiń" }).click();
  await expect(page.getByRole("link", { name: IMPORT_ACTION })).toHaveCount(0);

  // Memory: the dismissed action stays gone after a full reload.
  await page.reload();
  await expect(page.getByRole("link", { name: IMPORT_ACTION })).toHaveCount(0);
});
