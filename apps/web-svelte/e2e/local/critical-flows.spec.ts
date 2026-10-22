import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test as base, expect, type Page } from "@playwright/test";

const url = process.env.QUALITY_SUPABASE_URL!;
const anonKey = process.env.QUALITY_SUPABASE_ANON_KEY!;
const serviceKey = process.env.QUALITY_SUPABASE_SERVICE_KEY!;
const parsed = new URL(url);
if (
  process.env.QUALITY_LOCAL_FIXTURES !== "1" ||
  parsed.protocol !== "http:" ||
  !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
) {
  throw new Error("Local fixture tests refuse non-loopback databases.");
}
const options = { auth: { persistSession: false, autoRefreshToken: false } };
type User = {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
  session: Session;
};
type Fixtures = { admin: SupabaseClient; owner: User; peer: User };

async function createUser(admin: SupabaseClient): Promise<User> {
  const email = `quality-${randomUUID()}@portfelik.test`;
  const password = randomUUID();
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) throw created.error ?? new Error("No fixture user");
  const client = createClient(url, anonKey, options);
  const login = await client.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) throw login.error ?? new Error("No fixture session");
  const profile = await client
    .from("profiles")
    .update({ name: "Quality fixture", settings: { guidedTour: { dismissed: true } } })
    .eq("id", created.data.user.id);
  if (profile.error) throw profile.error;
  return { id: created.data.user.id, email, password, client, session: login.data.session };
}
const test = base.extend<{ fixtures: Fixtures }>({
  fixtures: async ({}, use) => {
    const admin = createClient(url, serviceKey, options);
    const users: User[] = [];
    try {
      users.push(await createUser(admin));
      users.push(await createUser(admin));
      await use({ admin, owner: users[0], peer: users[1] });
    } finally {
      // These exact IDs were created by this fixture. Never reuse/delete an existing account.
      for (const user of users) {
        const groups = await admin.from("user_groups").select("id").eq("owner_id", user.id);
        if (groups.error) throw groups.error;
        for (const group of groups.data ?? []) {
          const result = await admin.from("user_groups").delete().eq("id", group.id);
          if (result.error) throw result.error;
        }
      }
      for (const user of users) {
        const existing = await admin.auth.admin.getUserById(user.id);
        if (!existing.data.user) continue; // already removed by the account-deletion test
        const wipe = await user.client.rpc("delete_account");
        if (wipe.error) throw wipe.error;
      }
    }
  },
});
async function login(page: Page, user: User) {
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
      localStorage.setItem("guided-tour-progress", JSON.stringify({ dismissed: true }));
      localStorage.setItem("push_prompted_at", String(Date.now()));
    },
    { key: `sb-${parsed.hostname.split(".")[0]}-auth-token`, session: user.session }
  );
}

async function demoFixture(fixtures: Fixtures): Promise<User> {
  const user = fixtures.owner;
  expect(
    (await fixtures.admin.rpc("register_demo_identity", { p_user_id: user.id })).error
  ).toBeNull();
  const refreshed = await user.client.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) throw new Error("Demo refresh failed");
  user.session = refreshed.data.session;
  expect(
    (await user.client.from("profiles").update({ name: "Konto demo" }).eq("id", user.id)).error
  ).toBeNull();
  return user;
}

async function loginOnce(page: Page, user: User) {
  await page.addInitScript(
    ({ key, value }) => {
      if (sessionStorage.getItem("quality-login-once")) return;
      localStorage.setItem(key, JSON.stringify(value));
      sessionStorage.setItem("quality-login-once", "1");
      localStorage.setItem("push_prompted_at", String(Date.now()));
    },
    { key: `sb-${parsed.hostname.split(".")[0]}-auth-token`, value: user.session }
  );
}

test("optional demo name then one-click fixture uses real import, categories and cash model", async ({
  page,
  fixtures,
}) => {
  const unexpectedRequests: { status: number; path: string }[] = [];
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().startsWith(url + "/rest/v1/"))
      unexpectedRequests.push({
        status: response.status(),
        path: new URL(response.url()).pathname,
      });
  });
  const demo = await demoFixture(fixtures);
  await loginOnce(page, demo);
  await page.goto("/demo/welcome");
  await expect(page.getByRole("heading", { name: "Witaj w JakStoimy" })).toBeVisible();
  await page.getByLabel("Twoja nazwa").fill("Adrian");
  await page.getByRole("button", { name: "Pokaż moje demo" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: /Adrian/ })).toBeVisible();
  await expect(
    page.getByText("Przewidywane saldo na koniec miesiąca", { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByText("Brak nadchodzących i zaległych transakcji", { exact: true })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Wypełnij przykładowymi danymi" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Gotowe! Dodano 96 transakcji." })
  ).toBeVisible({ timeout: 60000 });
  await expect(page.getByText(/29\s*734,16/).first()).toBeVisible();
  const rows = await demo.client
    .from("transactions")
    .select("amount,type,status,category_id,categories(name)");
  expect(rows.error).toBeNull();
  expect(rows.data).toHaveLength(99);
  expect(rows.data!.filter((r) => r.status === "paid")).toHaveLength(96);
  expect(rows.data!.filter((r) => r.status === "overdue")).toHaveLength(1);
  expect(rows.data!.filter((r) => r.status === "upcoming")).toHaveLength(2);
  expect(
    rows
      .data!.filter((r) => r.type === "income" && r.status === "paid")
      .reduce((n, r) => n + Math.round(r.amount * 100), 0)
  ).toBe(6150000);
  expect(
    rows
      .data!.filter((r) => r.type === "expense" && r.status === "paid")
      .reduce((n, r) => n + Math.round(r.amount * 100), 0)
  ).toBe(3676584);
  for (const row of rows.data!)
    expect((row.categories as unknown as { name: string }).name).not.toMatch(/Inne/);
  expect(
    (
      await demo.client
        .from("cash_positions")
        .select("opening_amount,as_of_date,balance_semantics")
        .single()
    ).data
  ).toMatchObject({
    opening_amount: 5000,
    as_of_date: "2026-05-01",
    balance_semantics: "start_of_day",
  });
  await expect(page.getByRole("cell", { name: /Przykład: Zaległy rachunek/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Przykład: Ubezpieczenie/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Przykład: Zwrot/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Wypełnij przykładowymi danymi" })).toHaveCount(0);
  await page.getByRole("button", { name: "Usuń przykład", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Usuń", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByText("To przykładowe dane", { exact: true })).toHaveCount(0);
  expect((await demo.client.from("transactions").select("id")).data).toHaveLength(0);
  expect((await demo.client.from("cash_positions").select("id")).data).toHaveLength(0);
  await expect(
    page.getByText("Przewidywane saldo na koniec miesiąca", { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByText("Brak nadchodzących i zaległych transakcji", { exact: true })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Wypełnij przykładowymi danymi" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Gotowe! Dodano 96 transakcji." })
  ).toBeVisible({ timeout: 60000 });
  expect((await demo.client.from("transactions").select("id")).data).toHaveLength(99);
  expect(
    (await demo.client.from("transaction_import_sessions").select("id").eq("status", "committed"))
      .data
  ).toHaveLength(2);
  await page.goto("/transactions?startDate=2026-05-01&endDate=2026-10-31&group=own");
  await expect(
    page
      .locator("table")
      .getByText(/BIEDRONKA/i)
      .first()
  ).toBeVisible();
  await page.goto("/analysis?mode=forecast");
  await expect(page.getByTestId("analysis-forecast-today")).toContainText(/29\D?734,16/);
  await expect(page.getByTestId("analysis-forecast-income")).toContainText(/2\D?500,00/);
  await expect(page.getByTestId("analysis-forecast-expense")).not.toContainText(/^0,00/);
  await page.goto("/plans");
  await expect(page.getByRole("heading", { name: "Brak planów", exact: true })).toBeVisible();
  await page.goto("/settings?tab=profile");
  await page.getByRole("button", { name: "Edytuj", exact: true }).first().click();
  await expect(page.getByLabel("Twoja nazwa")).toHaveAttribute("maxlength", "30");
  await page.getByLabel("Twoja nazwa").fill("Lena");
  await page.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText("Lena", { exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: /Lena/ })).toBeVisible();
  expect(
    (await fixtures.peer.client.from("profiles").select("name").eq("id", fixtures.peer.id).single())
      .data?.name
  ).toBe("Quality fixture");
  expect((await fixtures.peer.client.from("transactions").select("id")).data).toHaveLength(0);
  expect(unexpectedRequests).toEqual([]);
});

test("demo skips name and retries cash failure after reload without duplicating its committed import", async ({
  page,
  fixtures,
}) => {
  const demo = await demoFixture(fixtures);
  await loginOnce(page, demo);
  await page.goto("/demo/welcome");
  await page.getByRole("button", { name: "Pomiń na razie" }).click();
  await expect(page.getByRole("heading", { name: /Konto demo/ })).toBeVisible();
  let rejectAnchor = true;
  await page.route("**/rest/v1/rpc/finish_demo_sample", async (route) => {
    if (route.request().method() === "POST" && rejectAnchor) {
      rejectAnchor = false;
      await route.fulfill({ status: 503, json: { message: "Injected local anchor failure" } });
    } else await route.continue();
  });
  await expect(
    page.getByText("Przewidywane saldo na koniec miesiąca", { exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByText("Brak nadchodzących i zaległych transakcji", { exact: true })
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Wypełnij przykładowymi danymi" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Nie udało się dodać danych" })
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.getByRole("button", { name: /Wypełnij przykładowymi danymi|Dokończ przygotowanie demo/ })
  ).toBeEnabled();
  expect((await demo.client.from("transactions").select("id")).data).toHaveLength(96);
  await page.reload();
  await page.getByRole("button", { name: "Dokończ przygotowanie demo" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Gotowe! Dodano 96 transakcji." })
  ).toBeVisible({ timeout: 60000 });
  expect((await demo.client.from("transactions").select("id")).data).toHaveLength(99);
  expect(
    (await demo.client.from("transaction_import_sessions").select("status,rows_committed")).data
  ).toEqual([{ status: "committed", rows_committed: 96 }]);
  expect(
    (await demo.client.from("cash_positions").select("opening_amount").single()).data
      ?.opening_amount
  ).toBe(5000);
});

test("first Demo to Real login preserves demo, then switches back and logout clears both", async ({
  page,
  fixtures,
}) => {
  let provisions = 0;
  await page.route("**/functions/v1/open-demo-account", (route) => {
    provisions += 1;
    return route.abort();
  });
  const demo = await demoFixture(fixtures);
  await loginOnce(page, demo);
  await page.goto("/dashboard");
  await page.locator('header button[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: "Przełącz na konto rzeczywiste" }).click();
  await expect(page).toHaveURL(/\/login\?account=real/);
  await expect(page.getByTestId("open-demo-account")).toHaveCount(0);
  await page.getByLabel("Adres e-mail").fill(fixtures.peer.email);
  await page.getByLabel("Hasło", { exact: true }).fill(fixtures.peer.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("demo-account-badge")).toHaveCount(0);
  await page.locator('header button[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: "Przełącz na konto demo" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByTestId("demo-account-badge").first()).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("demo-account-badge").first()).toBeVisible();
  await page.locator('header button[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: "Wyloguj się" }).click();
  await expect(page).toHaveURL(/\/login/);
  const parked = await page.evaluate(() =>
    Object.keys(localStorage).filter(
      (k) => k.startsWith("jakstoimy.auth.") || /^sb-.*-auth-token$/.test(k)
    )
  );
  expect(parked).toEqual([]);
  expect(provisions).toBe(0);
});
test("legacy seed failure rolls back tagged rows and a successful retry clears without remnants", async ({
  page,
  fixtures,
}) => {
  const demo = await demoFixture(fixtures);
  await loginOnce(page, demo);
  await page.goto("/dashboard");
  await expect(page.getByTestId("demo-account-badge").first()).toBeVisible();
  const endpoint = "**/rest/v1/rpc/create_demo_car_loan";
  await page.route(endpoint, (route) =>
    route.fulfill({ status: 503, json: { message: "Injected local debt failure" } })
  );
  const failed = await page.evaluate(async () => {
    const path = "/src/lib/services/demo-data.ts";
    const api = await import(path);
    try {
      await api.seedDemoData();
      return false;
    } catch {
      return true;
    }
  });
  expect(failed).toBe(true);
  expect((await demo.client.from("transactions").select("id")).data).toHaveLength(0);
  expect((await demo.client.from("plans").select("id")).data).toHaveLength(0);
  await page.unroute(endpoint);
  const result = await page.evaluate(async () => {
    const path = "/src/lib/services/demo-data.ts";
    const api = await import(path);
    await api.seedDemoData();
    return api.clearDemoData();
  });
  expect(result.deleted).toBeGreaterThan(0);
  expect((await demo.client.from("plans").select("id")).data).toHaveLength(0);
  expect((await demo.client.from("transactions").select("id")).data).toHaveLength(0);
  expect((await demo.client.from("net_worth_items").select("id")).data).toHaveLength(0);
});

test("invalid target session shows recovery and never silently provisions a replacement", async ({
  page,
  fixtures,
}) => {
  let provisions = 0;
  await page.route("**/functions/v1/open-demo-account", (route) => {
    provisions += 1;
    return route.abort();
  });
  const demo = await demoFixture(fixtures);
  await loginOnce(page, fixtures.peer);
  await page.addInitScript(
    (value) => {
      localStorage.setItem("jakstoimy.auth.demo.session.v1", JSON.stringify(value));
    },
    { ...demo.session, access_token: "invalid", refresh_token: "expired" }
  );
  await page.goto("/dashboard");
  await page.locator('header button[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: "Przełącz na konto demo" }).click();
  await expect(page).toHaveURL(/switchFailed=demo/);
  await expect(page.getByRole("alert")).toContainText("Sesja docelowego konta wygasła");
  await expect(page.getByTestId("open-demo-account")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Utwórz nowe konto demo", exact: true })
  ).toBeVisible();
  expect(provisions).toBe(0);
  expect(
    await page.evaluate(() => localStorage.getItem("jakstoimy.auth.real.session.v1") !== null)
  ).toBe(true);
});

async function category(user: User) {
  const result = await user.client
    .from("categories")
    .insert({ user_id: user.id, name: "Abonament", type: "expense" })
    .select("id")
    .single();
  if (result.error) throw result.error;
  return result.data.id as string;
}

test("Demo → Real → Demo survives reload without mixing rows and logout clears sessions", async ({
  page,
  fixtures,
}) => {
  const real = fixtures.owner;
  const demo = fixtures.peer;
  const registered = await fixtures.admin.rpc("register_demo_identity", { p_user_id: demo.id });
  expect(registered.error).toBeNull();
  const refreshed = await demo.client.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session) throw new Error("Demo fixture refresh failed");
  demo.session = refreshed.data.session;
  expect(demo.session.user.app_metadata.account_kind).toBe("demo");

  const date = new Date().toISOString().slice(0, 10);
  for (const [user, description] of [
    [demo, "DEMO isolated row"],
    [real, "REAL isolated row"],
  ] as const) {
    const saved = await user.client.from("transactions").insert({
      user_id: user.id,
      category_id: await category(user),
      description,
      amount: 42,
      type: "expense",
      status: "paid",
      currency: "PLN",
      date,
    });
    expect(saved.error).toBeNull();
  }

  // Seed once, not with addInitScript: every later navigation must restore the
  // identity selected by the app, rather than silently resetting our fixture.
  await page.goto("/login");
  await page.evaluate(
    ({ active, parked, gotrue }) => {
      localStorage.setItem(gotrue, JSON.stringify(active));
      localStorage.setItem("jakstoimy.auth.real.session.v1", JSON.stringify(parked));
      localStorage.setItem("jakstoimy.auth.active_kind.v1", "demo");
      localStorage.setItem("push_prompted_at", String(Date.now()));
    },
    {
      active: demo.session,
      parked: real.session,
      gotrue: `sb-${parsed.hostname.split(".")[0]}-auth-token`,
    }
  );

  const assertIdentity = async (kind: "demo" | "real") => {
    await page.goto("/transactions?group=own");
    const own = kind === "demo" ? "DEMO isolated row" : "REAL isolated row";
    const other = kind === "demo" ? "REAL isolated row" : "DEMO isolated row";
    await expect(page.locator("table").getByText(own, { exact: true })).toBeVisible();
    await expect(page.getByText(other, { exact: true })).toHaveCount(0);
    if (kind === "demo") await expect(page.getByTestId("demo-account-badge").first()).toBeVisible();
    else await expect(page.getByTestId("demo-account-badge")).toHaveCount(0);
    const storage = await page.evaluate(
      (key) => ({
        activeId: JSON.parse(localStorage.getItem(key) ?? "null")?.user?.id,
        pending: localStorage.getItem("jakstoimy.auth.pending_switch.v1"),
        reinit: localStorage.getItem("jakstoimy.auth.reinit.v1"),
      }),
      `sb-${parsed.hostname.split(".")[0]}-auth-token`
    );
    expect(storage).toEqual({
      activeId: kind === "demo" ? demo.id : real.id,
      pending: null,
      reinit: null,
    });
  };

  await assertIdentity("demo");
  for (const kind of ["real", "demo"] as const) {
    await page.evaluate(() => {
      (window as unknown as Record<string, unknown>).__beforeSwitch = true;
    });
    await page.locator('header button[aria-haspopup="menu"]').first().click();
    await Promise.all([
      page.waitForEvent("load"),
      page
        .getByRole("menuitem", {
          name: kind === "real" ? "Przełącz na konto rzeczywiste" : "Przełącz na konto demo",
        })
        .click(),
    ]);
    expect(
      await page.evaluate(() => (window as unknown as Record<string, unknown>).__beforeSwitch)
    ).toBeUndefined();
    await assertIdentity(kind);
    await page.reload();
    await assertIdentity(kind);
  }

  await page.locator('header button[aria-haspopup="menu"]').first().click();
  await page.getByRole("menuitem", { name: "Wyloguj się" }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Object.keys(localStorage).filter(
          (key) => key.startsWith("jakstoimy.auth.") || /^sb-.*-auth-token$/.test(key)
        )
      )
    )
    .toEqual([]);
  await page.reload();
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login/);
});
async function exportBundle(page: Page) {
  await page.goto("/settings?tab=privacy");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Eksportuj konto" }).click();
  const file = await download;
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}

test("balance save survives reload and export contains the saved balance", async ({
  page,
  fixtures,
}) => {
  await login(page, fixtures.owner);
  await page.goto("/transactions?group=own");
  await page.getByRole("button", { name: "Potwierdź saldo" }).click();
  const dialog = page.getByRole("dialog", { name: "Potwierdź saldo" });
  await expect(dialog.getByRole("button", { name: "Zapisz", exact: true })).toBeDisabled();
  await dialog.locator("#cash-opening-amount").fill("99999999999");
  await expect(dialog.getByRole("button", { name: "Zapisz", exact: true })).toBeDisabled();
  await dialog.locator("#cash-opening-amount").fill("2635,81");
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Więcej akcji" }).click();
  await page.getByRole("menuitem", { name: "Potwierdź saldo" }).click();
  const saved = page.getByRole("dialog", { name: "Potwierdź saldo" });
  await expect(saved.locator("#cash-opening-amount")).toHaveValue(/2635[.,]81/);
  await saved.getByRole("button", { name: "Anuluj", exact: true }).click();
  const bundle = await exportBundle(page);
  expect(bundle.cash_positions).toHaveLength(1);
  expect(Number(bundle.cash_positions[0].opening_amount)).toBe(2635.81);
  expect(bundle.profile.id).toBe(fixtures.owner.id);
  expect(bundle).not.toHaveProperty("push_subscriptions");
});

test("settle then import matching bank payment and reimport keeps one expense", async ({
  page,
  fixtures,
}) => {
  const owner = fixtures.owner;
  const categoryId = await category(owner);
  const date = new Date().toISOString().slice(0, 10);
  const seeded = await owner.client
    .from("transactions")
    .insert({
      user_id: owner.id,
      description: "Orange Flex",
      counterparty: "Orange",
      amount: 35,
      type: "expense",
      status: "overdue",
      currency: "PLN",
      date,
      category_id: categoryId,
    })
    .select("id")
    .single();
  if (seeded.error) throw seeded.error;
  await login(page, owner);
  await page.goto("/transactions?group=own");
  await page.locator("table").getByRole("button", { name: "Oznacz jako opłacone" }).click();
  await expect(page.getByText("Oznaczono jako opłacone", { exact: true })).toBeVisible();
  const csv = Buffer.from(
    `"mBank S.A."\n"Historia operacji"\n"Numer rachunku";"PL00 0000 0000 0000 0000 0000 0000"\n#Data księgowania;#Data operacji;#Opis operacji;#Tytuł;#Nadawca/Odbiorca;#Numer konta;#Kwota;#Saldo po operacji\n${date};${date};"ZAKUP TOWARÓW I USŁUG";"Orange Flex";"Orange Polska";"";-35,00;2600,81\n`,
    "utf8"
  );
  const upload = async () => {
    await page.goto("/import");
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "quality.csv", mimeType: "text/csv", buffer: csv });
    await page.getByRole("button", { name: "Kontynuuj", exact: true }).click();
  };
  await upload();
  await page.getByRole("button", { name: "Zakończ import", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Zakończ import", exact: true })
    .click();
  await expect(page).toHaveURL(/\/transactions/);
  const rows = await owner.client
    .from("transactions")
    .select("id,status,amount")
    .eq("user_id", owner.id);
  expect(rows.error).toBeNull();
  expect(rows.data).toEqual([{ id: seeded.data.id, status: "paid", amount: 35 }]);
  const links = await owner.client
    .from("transaction_import_links")
    .select("transaction_id")
    .eq("transaction_id", seeded.data.id);
  expect(links.error).toBeNull();
  expect(links.data).toHaveLength(1);
  await upload();
  await expect(page.getByText("Ten plik został już zaimportowany")).toBeVisible();
  const original = await owner.client
    .from("transaction_import_sessions")
    .select("id,status,rows_committed,committed_at")
    .eq("user_id", owner.id)
    .single();
  expect(original.error).toBeNull();
  await page.getByRole("button", { name: "Importuj ponownie mimo to" }).click();
  await page.getByRole("button", { name: "Zakończ import", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Zakończ import", exact: true })
    .click();
  await expect(page).toHaveURL(/\/transactions/);
  const repeat = await owner.client.from("transactions").select("id").eq("user_id", owner.id);
  expect(repeat.error).toBeNull();
  expect(repeat.data).toEqual([{ id: seeded.data.id }]);
  const attempts = await owner.client
    .from("transaction_import_sessions")
    .select("id,status,rows_committed,committed_at")
    .eq("user_id", owner.id);
  expect(attempts.error).toBeNull();
  expect(attempts.data).toHaveLength(2);
  expect(attempts.data).toContainEqual(original.data);
  expect(attempts.data?.every((attempt) => attempt.status === "committed")).toBe(true);
  const repeatedLinks = await owner.client
    .from("transaction_import_links")
    .select("transaction_id")
    .eq("transaction_id", seeded.data.id);
  expect(repeatedLinks.error).toBeNull();
  expect(repeatedLinks.data).toHaveLength(1);
});

test("group creation, private access, ownership transfer and leaving", async ({
  page,
  fixtures,
}) => {
  const { owner, peer, admin } = fixtures;
  await login(page, owner);
  await page.goto("/settings?tab=groups");
  await page.getByRole("button", { name: /Nowa grupa/ }).click();
  await page.locator("#grp-name").fill("Quality household");
  await page.getByRole("dialog").getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByText("Quality household", { exact: true })).toBeVisible();
  const group = await owner.client
    .from("user_groups")
    .select("id")
    .eq("owner_id", owner.id)
    .single();
  if (group.error) throw group.error;
  // Membership setup only. No email/Edge Function is needed for this local fixture.
  const member = await admin
    .from("group_members")
    .insert({ group_id: group.data.id, user_id: peer.id, role: "member" });
  if (member.error) throw member.error;
  const categoryId = await category(owner);
  const privateTx = await owner.client
    .from("transactions")
    .insert({
      user_id: owner.id,
      description: "Private fixture",
      amount: 1,
      type: "expense",
      status: "paid",
      date: new Date().toISOString().slice(0, 10),
      category_id: categoryId,
    })
    .select("id")
    .single();
  if (privateTx.error) throw privateTx.error;
  const blocked = await peer.client.from("transactions").select("id").eq("id", privateTx.data.id);
  expect(blocked.error).toBeNull();
  expect(blocked.data).toEqual([]);
  // Sharing is explicit in the transaction form; the peer can read this row
  // while the private row above stays inaccessible.
  await page.goto("/transactions?group=own");
  await page
    .getByRole("button", { name: /Dodaj ręcznie/ })
    .first()
    .click();
  await page.locator("#tx-amount").fill("10");
  await page.locator("#tx-desc").fill("Shared fixture");
  await page.locator("#tx-cat").fill("Abonament");
  await page.getByRole("option", { name: "Abonament", exact: true }).click();
  await page.locator("#tx-group").selectOption(group.data.id);
  await page.getByRole("dialog").getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await peer.client
            .from("transactions")
            .select("group_id")
            .eq("description", "Shared fixture")
            .single()
        ).data?.group_id
    )
    .toBe(group.data.id);
  await page.goto("/settings?tab=groups");
  await page.getByRole("button", { name: "Członkowie grupy" }).click();
  await page.getByRole("button", { name: "Przekaż własność" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Przekaż własność" }).click();
  await expect
    .poll(
      async () =>
        (await peer.client.from("user_groups").select("owner_id").eq("id", group.data.id).single())
          .data?.owner_id
    )
    .toBe(peer.id);
  await page.goto("/settings?tab=groups");
  await page.getByRole("button", { name: "Opuść grupę", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Opuść grupę", exact: true })
    .click();
  await expect(page.getByText("Quality household", { exact: true })).toHaveCount(0);
});

test("account deletion is blocked by owned group, then deletes fixture and logs out", async ({
  page,
  fixtures,
}) => {
  const { owner, admin } = fixtures;
  const group = await owner.client.rpc("create_group", { p_name: "Quality deletion guard" });
  if (group.error) throw group.error;
  await login(page, owner);
  await page.goto("/settings?tab=privacy");
  const attemptDelete = async () => {
    await page.getByRole("button", { name: "Usuń konto", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Usuń", exact: true }).click();
  };
  await attemptDelete();
  await expect(page.getByText(/Najpierw przekaż własność/)).toBeVisible();
  expect((await admin.auth.admin.getUserById(owner.id)).data.user?.id).toBe(owner.id);
  const disbanded = await owner.client.rpc("disband_group", { p_group_id: group.data.id });
  if (disbanded.error) throw disbanded.error;
  // Failure keeps the confirmation open; close it before retrying explicitly.
  await page.getByRole("alertdialog").getByRole("button", { name: "Anuluj", exact: true }).click();
  await attemptDelete();
  await expect(page).toHaveURL(/\/login/);
  expect((await admin.auth.admin.getUserById(owner.id)).data.user).toBeNull();
  const profile = await admin.from("profiles").select("id").eq("id", owner.id);
  expect(profile.error).toBeNull();
  expect(profile.data).toEqual([]);
});

test("real password sign-in and sign-out", async ({ page, fixtures }) => {
  await page.goto("/login");
  await page.getByLabel("Adres e-mail").fill(fixtures.owner.email);
  await page.getByLabel("Hasło").fill(fixtures.owner.password);
  await page.getByRole("button", { name: "Zaloguj się", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: fixtures.owner.email, exact: true }).click();
  await page.getByRole("menuitem", { name: /Wyloguj/ }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login/);
});

test("category limit counts paid expenses and can be changed or removed", async ({
  page,
  fixtures,
}) => {
  await login(page, fixtures.owner);
  await page.goto("/settings?tab=categories");
  await page.getByRole("button", { name: "Nowa kategoria", exact: true }).click();
  await page.locator("#cat-name").fill("Quality groceries");
  await page.locator("#cat-cap").fill("1000");
  await page.getByRole("dialog").getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const result = await fixtures.owner.client
    .from("categories")
    .select("id,cap_amount,cap_period")
    .eq("name", "Quality groceries")
    .single();
  if (result.error) throw result.error;
  expect(Number(result.data.cap_amount)).toBe(1000);
  expect(result.data.cap_period).toBe("month");
  const txs = await fixtures.owner.client.from("transactions").insert(
    ["paid", "upcoming"].map((status) => ({
      user_id: fixtures.owner.id,
      description: `Quality ${status}`,
      type: "expense",
      status,
      amount: 200,
      category_id: result.data.id,
      date: new Date().toISOString().slice(0, 10),
    }))
  );
  if (txs.error) throw txs.error;
  await page.goto("/dashboard?group=own");
  const limits = page.locator('section[aria-labelledby="dashboard-piles-title"]');
  await expect(limits).toContainText("Do limitu pozostało 800,00 zł");
  await page.goto("/settings?tab=categories");
  const row = page.locator("tr").filter({ hasText: "Quality groceries" });
  await row.getByRole("button", { name: "Edytuj", exact: true }).click();
  await page.locator("#cat-cap").fill("1200");
  await page.getByRole("dialog").getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/dashboard?group=own");
  await expect(limits).toContainText("Do limitu pozostało 1 000,00 zł");
  await page.goto("/settings?tab=categories");
  await row.getByRole("button", { name: "Edytuj", exact: true }).click();
  await page.locator("#cat-cap").fill("");
  await page.getByRole("dialog").getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await fixtures.owner.client
            .from("categories")
            .select("cap_amount")
            .eq("id", result.data.id)
            .single()
        ).data?.cap_amount
    )
    .toBeNull();
});

test("create a recurring payment, edit its series and stop future occurrences", async ({
  page,
  fixtures,
}) => {
  await category(fixtures.owner);
  await login(page, fixtures.owner);
  await page.goto("/transactions?group=own");
  await page
    .getByRole("button", { name: /Dodaj ręcznie/ })
    .first()
    .click();
  await page.locator("#tx-amount").fill("40");
  await page.locator("#tx-desc").fill("Quality recurring");
  await page.locator("#tx-cat").fill("Abonament");
  await page.getByRole("option", { name: "Abonament", exact: true }).click();
  await page.locator("#tx-status").selectOption("upcoming");
  await page.getByText("Cykliczna", { exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const result = await fixtures.owner.client
    .from("transactions")
    .select("id,amount,recurrence_frequency")
    .eq("description", "Quality recurring")
    .eq("is_recurring", true)
    .single();
  if (result.error) throw result.error;
  expect(result.data.recurrence_frequency).toBe("monthly");
  await page.goto(`/transactions?txId=${result.data.id}`);
  const sheet = page.locator("aside");
  await sheet.getByRole("button", { name: "Edytuj", exact: true }).first().click();
  await sheet.getByRole("button", { name: "Cała seria", exact: true }).click();
  await page.locator("#tx-amount").fill("50");
  await page.getByRole("dialog").getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect
    .poll(async () =>
      Number(
        (
          await fixtures.owner.client
            .from("transactions")
            .select("amount")
            .eq("id", result.data.id)
            .single()
        ).data?.amount
      )
    )
    .toBe(50);
  await page.goto(`/transactions?txId=${result.data.id}`);
  await sheet.getByRole("button", { name: "Usuń", exact: true }).first().click();
  await sheet.getByRole("button", { name: "Ta i kolejne płatności", exact: true }).click();
  await expect
    .poll(
      async () =>
        (
          await fixtures.owner.client
            .from("transactions")
            .select("recurrence_end_date")
            .eq("id", result.data.id)
            .single()
        ).data?.recurrence_end_date
    )
    .toBeTruthy();
});
