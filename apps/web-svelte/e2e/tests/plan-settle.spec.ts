/**
 * Playwright spec - plan settlement surface.
 *
 * Covers:
 *  - /plans/[id]/settle renders ranked suggestions with rank badge + reason chips
 *  - Pomiń persists the dismissal (plan_settlement_dismissals) and survives reload
 *  - Powiąż calls link RPC, shows toast, removes tx from suggestions
 *  - After linking, navigating back to detail reflects updated linked amount
 *
 * All cases use mocked auth + Supabase stubs via injectFakeSession / mockSupabaseAPI.
 */

import { expect, test, type Page } from "@playwright/test";
import { TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

// ── Fixture data ─────────────────────────────────────────────────────────────

const PLAN_ID = "plan-1";

const SETTLE_PLAN = {
  id: PLAN_ID,
  name: "Wakacje",
  kind: "spend",
  budget_amount: 1000,
  target_amount: null,
  start_date: "2026-07-01",
  end_date: "2026-07-31",
  category_id: "cat-1",
  user_id: TEST_USER_ID,
  group_id: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

// category_id matches plan → category signal fires (30pts) + keyword "wakacje" (25pts)
// + amount fits 1000 budget (20pts) + baseline (25pts) → score=100, rank=high
const TX1 = {
  id: "tx-s1",
  description: "Zakupy spożywcze na wakacje",
  amount: 300,
  date: "2026-07-10",
  type: "expense",
  status: "paid",
  category_id: "cat-1",
  category_name: "Jedzenie",
  category_type: "expense",
  user_id: TEST_USER_ID,
  group_id: null,
  is_recurring: false,
  recurring_day: null,
  recurrence_frequency: null,
  recurrence_interval: 1,
  recurrence_weekday: null,
  recurrence_month: null,
  recurring_template_id: null,
  currency: "PLN",
  created_at: "2026-07-10T10:00:00Z",
  updated_at: "2026-07-10T10:00:00Z",
};

// different category, no keyword match → baseline only (25pts) + amount (20pts) → score=45, rank=medium
const TX2 = {
  id: "tx-s2",
  description: "Transport na lotnisko",
  amount: 80,
  date: "2026-07-08",
  type: "expense",
  status: "paid",
  category_id: "cat-2",
  category_name: "Transport",
  category_type: "expense",
  user_id: TEST_USER_ID,
  group_id: null,
  is_recurring: false,
  recurring_day: null,
  recurrence_frequency: null,
  recurrence_interval: 1,
  recurrence_weekday: null,
  recurrence_month: null,
  recurring_template_id: null,
  currency: "PLN",
  created_at: "2026-07-08T10:00:00Z",
  updated_at: "2026-07-08T10:00:00Z",
};

// keyword "wakacje" (25pts) + baseline (25pts) → score=50, rank=medium (clears the 45% cutoff)
const TX_INCOME = {
  ...TX1,
  id: "tx-income",
  description: "Premia na wakacje",
  amount: 500,
  date: "2026-07-05",
  type: "income",
  category_id: "cat-3",
  category_name: "Wynagrodzenie",
  category_type: "income",
};

const MOCK_LINK = {
  id: "link-1",
  plan_id: PLAN_ID,
  transaction_id: "tx-s1",
  created_by: TEST_USER_ID,
  created_at: "2026-07-10T12:00:00Z",
};

// ── Shared setup ──────────────────────────────────────────────────────────────

/** Sets up base mocks then overrides settle-specific routes. */
async function setupSettleMocks(page: Page): Promise<void> {
  await injectFakeSession(page);
  await mockSupabaseAPI(page);

  // Return our plan (with budget + category_id) for any single-plan lookup
  await page.route(/.*\/rest\/v1\/plans.*id=eq\.plan-1.*/, (route) => {
    route.fulfill({ status: 200, json: SETTLE_PLAN });
  });

  // Return our eligible transactions (overrides MOCK_TRANSACTIONS from base mock)
  await page.route(/.*\/rest\/v1\/transactions_with_category.*/, (route) => {
    const url = route.request().url();
    if (url.includes("type=eq.income")) {
      return route.fulfill({ status: 200, json: [TX_INCOME] });
    }
    // Honor an id=in.(...) lookup (settlement-memory dismissed-key fetch) so only the
    // dismissed rows come back, mirroring PostgREST instead of returning every tx.
    const idFilter = decodeURIComponent(url).match(/id=in\.\(([^)]*)\)/);
    if (idFilter) {
      const ids = idFilter[1].split(",").map((v) => v.replace(/"/g, ""));
      return route.fulfill({
        status: 200,
        json: [TX1, TX2, TX_INCOME].filter((t) => ids.includes(t.id)),
      });
    }
    return route.fulfill({ status: 200, json: [TX1, TX2] });
  });

  // Plan links: empty by default (no linked, no blocked)
  await page.route(/.*\/rest\/v1\/plan_transaction_links.*/, (route) => {
    route.fulfill({ status: 200, json: [] });
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("plan settle page", () => {
  test("renders suggestion cards with rank badge and reason chips", async ({ page }) => {
    await setupSettleMocks(page);
    await page.goto(`/plans/${PLAN_ID}/settle`);

    // Suggestions visible
    await expect(page.getByText("Zakupy spożywcze na wakacje")).toBeVisible();
    await expect(page.getByText("Transport na lotnisko")).toBeVisible();

    // TX1 → high rank badge
    await expect(page.getByText(/Pasuje świetnie/)).toBeVisible();
    // TX2 → medium rank badge
    await expect(page.getByText(/Może pasować/)).toBeVisible();

    // At least one reason chip visible (category, keyword, or amount)
    await expect(page.getByText("✓ kategoria: Jedzenie")).toBeVisible();
  });

  test("renders income suggestions on the Wpływy tab", async ({ page }) => {
    await setupSettleMocks(page);
    await page.goto(`/plans/${PLAN_ID}/settle`);

    await page.getByRole("button", { name: "Wpływy" }).click();

    await expect(page.getByText("Premia na wakacje")).toBeVisible();
    await expect(page.getByText(/Słabe trafienie|Może pasować|Pasuje świetnie/)).toBeVisible();
  });

  test("Pomiń persists the dismissal and keeps it hidden after reload", async ({ page }) => {
    await setupSettleMocks(page);

    // Stateful dismissals mock: empty until the dismiss POST lands, then returns the row.
    let dismissPosted = false;
    await page.route(/.*\/rest\/v1\/plan_settlement_dismissals.*/, (route) => {
      if (route.request().method() === "POST") {
        dismissPosted = true;
        return route.fulfill({
          status: 201,
          json: [{ id: "dis-1", plan_id: PLAN_ID, transaction_id: "tx-s1" }],
        });
      }
      return route.fulfill({
        status: 200,
        json: dismissPosted ? [{ transaction_id: "tx-s1" }] : [],
      });
    });

    let linkRpcCalled = false;
    page.on("request", (req) => {
      if (req.url().includes("/rpc/")) {
        linkRpcCalled = true;
      }
    });

    await page.goto(`/plans/${PLAN_ID}/settle`);
    await expect(page.getByText("Zakupy spożywcze na wakacje")).toBeVisible();

    // Dismiss TX1
    const tx1Card = page
      .locator("div.rounded-2xl")
      .filter({ hasText: "Zakupy spożywcze na wakacje" });
    await tx1Card.getByRole("button", { name: /Pomiń/ }).click();

    // TX1 gone, TX2 still visible
    await expect(page.getByText("Zakupy spożywcze na wakacje")).not.toBeVisible();
    await expect(page.getByText("Transport na lotnisko")).toBeVisible();

    // Dismissal was persisted (poll: getUser + upsert happen async after the optimistic hide)
    await expect.poll(() => dismissPosted).toBe(true);
    expect(linkRpcCalled).toBe(false);

    // After a full reload the dismissal still hides TX1
    await page.reload();
    await expect(page.getByText("Transport na lotnisko")).toBeVisible();
    await expect(page.getByText("Zakupy spożywcze na wakacje")).not.toBeVisible();
  });

  test("Powiąż calls link RPC and removes transaction from suggestions", async ({ page }) => {
    let linked = false;

    await injectFakeSession(page);
    await mockSupabaseAPI(page);

    await page.route(/.*\/rest\/v1\/plans.*id=eq\.plan-1.*/, (route) => {
      route.fulfill({ status: 200, json: SETTLE_PLAN });
    });

    // After linking: tx-s1 appears in linked list; eligible drops to tx-s2 only
    await page.route(/.*\/rest\/v1\/transactions_with_category.*/, (route) => {
      const url = route.request().url();
      if (linked && url.includes("id=in.")) {
        // fetchLinkedTransactions fetching linked tx details
        return route.fulfill({ status: 200, json: [TX1] });
      }
      // eligible query - return tx-s2 only after link, both before
      route.fulfill({ status: 200, json: url.includes("type=eq.income") ? [TX_INCOME] : linked ? [TX2] : [TX1, TX2] });
    });

    await page.route(/.*\/rest\/v1\/plan_transaction_links.*/, (route) => {
      const url = route.request().url();
      if (linked && url.includes(`plan_id=eq.${PLAN_ID}`)) {
        return route.fulfill({ status: 200, json: [MOCK_LINK] });
      }
      route.fulfill({ status: 200, json: [] });
    });

    // Link RPC - set flag so subsequent fetches return updated state
    await page.route(/.*\/rpc\/link_plan_transaction.*/, (route) => {
      linked = true;
      route.fulfill({ status: 200, json: MOCK_LINK });
    });

    await page.goto(`/plans/${PLAN_ID}/settle`);
    await expect(page.getByText("Zakupy spożywcze na wakacje")).toBeVisible();

    // Click Powiąż on TX1 card
    const tx1Card = page
      .locator("div.rounded-2xl")
      .filter({ hasText: "Zakupy spożywcze na wakacje" });
    await tx1Card.getByRole("button", { name: /Powiąż/ }).click();

    // Toast confirms success
    await expect(page.getByText("Transakcja dodana do planu.")).toBeVisible();

    // TX1 removed from suggestions; it may still be visible in the linked section.
    const suggestionsSection = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Pasujące transakcje" }) });
    await expect(suggestionsSection.getByText("Zakupy spożywcze na wakacje")).not.toBeVisible();
    await expect(suggestionsSection.getByText("Transport na lotnisko")).toBeVisible();
  });

  test("manual add opens dialog and links new transaction", async ({ page }) => {
    let linked = false;
    const createdTxId = "tx-manual-1";

    await injectFakeSession(page);
    await mockSupabaseAPI(page);

    await page.route(/.*\/rest\/v1\/plans.*id=eq\.plan-1.*/, (route) => {
      route.fulfill({ status: 200, json: SETTLE_PLAN });
    });

    await page.route(/.*\/rest\/v1\/transactions_with_category.*/, (route) => {
      const url = route.request().url();
      if (linked && url.includes("id=in.")) {
        return route.fulfill({
          status: 200,
          json: [{ ...TX1, id: createdTxId, description: "Ręczny wydatek", amount: 150 }],
        });
      }
      return route.fulfill({ status: 200, json: [] });
    });

    await page.route(/.*\/rest\/v1\/transactions(?!_with_category).*/, async (route) => {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 201,
          json: {
            ...TX1,
            id: createdTxId,
            description: "Ręczny wydatek",
            amount: 150,
          },
        });
      }
      return route.fulfill({ status: 200, json: [] });
    });

    await page.route(/.*\/rest\/v1\/plan_transaction_links.*/, (route) => {
      const url = route.request().url();
      if (linked && url.includes(`plan_id=eq.${PLAN_ID}`)) {
        return route.fulfill({
          status: 200,
          json: [{ ...MOCK_LINK, transaction_id: createdTxId }],
        });
      }
      return route.fulfill({ status: 200, json: [] });
    });

    await page.route(/.*\/rpc\/link_plan_transaction.*/, (route) => {
      linked = true;
      route.fulfill({ status: 200, json: { ...MOCK_LINK, transaction_id: createdTxId } });
    });

    await page.goto(`/plans/${PLAN_ID}/settle`);
    await expect(page.getByText("Wakacje")).toBeVisible();

    await page.getByRole("button", { name: /Dodaj ręcznie/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Kwota").fill("150");
    await page.getByLabel("Opis").fill("Ręczny wydatek");
    // Category combobox clears a prefilled id until categories load; pick explicitly.
    await page.locator("#tx-cat").click();
    await page.locator("#tx-cat").fill("Jedzenie");
    await page.getByRole("option", { name: "Jedzenie" }).click();
    await page.getByRole("button", { name: "Zapisz" }).click();

    await expect(page.getByText("Transakcja dodana do planu.")).toBeVisible();
    await expect(page.getByText("Ręczny wydatek")).toBeVisible();
  });

  test("after linking, navigating back to detail shows updated progress", async ({ page }) => {
    let linked = false;

    await injectFakeSession(page);
    await mockSupabaseAPI(page);

    await page.route(/.*\/rest\/v1\/plans.*id=eq\.plan-1.*/, (route) => {
      route.fulfill({ status: 200, json: SETTLE_PLAN });
    });

    await page.route(/.*\/rest\/v1\/transactions_with_category.*/, (route) => {
      const url = route.request().url();
      if (linked && url.includes("id=in.")) {
        return route.fulfill({ status: 200, json: [TX1] });
      }
      route.fulfill({ status: 200, json: url.includes("type=eq.income") ? [TX_INCOME] : linked ? [TX2] : [TX1, TX2] });
    });

    await page.route(/.*\/rest\/v1\/plan_transaction_links.*/, (route) => {
      const url = route.request().url();
      if (linked && url.includes(`plan_id=eq.${PLAN_ID}`)) {
        return route.fulfill({ status: 200, json: [MOCK_LINK] });
      }
      route.fulfill({ status: 200, json: [] });
    });

    await page.route(/.*\/rpc\/link_plan_transaction.*/, (route) => {
      linked = true;
      route.fulfill({ status: 200, json: MOCK_LINK });
    });

    await page.goto(`/plans/${PLAN_ID}`);
    await expect(page.getByRole("heading", { name: "Wakacje" })).toBeVisible();
    await page.goto(`/plans/${PLAN_ID}/settle`);
    await expect(page.getByText("Zakupy spożywcze na wakacje")).toBeVisible();

    // Link TX1
    const tx1Card = page
      .locator("div.rounded-2xl")
      .filter({ hasText: "Zakupy spożywcze na wakacje" });
    await tx1Card.getByRole("button", { name: /Powiąż/ }).click();
    await expect(page.getByText("Transakcja dodana do planu.")).toBeVisible();

    // Navigate back to detail (history.back from settle → detail)
    await page.getByRole("button", { name: /Wróć|Back|←/ }).click();
    await page.waitForURL(`**/plans/${PLAN_ID}`, { waitUntil: "commit" });

    // Detail page loaded (plan name visible in heading)
    await expect(page.getByRole("heading", { name: "Wakacje" })).toBeVisible();

    // POSTĘP PLANU hero shows linked amount (TX1.amount = 300)
    await expect(page.getByLabel("Postęp planu").getByText(/300,00/).first()).toBeVisible();
  });
});
