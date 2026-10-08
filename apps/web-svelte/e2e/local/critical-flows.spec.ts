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
async function category(user: User) {
  const result = await user.client
    .from("categories")
    .insert({ user_id: user.id, name: "Abonament", type: "expense" })
    .select("id")
    .single();
  if (result.error) throw result.error;
  return result.data.id as string;
}
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
  await page
    .getByRole("button", { name: "Ustaw saldo początkowe, aby zobaczyć saldo i prognozę" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Saldo z transakcji" });
  await expect(dialog.getByRole("button", { name: "Zapisz", exact: true })).toBeDisabled();
  await dialog.locator("#cash-opening-amount").fill("99999999999");
  await expect(dialog.getByRole("button", { name: "Zapisz", exact: true })).toBeDisabled();
  await dialog.locator("#cash-opening-amount").fill("2635,81");
  await dialog.getByRole("button", { name: "Zapisz", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("transaction-cash-position")).toContainText("2 635,81 zł");
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
