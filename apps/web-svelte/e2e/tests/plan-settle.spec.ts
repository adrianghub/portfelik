/**
 * Playwright spec - plan settlement surface.
 *
 * Covers:
 *  - /plans/[id]/settle renders ranked suggestions with rank badge + reason chips
 *  - Odrzuć dismisses suggestion client-side without making an API call
 *  - Powiąż calls link RPC, shows toast, removes tx from suggestions
 *  - After linking, navigating back to detail reflects updated linked amount
 *
 * All cases use mocked auth + Supabase stubs via injectFakeSession / mockSupabaseAPI.
 */

import { expect, test, type Page } from "@playwright/test";
import { TEST_USER_ID } from "../helpers/fixtures";
import { injectFakeSession, mockSupabaseAPI } from "../helpers/mock-auth";

// ── Fixture data ─────────────────────────────────────────────────────────────

const PLAN_ID = "list-1";

const SETTLE_PLAN = {
  id: PLAN_ID,
  name: "Wakacje",
  total_amount: 1000,
  planned_for: "2026-07-15",
  category_id: "cat-1",
  user_id: TEST_USER_ID,
  group_id: null,
  completed_at: null,
  shopping_started_at: "2026-06-01T00:00:00Z",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  shopping_list_items: [],
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
  shopping_list_id: null,
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
  shopping_list_id: null,
  currency: "PLN",
  created_at: "2026-07-08T10:00:00Z",
  updated_at: "2026-07-08T10:00:00Z",
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
  await page.route(/.*\/rest\/v1\/shopping_lists.*id=eq\.list-1.*/, (route) => {
    route.fulfill({ status: 200, json: SETTLE_PLAN });
  });

  // Return our eligible transactions (overrides MOCK_TRANSACTIONS from base mock)
  await page.route(/.*\/rest\/v1\/transactions_with_category.*/, (route) => {
    route.fulfill({ status: 200, json: [TX1, TX2] });
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
    await expect(page.getByText(/Wysokie dopasowanie/)).toBeVisible();
    // TX2 → medium rank badge
    await expect(page.getByText(/Średnie dopasowanie/)).toBeVisible();

    // At least one reason chip visible (category, keyword, or amount)
    await expect(page.getByText(/kategoria:|słowo kluczowe|kwota mieści/)).toBeVisible();
  });

  test("Odrzuć removes suggestion client-side without API call", async ({ page }) => {
    await setupSettleMocks(page);

    let apiCallMade = false;
    page.on("request", (req) => {
      if (req.url().includes("/rpc/") || req.method() === "POST") {
        apiCallMade = true;
      }
    });

    await page.goto(`/plans/${PLAN_ID}/settle`);
    await expect(page.getByText("Zakupy spożywcze na wakacje")).toBeVisible();

    // Dismiss TX1
    const tx1Card = page
      .locator("div.rounded-2xl")
      .filter({ hasText: "Zakupy spożywcze na wakacje" });
    await tx1Card.getByRole("button", { name: /Odrzuć/ }).click();

    // TX1 gone, TX2 still visible
    await expect(page.getByText("Zakupy spożywcze na wakacje")).not.toBeVisible();
    await expect(page.getByText("Transport na lotnisko")).toBeVisible();

    // No link/unlink RPC was called
    expect(apiCallMade).toBe(false);
  });

  test("Powiąż calls link RPC and removes transaction from suggestions", async ({ page }) => {
    let linked = false;

    await injectFakeSession(page);
    await mockSupabaseAPI(page);

    await page.route(/.*\/rest\/v1\/shopping_lists.*id=eq\.list-1.*/, (route) => {
      route.fulfill({ status: 200, json: SETTLE_PLAN });
    });

    // After linking: tx-s1 appears in linked list; eligible drops to tx-s2 only
    await page.route(/.*\/rest\/v1\/transactions_with_category.*/, (route) => {
      const url = route.request().url();
      if (linked && url.includes("id=in.")) {
        // fetchLinkedTransactions fetching linked tx details
        return route.fulfill({ status: 200, json: [TX1] });
      }
      // eligible query — return tx-s2 only after link, both before
      route.fulfill({ status: 200, json: linked ? [TX2] : [TX1, TX2] });
    });

    await page.route(/.*\/rest\/v1\/plan_transaction_links.*/, (route) => {
      const url = route.request().url();
      if (linked && url.includes(`plan_id=eq.${PLAN_ID}`)) {
        return route.fulfill({ status: 200, json: [MOCK_LINK] });
      }
      route.fulfill({ status: 200, json: [] });
    });

    // Link RPC — set flag so subsequent fetches return updated state
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
    await expect(page.getByText("Transakcja powiązana z planem.")).toBeVisible();

    // TX1 removed from suggestions; TX2 remains
    await expect(page.getByText("Zakupy spożywcze na wakacje")).not.toBeVisible();
    await expect(page.getByText("Transport na lotnisko")).toBeVisible();
  });

  test("after linking, navigating back to detail shows updated progress", async ({ page }) => {
    let linked = false;

    await injectFakeSession(page);
    await mockSupabaseAPI(page);

    await page.route(/.*\/rest\/v1\/shopping_lists.*id=eq\.list-1.*/, (route) => {
      route.fulfill({ status: 200, json: SETTLE_PLAN });
    });

    await page.route(/.*\/rest\/v1\/transactions_with_category.*/, (route) => {
      const url = route.request().url();
      if (linked && url.includes("id=in.")) {
        return route.fulfill({ status: 200, json: [TX1] });
      }
      route.fulfill({ status: 200, json: linked ? [TX2] : [TX1, TX2] });
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

    await page.goto(`/plans/${PLAN_ID}/settle`);
    await expect(page.getByText("Zakupy spożywcze na wakacje")).toBeVisible();

    // Link TX1
    const tx1Card = page
      .locator("div.rounded-2xl")
      .filter({ hasText: "Zakupy spożywcze na wakacje" });
    await tx1Card.getByRole("button", { name: /Powiąż/ }).click();
    await expect(page.getByText("Transakcja powiązana z planem.")).toBeVisible();

    // Navigate back to detail
    await page.getByRole("button", { name: /Wróć|Back|←/ }).click();
    await page.waitForURL(`**/plans/${PLAN_ID}`);

    // Detail page loaded (plan name visible in heading)
    await expect(page.getByRole("heading", { name: "Wakacje" })).toBeVisible();

    // POSTĘP PLANU hero shows linked amount (TX1.amount = 300)
    await expect(page.getByText("300")).toBeVisible();
  });
});
