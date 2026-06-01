import type { Page } from "@playwright/test";
import {
  MOCK_CATEGORIES,
  MOCK_NEW_LIST,
  MOCK_NEW_TRANSACTION,
  MOCK_PROFILE,
  MOCK_SHOPPING_LIST_DETAIL,
  MOCK_SHOPPING_LISTS_RAW,
  MOCK_TRANSACTIONS,
  MOCK_USER,
} from "./fixtures";

const SUPABASE_URL = "https://emqzcygfwcvbmhxhfkcc.supabase.co";
const SUPABASE_URLS = [SUPABASE_URL, "http://127.0.0.1:54321", "http://localhost:54321"] as const;
const STORAGE_KEYS = [
  "sb-emqzcygfwcvbmhxhfkcc-auth-token",
  "sb-127-auth-token",
  "sb-localhost-auth-token",
] as const;

/**
 * Injects a fake Supabase session into localStorage before the page loads.
 * Must be called before page.goto().
 */
export async function injectFakeSession(page: Page): Promise<void> {
  const session = {
    access_token: "fake-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "fake-refresh-token",
    user: MOCK_USER,
  };
  await page.addInitScript(
    ({ keys, value }) => {
      for (const key of keys) localStorage.setItem(key, JSON.stringify(value));
    },
    { keys: STORAGE_KEYS, value: session }
  );
}

/**
 * Intercepts all Supabase REST and auth calls and returns fixture data.
 * Must be called before page.goto().
 */
export async function mockSupabaseAPI(page: Page): Promise<void> {
  // Auth endpoints (getUser, token refresh, etc.)
  for (const url of SUPABASE_URLS) {
    await page.route(`${url}/auth/v1/**`, async (route) => {
      await route.fulfill({ status: 200, json: MOCK_USER });
    });
  }

  // Single REST handler - match by URL content to avoid ordering issues
  for (const supabaseUrl of SUPABASE_URLS)
    await page.route(`${supabaseUrl}/rest/v1/**`, async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      // ── Profiles ──────────────────────────────────────────────────────────
      if (url.includes("/profiles")) {
        return route.fulfill({ status: 200, json: [MOCK_PROFILE] });
      }

      // ── Categories ────────────────────────────────────────────────────────
      if (url.includes("/categories")) {
        return route.fulfill({ status: 200, json: MOCK_CATEGORIES });
      }

      // ── Transactions (view - must check before /transactions) ─────────────
      if (url.includes("/transactions_with_category")) {
        return route.fulfill({ status: 200, json: MOCK_TRANSACTIONS });
      }

      // ── Transactions (table mutations) ────────────────────────────────────
      if (url.includes("/transactions")) {
        if (method === "POST") {
          return route.fulfill({ status: 201, json: MOCK_NEW_TRANSACTION });
        }
        if (method === "DELETE") {
          return route.fulfill({ status: 204, body: "" });
        }
        return route.fulfill({ status: 200, json: MOCK_TRANSACTIONS });
      }

      // ── Shopping item categories ─────────────────────────────────────────
      if (url.includes("/shopping_item_categories")) {
        if (method === "POST") {
          return route.fulfill({
            status: 201,
            json: {
              id: "shopping-item-category-new",
              user_id: MOCK_USER.id,
              name: "Warzywa",
              position: 0,
              created_at: "2026-05-20T10:00:00Z",
              updated_at: "2026-05-20T10:00:00Z",
            },
          });
        }
        return route.fulfill({ status: 200, json: [] });
      }

      // ── Shopping list items ───────────────────────────────────────────────
      if (url.includes("/shopping_list_items")) {
        if (method === "POST") {
          return route.fulfill({
            status: 201,
            json: {
              id: "item-new",
              name: "Nowy element",
              quantity: null,
              unit: null,
              completed: false,
              position: 10,
              shopping_list_id: "list-1",
              created_at: "2026-05-07T10:00:00Z",
              updated_at: "2026-05-07T10:00:00Z",
            },
          });
        }
        if (method === "PATCH") {
          return route.fulfill({ status: 200, json: {} });
        }
        return route.fulfill({ status: 200, json: [] });
      }

      // ── Shopping lists (detail - has id=eq. in URL) ───────────────────────
      if (url.includes("/shopping_lists") && url.includes("id=eq.")) {
        if (method === "DELETE") {
          return route.fulfill({ status: 204, body: "" });
        }
        // fetchShoppingListById uses .single() → returns object not array
        return route.fulfill({ status: 200, json: MOCK_SHOPPING_LIST_DETAIL });
      }

      // ── Shopping lists (list) ─────────────────────────────────────────────
      if (url.includes("/shopping_lists")) {
        if (method === "POST") {
          return route.fulfill({ status: 201, json: MOCK_NEW_LIST });
        }
        return route.fulfill({ status: 200, json: MOCK_SHOPPING_LISTS_RAW });
      }

      // ── RPCs ──────────────────────────────────────────────────────────────
      if (url.includes("/rpc/complete_shopping_list")) {
        return route.fulfill({
          status: 200,
          json: { id: "tx-from-list", amount: 100, category_id: "cat-1" },
        });
      }

      // ── Groups / invitations / notifications / other ──────────────────────
      return route.fulfill({ status: 200, json: [] });
    });
}
