/**
 * Demo 2.0 identity flow (mocked): open demo → CSV → import/history/analysis →
 * switch to real → back to demo without mixing financial rows.
 */
import { expect, test, type Page, type Route } from "@playwright/test";
import { fulfillSupabaseJson, stubServiceWorkerForTests } from "../helpers/mock-auth";
import { MOCK_CATEGORIES, MOCK_PROFILE, TEST_USER_ID } from "../helpers/fixtures";

const DEMO_USER_ID = "00000000-0000-0000-0000-0000000000d1";
const REAL_USER_ID = TEST_USER_ID;

const STORAGE_KEYS = [
  "sb-nveyzxxnyccpnesebvuw-auth-token",
  "sb-emqzcygfwcvbmhxhfkcc-auth-token",
  "sb-127-auth-token",
  "sb-localhost-auth-token",
] as const;

const DEMO_SESSION_KEY = "jakstoimy.auth.demo.session.v1";
const REAL_SESSION_KEY = "jakstoimy.auth.real.session.v1";
const PENDING_KEY = "jakstoimy.auth.pending_switch.v1";
const ACTIVE_KIND_KEY = "jakstoimy.auth.active_kind.v1";

const DEMO_USER = {
  id: DEMO_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "demo@jakstoimy.demo",
  app_metadata: { account_kind: "demo", provider: "email", providers: ["email"] },
  user_metadata: { name: "Konto demo" },
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
};

const REAL_USER = {
  id: REAL_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "test@portfelik.test",
  app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { name: "Test User", full_name: "Test User" },
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

/** Minimal JWT so supabase-js `setSession` accepts the token in the browser. */
function mintAccessToken(kind: "demo" | "real", userId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      aud: "authenticated",
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
      kind,
    })
  ).toString("base64url");
  return `${header}.${payload}.${kind}`;
}

function sessionFor(kind: "demo" | "real", user: typeof DEMO_USER | typeof REAL_USER) {
  return {
    access_token: mintAccessToken(kind, user.id),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `${kind}-refresh`,
    user,
  };
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function demoTx() {
  const date = todayIso();
  return {
    id: "demo-tx-1",
    date,
    description: "DEMO BIEDRONKA",
    amount: 42.5,
    type: "expense",
    status: "paid",
    category_id: "cat-1",
    category_name: "Jedzenie",
    is_recurring: false,
    currency: "PLN",
    user_id: DEMO_USER_ID,
    group_id: null,
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
  };
}

function realTx() {
  const date = todayIso();
  return {
    id: "real-tx-1",
    date,
    description: "REAL WYNAGRODZENIE",
    amount: 5000,
    type: "income",
    status: "paid",
    category_id: "cat-3",
    category_name: "Wynagrodzenie",
    is_recurring: false,
    currency: "PLN",
    user_id: REAL_USER_ID,
    group_id: null,
    created_at: `${date}T10:00:00Z`,
    updated_at: `${date}T10:00:00Z`,
  };
}

function profileFor(userId: string, email: string) {
  return {
    ...MOCK_PROFILE,
    id: userId,
    email,
    name: userId === DEMO_USER_ID ? "Konto demo" : "Test User",
  };
}

function accessKind(authHeader: string | undefined): "demo" | "real" | null {
  if (!authHeader) return null;
  // Signature segment from mintAccessToken ends with `.demo` / `.real`.
  if (authHeader.includes(".demo")) return "demo";
  if (authHeader.includes(".real")) return "real";
  if (authHeader.includes("demo-refresh") || authHeader.includes("demo-access")) return "demo";
  if (authHeader.includes("real-refresh") || authHeader.includes("real-access")) return "real";
  return null;
}

async function mockIdentityBackend(page: Page) {
  await stubServiceWorkerForTests(page);

  await page.route("**/functions/v1/open-demo-account", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        tokenHash: "demo-token-hash",
        verifyType: "email",
        userId: DEMO_USER_ID,
      },
    });
  });

  await page.route("**/auth/v1/**", async (route: Route) => {
    const url = route.request().url();
    const method = route.request().method();

    if (url.includes("/verify") && method === "POST") {
      const demo = sessionFor("demo", DEMO_USER);
      return route.fulfill({ status: 200, json: demo });
    }

    if (url.includes("/token") && method === "POST") {
      const body = route.request().postData() ?? "";
      if (
        body.includes("real-refresh") ||
        body.includes('"kind":"real"') ||
        body.includes(".real")
      ) {
        return route.fulfill({ status: 200, json: sessionFor("real", REAL_USER) });
      }
      if (
        body.includes("demo-refresh") ||
        body.includes('"kind":"demo"') ||
        body.includes(".demo")
      ) {
        return route.fulfill({ status: 200, json: sessionFor("demo", DEMO_USER) });
      }
      return route.fulfill({
        status: 400,
        json: { error: "invalid_grant", error_description: `unmocked token body: ${body}` },
      });
    }

    if (url.includes("/user")) {
      const auth = route.request().headers()["authorization"] ?? "";
      const kind = accessKind(auth);
      if (kind === "real") return route.fulfill({ status: 200, json: REAL_USER });
      if (kind === "demo") return route.fulfill({ status: 200, json: DEMO_USER });
      return route.fulfill({ status: 401, json: { message: "Auth session missing" } });
    }

    if (url.includes("/logout")) {
      return route.fulfill({ status: 204, body: "" });
    }

    return route.fulfill({ status: 200, json: {} });
  });

  await page.route("**/rest/v1/**", async (route: Route) => {
    const url = route.request().url();
    const auth = route.request().headers()["authorization"] ?? "";
    const kind = accessKind(auth);
    const userId = kind === "real" ? REAL_USER_ID : DEMO_USER_ID;
    const email = kind === "real" ? REAL_USER.email : DEMO_USER.email;

    if (url.includes("/profiles")) {
      return fulfillSupabaseJson(route, profileFor(userId, email));
    }
    if (url.includes("/categories")) {
      return fulfillSupabaseJson(route, MOCK_CATEGORIES);
    }
    if (url.includes("/transactions_with_category") || url.includes("/transactions?")) {
      const rows = kind === "real" ? [realTx()] : [demoTx()];
      return fulfillSupabaseJson(route, rows);
    }
    if (url.includes("/transaction_import_sessions")) {
      return fulfillSupabaseJson(route, [
        {
          id: "demo-import-1",
          user_id: DEMO_USER_ID,
          bank_account_id: null,
          source_filename: "jakstoimy-demo.csv",
          source_file_hash: "hash-demo",
          detected_kind: "erste",
          adapter_kind: "erste",
          source_kind: "bank_statement",
          status: "committed",
          rows_total: 96,
          rows_committed: 96,
          rows_skipped: 0,
          rows_duplicate: 0,
          created_at: "2026-10-17T10:00:00Z",
          committed_at: "2026-10-17T10:05:00Z",
        },
      ]);
    }
    if (url.includes("/cash_positions")) {
      return route.fulfill({
        status: 200,
        json: {
          owner_id: userId,
          group_id: null,
          opening_amount: kind === "real" ? 1000 : 2500,
          as_of_date: "2026-10-15",
          balance_semantics: "end_of_day",
        },
      });
    }
    return fulfillSupabaseJson(route, []);
  });
}

async function seedDualIdentity(page: Page, active: "demo" | "real") {
  const demo = sessionFor("demo", DEMO_USER);
  const real = sessionFor("real", REAL_USER);
  await page.addInitScript(
    ({ keys, demoSession, realSession, activeKind, demoKey, realKey, pendingKey, activeKey }) => {
      if (localStorage.getItem("test-dual-identity-seeded")) return;
      localStorage.setItem("test-dual-identity-seeded", "1");
      localStorage.setItem("guided-tour-progress", JSON.stringify({ dismissed: true }));
      const pending = localStorage.getItem(pendingKey);
      if (pending) {
        // Let app bootstrap handle the switch; do not overwrite GoTrue storage.
        return;
      }
      const activeSession = activeKind === "demo" ? demoSession : realSession;
      for (const key of keys) {
        localStorage.setItem(key, JSON.stringify(activeSession));
      }
      // Park only the inactive identity — never duplicate the active credentials.
      if (activeKind === "demo") {
        localStorage.setItem(realKey, JSON.stringify(realSession));
        localStorage.removeItem(demoKey);
      } else {
        localStorage.setItem(demoKey, JSON.stringify(demoSession));
        localStorage.removeItem(realKey);
      }
      localStorage.setItem(activeKey, activeKind);
    },
    {
      keys: STORAGE_KEYS,
      demoSession: demo,
      realSession: real,
      activeKind: active,
      demoKey: DEMO_SESSION_KEY,
      realKey: REAL_SESSION_KEY,
      pendingKey: PENDING_KEY,
      activeKey: ACTIVE_KIND_KEY,
    }
  );
  await stubServiceWorkerForTests(page);
}

test.describe("Demo 2.0 identity flow", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("open demo → CSV → Historia/Analizy → switch real → back to demo", async ({ page }) => {
    // This complete journey now includes the optional welcome and two hard reinits.
    test.setTimeout(60_000);
    await mockIdentityBackend(page);

    // 1) Open demo from login
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Otwórz konto demo" })).toBeVisible();
    await page.getByRole("button", { name: "Otwórz konto demo" }).click();
    await expect(page).toHaveURL(/\/demo\/welcome/, { timeout: 15_000 });
    await page.getByRole("button", { name: "Pomiń na razie" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByTestId("demo-account-badge").first()).toBeVisible();

    // 2) Sample CSV is served and has no future-dated history end
    const csv = await page.request.get("/sample-imports/jakstoimy-demo.csv");
    expect(csv.ok()).toBeTruthy();
    const csvText = await csv.text();
    expect(csvText.startsWith("2026-10-17,")).toBeTruthy();
    expect(csvText).toContain("17-10-2026,17-10-2026,Przelew przychodzacy zwrot");
    expect(csvText).not.toContain("20-10-2026");

    // 3) Import history surface
    await page.goto("/import/history");
    await expect(page.getByRole("button", { name: /jakstoimy-demo\.csv/ })).toBeVisible({
      timeout: 10_000,
    });

    // 4) Ledger isolation + Analizy (Historia / Prognoza)
    await page.goto("/transactions");
    await expect(page.getByRole("table").getByText("DEMO BIEDRONKA")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("REAL WYNAGRODZENIE")).toHaveCount(0);

    await page.goto("/analysis");
    await expect(page.getByRole("tab", { name: "Historia", exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Historia", exact: true }).click();

    await page.goto("/analysis?mode=forecast");
    await expect(page.getByTestId("analysis-forecast")).toBeVisible({ timeout: 10_000 });

    // 5) Park a real session and switch (hard reinit)
    await page.evaluate(
      ({ realKey, realSession }) => {
        localStorage.setItem(realKey, JSON.stringify(realSession));
      },
      { realKey: REAL_SESSION_KEY, realSession: sessionFor("real", REAL_USER) }
    );

    await page.locator('header button[aria-haspopup="menu"]').first().click();
    await expect(
      page.getByRole("menuitem", { name: "Przełącz na konto rzeczywiste" })
    ).toBeVisible();
    await page.getByRole("menuitem", { name: "Przełącz na konto rzeczywiste" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    // Wait until pending switch is consumed and the real identity is loaded.
    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), PENDING_KEY))
      .toBeNull();
    await expect(page.getByRole("button", { name: REAL_USER.email })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("demo-account-badge")).toHaveCount(0);

    await page.goto("/transactions");
    await expect(page.getByRole("table").getByText("REAL WYNAGRODZENIE")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("DEMO BIEDRONKA")).toHaveCount(0);

    // 6) Switch back to demo — progress (parked demo + import history) remains
    await page.locator('header button[aria-haspopup="menu"]').first().click();
    await expect(page.getByRole("menuitem", { name: "Przełącz na konto demo" })).toBeVisible();
    await page.getByRole("menuitem", { name: "Przełącz na konto demo" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect
      .poll(async () => page.evaluate((key) => localStorage.getItem(key), PENDING_KEY))
      .toBeNull();
    await expect(page.getByTestId("demo-account-badge").first()).toBeVisible({ timeout: 15_000 });

    await page.goto("/transactions");
    await expect(page.getByRole("table").getByText("DEMO BIEDRONKA")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("REAL WYNAGRODZENIE")).toHaveCount(0);

    await page.goto("/import/history");
    await expect(page.getByRole("button", { name: /jakstoimy-demo\.csv/ })).toBeVisible();
  });

  test("real logout preserves demo without restoring the real session", async ({ page }) => {
    let provisions = 0;
    page.on("request", (request) => {
      if (request.url().includes("/functions/v1/open-demo-account")) provisions += 1;
    });
    await mockIdentityBackend(page);
    await seedDualIdentity(page, "real");
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: REAL_USER.email })).toBeVisible();
    await page.locator('header button[aria-haspopup="menu"]').first().click();
    await page.getByRole("menuitem", { name: "Wyloguj się" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.reload();
    await expect(page.getByTestId("demo-account-badge")).toHaveCount(0);
    await page.getByRole("button", { name: "Wróć do mojego demo" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("demo-account-badge").first()).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), REAL_SESSION_KEY)).toBeNull();
    expect(provisions).toBe(0);
  });

  test("closing demo preserves its identity and resumes without new provisioning", async ({
    page,
  }) => {
    let provisions = 0;
    page.on("request", (request) => {
      if (request.url().includes("/functions/v1/open-demo-account")) provisions += 1;
    });
    await mockIdentityBackend(page);
    await seedDualIdentity(page, "demo");
    await page.goto("/dashboard");
    await expect(page.getByTestId("demo-account-badge").first()).toBeVisible();

    await page.locator('header button[aria-haspopup="menu"]').first().click();
    await page.getByRole("menuitem", { name: "Zamknij demo" }).click();
    await expect(page).toHaveURL(/\/login/);

    const parked = await page.evaluate(
      ({ demoKey, realKey, pendingKey }) => ({
        demo: localStorage.getItem(demoKey),
        real: localStorage.getItem(realKey),
        pending: localStorage.getItem(pendingKey),
      }),
      { demoKey: DEMO_SESSION_KEY, realKey: REAL_SESSION_KEY, pendingKey: PENDING_KEY }
    );
    expect(JSON.parse(parked.demo!).user.id).toBe(DEMO_USER_ID);
    expect(parked.real).toBeNull();
    expect(parked.pending).toBeNull();
    await page.reload();
    await page.getByRole("button", { name: "Wróć do mojego demo" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId("demo-account-badge").first()).toBeVisible();
    await page.goto("/transactions");
    await expect(page.getByRole("table").getByText("DEMO BIEDRONKA")).toBeVisible();
    await expect(page.getByText("REAL WYNAGRODZENIE")).toHaveCount(0);
    expect(provisions).toBe(0);
  });
});
