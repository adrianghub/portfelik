import type { Page } from "@playwright/test";
import {
  MOCK_CATEGORIES,
  MOCK_DEBT_TERMS,
  MOCK_NEW_TRANSACTION,
  MOCK_PLANS,
  MOCK_PROFILE,
  MOCK_TRANSACTIONS,
  MOCK_USER,
} from "./fixtures";

function findMockPlan(url: string) {
  const match = url.match(/id=eq\.([^&]+)/);
  if (!match) return MOCK_PLANS[0];
  return MOCK_PLANS.find((p) => p.id === match[1]) ?? MOCK_PLANS[0];
}

/** Debt detail accrues daily interest from terms.updated_at; keep anchor at today in mocks. */
function withDebtTermsAccrualToday<T extends { updated_at: string }>(terms: T[]): T[] {
  const anchor = `${new Date().toISOString().slice(0, 10)}T10:00:00Z`;
  return terms.map((term) => ({ ...term, updated_at: anchor }));
}

function filterMockDebtTerms(url: string) {
  const inMatch = url.match(/plan_id=in\.\(([^)]+)\)/);
  if (inMatch) {
    const ids = inMatch[1].split(",").map((id) => id.trim());
    return withDebtTermsAccrualToday(MOCK_DEBT_TERMS.filter((t) => ids.includes(t.plan_id)));
  }
  const eqMatch = url.match(/plan_id=eq\.([^&]+)/);
  if (eqMatch) {
    const term = MOCK_DEBT_TERMS.find((t) => t.plan_id === eqMatch[1]);
    return term ? withDebtTermsAccrualToday([term]) : [];
  }
  return withDebtTermsAccrualToday(MOCK_DEBT_TERMS);
}

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

      // ── Plan transaction links ───────────────────────────────────────────
      if (url.includes("/plan_transaction_links")) {
        return route.fulfill({ status: 200, json: [] });
      }

      // ── Plan settlement dismissals ────────────────────────────────────────
      if (url.includes("/plan_settlement_dismissals")) {
        if (method === "POST") {
          return route.fulfill({ status: 201, json: [] });
        }
        return route.fulfill({ status: 200, json: [] });
      }

      // ── Debt plan terms ──────────────────────────────────────────────────
      if (url.includes("/plan_debt_terms")) {
        if (method === "POST") {
          const body = route.request().postDataJSON() as Record<string, unknown>;
          return route.fulfill({
            status: 201,
            json: {
              plan_id: body.plan_id,
              original_amount: body.original_amount,
              current_balance: body.current_balance,
              annual_rate: body.annual_rate,
              monthly_payment: body.monthly_payment,
              anchor_balance: body.anchor_balance ?? body.current_balance,
              balance_anchor_date: body.balance_anchor_date ?? "2026-06-01",
              created_at: "2026-06-01T10:00:00Z",
              updated_at: "2026-06-01T10:00:00Z",
            },
          });
        }
        return route.fulfill({ status: 200, json: filterMockDebtTerms(url) });
      }

      // ── Financial snapshots ──────────────────────────────────────────────
      if (url.includes("/financial_snapshots")) {
        if (method === "POST" || method === "PATCH") {
          return route.fulfill({
            status: 201,
            json: {
              user_id: "00000000-0000-0000-0000-000000000001",
              as_of_date: "2026-06-01",
              cash_amount: 42000,
              investments_amount: 51000,
              real_estate_amount: 420000,
              created_at: "2026-06-01T10:00:00Z",
              updated_at: "2026-06-01T10:00:00Z",
            },
          });
        }
        return route.fulfill({ status: 200, json: [] });
      }

      // ── Plans ────────────────────────────────────────────────────────────
      if (url.includes("/plans")) {
        if (method === "POST") {
          return route.fulfill({
            status: 201,
            json: {
              ...MOCK_PLANS[0],
              id: "plan-new",
              name: "Nowy plan",
              created_at: "2026-05-07T10:00:00Z",
              updated_at: "2026-05-07T10:00:00Z",
            },
          });
        }
        if (method === "DELETE") {
          return route.fulfill({ status: 204, body: "" });
        }
        if (url.includes("id=eq.")) {
          return route.fulfill({ status: 200, json: findMockPlan(url) });
        }
        if (url.includes("id=in.")) {
          const ids = (url.match(/id=in\.\(([^)]+)\)/)?.[1] ?? "")
            .split(",")
            .map((id) => id.trim());
          return route.fulfill({
            status: 200,
            json: MOCK_PLANS.filter((p) => ids.includes(p.id)),
          });
        }
        return route.fulfill({ status: 200, json: MOCK_PLANS });
      }

      // ── Groups / invitations / notifications / other ──────────────────────
      return route.fulfill({ status: 200, json: [] });
    });
}
