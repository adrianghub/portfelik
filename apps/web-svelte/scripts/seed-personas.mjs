import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const target = process.env.SEED_TARGET ?? "local";
const appDir = new URL("../", import.meta.url);
const repoDir = new URL("../../../", import.meta.url);

function loadEnvFile(url) {
  const path = fileURLToPath(url);
  if (!existsSync(path)) return;

  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile(new URL(".env.test", appDir));
loadEnvFile(new URL(".env.local", appDir));
loadEnvFile(new URL("supabase/.env", repoDir));

const DEMO_PREFIX = "Demo:";
const DEFAULT_ADMIN_LOGIN = "admin@portfelik.test";
const DEFAULT_USER_LOGIN = "user@portfelik.test";

function targetEnv(name) {
  if (target === "staging") return process.env[`STAGING_${name}`];
  if (target === "local") return process.env[`LOCAL_${name}`];
  return undefined;
}

const adminEmail = targetEnv("ADMIN_EMAIL") ?? process.env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_LOGIN;
const userEmail = targetEnv("USER_EMAIL") ?? process.env.SEED_USER_EMAIL ?? DEFAULT_USER_LOGIN;

function getConfig() {
  if (target === "staging") {
    return {
      url: process.env.STAGING_SUPABASE_URL,
      serviceRoleKey: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
      requireStagingPersonas: true,
    };
  }

  if (target === "local") {
    return {
      url: process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      requireStagingPersonas: false,
    };
  }

  throw new Error(`Unsupported SEED_TARGET=${target}. Expected "local" or "staging".`);
}

const config = getConfig();
if (!config.url) throw new Error(`Missing Supabase URL for ${target}.`);
if (!config.serviceRoleKey) {
  throw new Error(
    target === "local"
      ? "Missing SUPABASE_SERVICE_ROLE_KEY. Fill apps/web-svelte/.env.test from `supabase status -o env`."
      : "Missing STAGING_SUPABASE_SERVICE_ROLE_KEY."
  );
}

const supabase = createClient(config.url, config.serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function must(label, promise) {
  const result = await promise;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function findUser(email) {
  for (let page = 1; ; page += 1) {
    const data = await must(
      `list users page ${page}`,
      supabase.auth.admin.listUsers({ page, perPage: 200 })
    );
    const user = data.users.find((candidate) => candidate.email === email);
    if (user) return user;
    if (data.users.length < 200) return null;
  }
}

async function ensureUser({ email, password, label, role }) {
  const metadata = {
    user_metadata: { portfelik_persona: label, full_name: label },
    app_metadata: { role, portfelik_persona: label },
  };

  const existing = await findUser(email);
  const response = existing
    ? await must(
        `update ${label} user`,
        supabase.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
          ...metadata,
        })
      )
    : await must(
        `create ${label} user`,
        supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          ...metadata,
        })
      );

  const user = response.user;
  if (!user?.id || !user.email) throw new Error(`${label} user has no id/email.`);

  await must(
    `upsert ${label} profile`,
    supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email,
        name: label,
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
  );

  return user;
}

async function deleteRows(label, query) {
  await must(`cleanup ${label}`, query);
}

async function cleanupDemoRows(userId) {
  const { data: demoPlans } = await supabase
    .from("plans")
    .select("id")
    .eq("user_id", userId)
    .like("name", `${DEMO_PREFIX}%`);
  const demoPlanIds = (demoPlans ?? []).map((p) => p.id);
  if (demoPlanIds.length > 0) {
    await deleteRows(
      "demo plan links",
      supabase.from("plan_transaction_links").delete().in("plan_id", demoPlanIds)
    );
  }

  await deleteRows(
    "demo transactions",
    supabase
      .from("transactions")
      .delete()
      .eq("user_id", userId)
      .like("description", `${DEMO_PREFIX}%`)
  );
  // Deleting demo plans cascades plan_debt_terms (FK on delete cascade).
  await deleteRows(
    "demo plans",
    supabase.from("plans").delete().eq("user_id", userId).like("name", `${DEMO_PREFIX}%`)
  );
  await deleteRows(
    "demo categories",
    supabase.from("categories").delete().eq("user_id", userId).like("name", `${DEMO_PREFIX}%`)
  );
  // Deleting demo groups cascades group_members (incl. co-owner rows).
  await deleteRows(
    "demo groups",
    supabase.from("user_groups").delete().eq("owner_id", userId).like("name", `${DEMO_PREFIX}%`)
  );
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Build a varied transaction set spanning ~10 months with mixed categories,
// statuses and types so the UI (date-range picker, category/status filters,
// search, bulk ops, dashboard trends, treemap, cash position) has realistic
// data. One recent month carries a deliberate spending spike so the dashboard
// anomaly surface lights up. Specific "Pensja"/"Rata kredytu" rows are linked
// to plans afterwards. All descriptions keep the DEMO_PREFIX so cleanupDemoRows
// removes them idempotently.
function buildDemoTransactions(userId, cats, groupId) {
  const { groceries, salary, transport, dining, housing, health, fun, subs } = cats;
  const rows = [];
  const tx = (d, amount, cat, type, status, label, useGroup = false) => {
    rows.push({
      user_id: userId,
      ...(useGroup ? { group_id: groupId } : {}),
      amount,
      currency: "PLN",
      description: `${DEMO_PREFIX} ${label}`,
      date: isoDaysAgo(d),
      type,
      status,
      category_id: cat,
    });
  };

  for (let mo = 0; mo <= 9; mo++) {
    const base = mo * 30;
    const tag = mo === 0 ? "(ten mies.)" : `(${mo} mies. temu)`;
    tx(base + 5, 6900 + (mo % 2) * 150, salary, "income", "paid", `Pensja ${tag}`);
    tx(base + 10, 1800, housing, "expense", "paid", `Czynsz ${tag}`);
    tx(base + 8, 210 + (mo % 3) * 18, groceries, "expense", "paid", `Zakupy spożywcze ${tag} #1`, mo < 3);
    tx(base + 21, 175 + (mo % 4) * 12, groceries, "expense", "paid", `Zakupy spożywcze ${tag} #2`);
    tx(base + 12, 55 + (mo % 3) * 9, transport, "expense", "paid", `Paliwo ${tag}`);
    tx(base + 16, 85 + (mo % 5) * 7, dining, "expense", "paid", `Restauracja ${tag}`);
    tx(base + 3, 43, subs, "expense", "paid", `Subskrypcja Netflix ${tag}`);
    tx(base + 15, 2100, housing, "expense", "paid", `Rata kredytu ${tag}`);
  }

  // Occasional categories so health/fun are not empty.
  tx(48, 260, health, "expense", "paid", "Wizyta u dentysty");
  tx(75, 140, health, "expense", "paid", "Apteka");
  tx(95, 320, fun, "expense", "paid", "Bilety na koncert");

  // Deliberate spending anomaly ~last month (dining + fun far above usual) so
  // the dashboard "wyżej niż zwykle" action surfaces.
  tx(34, 480, dining, "expense", "paid", "Kolacja urodzinowa");
  tx(38, 620, fun, "expense", "paid", "Weekend SPA");
  tx(42, 390, fun, "expense", "paid", "Gokarty ze znajomymi");

  // Current month: non-paid statuses.
  tx(2, 64, transport, "expense", "draft", "Bilet kolejowy (szkic)");
  tx(6, 120, dining, "expense", "upcoming", "Zaplanowana kolacja");
  tx(20, 90, transport, "expense", "overdue", "Mandat (zaległy)");

  // Future upcoming.
  tx(-5, 1200, groceries, "expense", "upcoming", "Planowany duży zakup");
  tx(-12, 150, fun, "expense", "upcoming", "Bilety do kina");

  return rows;
}

// Returns the owner's demo group id (used to wire the shared-group scenario).
async function seedDemoRows(userId) {
  const demoCategories = await must(
    "create demo categories",
    supabase
      .from("categories")
      .insert([
        { user_id: userId, name: `${DEMO_PREFIX} Zakupy`, type: "expense" },
        { user_id: userId, name: `${DEMO_PREFIX} Wynagrodzenie`, type: "income" },
        { user_id: userId, name: `${DEMO_PREFIX} Transport`, type: "expense" },
        { user_id: userId, name: `${DEMO_PREFIX} Restauracje`, type: "expense" },
        { user_id: userId, name: `${DEMO_PREFIX} Mieszkanie`, type: "expense" },
        { user_id: userId, name: `${DEMO_PREFIX} Zdrowie`, type: "expense" },
        { user_id: userId, name: `${DEMO_PREFIX} Rozrywka`, type: "expense" },
        { user_id: userId, name: `${DEMO_PREFIX} Subskrypcje`, type: "expense" },
      ])
      .select("id, name, type")
  );
  const catId = (suffix) => demoCategories.find((c) => c.name === `${DEMO_PREFIX} ${suffix}`)?.id;
  const cats = {
    groceries: catId("Zakupy"),
    salary: catId("Wynagrodzenie"),
    transport: catId("Transport"),
    dining: catId("Restauracje"),
    housing: catId("Mieszkanie"),
    health: catId("Zdrowie"),
    fun: catId("Rozrywka"),
    subs: catId("Subskrypcje"),
  };

  const group = await must(
    "create demo group",
    supabase
      .from("user_groups")
      .insert({ owner_id: userId, name: `${DEMO_PREFIX} Dom` })
      .select("id")
      .single()
  );
  await must(
    "create demo group membership",
    supabase.from("group_members").insert({
      group_id: group.id,
      user_id: userId,
      role: "owner",
    })
  );

  const demoTransactions = buildDemoTransactions(userId, cats, group.id);
  const createdTransactions = await must(
    "create demo transactions",
    supabase.from("transactions").insert(demoTransactions).select("id, description, type")
  );
  const txByLabel = new Map(
    createdTransactions.map((tx) => [tx.description.replace(`${DEMO_PREFIX} `, ""), tx.id])
  );

  // Recurring templates (is_recurring=true) drive /recurring + forecast bars.
  const recurringTemplates = [
    { day: 5, amount: 6900, cat: cats.salary, type: "income", label: "Pensja (cykliczna)" },
    { day: 3, amount: 43, cat: cats.subs, type: "expense", label: "Subskrypcja Netflix (cykliczna)" },
    { day: 10, amount: 1800, cat: cats.housing, type: "expense", label: "Czynsz (cykliczny)" },
  ].map((t) => ({
    user_id: userId,
    amount: t.amount,
    currency: "PLN",
    description: `${DEMO_PREFIX} ${t.label}`,
    date: isoDaysAgo(5),
    type: t.type,
    status: "paid",
    category_id: t.cat,
    is_recurring: true,
    recurrence_frequency: "monthly",
    recurrence_interval: 1,
    recurring_day: t.day,
  }));
  await must(
    "create demo recurring templates",
    supabase.from("transactions").insert(recurringTemplates)
  );

  const savePlans = [
    {
      user_id: userId,
      name: `${DEMO_PREFIX} Remont łazienki`,
      kind: "save",
      category_id: cats.salary,
      budget_amount: null,
      target_amount: 5000,
      start_date: isoDaysAgo(70),
      end_date: isoDaysAgo(-30),
    },
    {
      user_id: userId,
      name: `${DEMO_PREFIX} Tygodniowe zakupy`,
      kind: "save",
      category_id: cats.salary,
      budget_amount: null,
      target_amount: 600,
      start_date: isoDaysAgo(10),
      end_date: isoDaysAgo(-1),
    },
    {
      user_id: userId,
      name: `${DEMO_PREFIX} Wakacje - Chorwacja`,
      kind: "save",
      category_id: cats.salary,
      budget_amount: null,
      target_amount: 3000,
      start_date: isoDaysAgo(20),
      end_date: isoDaysAgo(-45),
    },
  ];
  const debtPlan = {
    user_id: userId,
    name: `${DEMO_PREFIX} Kredyt hipoteczny`,
    kind: "debt",
    category_id: cats.housing,
    budget_amount: null,
    target_amount: null,
    start_date: isoDaysAgo(300),
    end_date: isoDaysAgo(-3650),
  };

  const plans = await must(
    "create demo plans",
    supabase
      .from("plans")
      .insert([...savePlans, debtPlan])
      .select("id, name, kind")
  );
  const planByName = new Map(
    plans.map((plan) => [plan.name.replace(`${DEMO_PREFIX} `, ""), plan.id])
  );

  const debtPlanId = plans.find((p) => p.kind === "debt")?.id;
  if (debtPlanId) {
    await must(
      "create demo debt terms",
      supabase.from("plan_debt_terms").insert({
        plan_id: debtPlanId,
        original_amount: 320000,
        current_balance: 298000,
        annual_rate: 0.072,
        monthly_payment: 2100,
        first_payment_date: isoDaysAgo(300),
        first_payment_amount: 2100,
        balance_anchor_date: isoDaysAgo(15),
        anchor_balance: 298000,
      })
    );
  }

  const linkRows = [
    ["Remont łazienki", "Pensja (2 mies. temu)"],
    ["Tygodniowe zakupy", "Pensja (1 mies. temu)"],
    ["Wakacje - Chorwacja", "Pensja (ten mies.)"],
    ["Kredyt hipoteczny", "Rata kredytu (ten mies.)"],
    ["Kredyt hipoteczny", "Rata kredytu (1 mies. temu)"],
    ["Kredyt hipoteczny", "Rata kredytu (2 mies. temu)"],
  ]
    .map(([planName, txLabel]) => ({
      plan_id: planByName.get(planName),
      transaction_id: txByLabel.get(txLabel),
      created_by: userId,
    }))
    .filter((row) => row.plan_id && row.transaction_id);

  await must("create demo plan links", supabase.from("plan_transaction_links").insert(linkRows));

  return group.id;
}

// Wire a collaboration scenario: the co-owner persona joins the owner's demo
// group with role=co_owner and a few group-scoped transactions + a group plan
// land under the owner. Idempotent: shared rows carry DEMO_PREFIX (cleaned by
// cleanupDemoRows(ownerId)) and the membership cascades when the group is reset.
async function seedSharedScenario(ownerId, coOwnerId, ownerGroupId) {
  await must(
    "add demo co-owner",
    supabase
      .from("group_members")
      .upsert(
        { group_id: ownerGroupId, user_id: coOwnerId, role: "co_owner" },
        { onConflict: "group_id,user_id" }
      )
  );

  const ownerCats = await must(
    "lookup owner demo categories",
    supabase
      .from("categories")
      .select("id, name")
      .eq("user_id", ownerId)
      .in("name", [`${DEMO_PREFIX} Zakupy`, `${DEMO_PREFIX} Wynagrodzenie`])
  );
  const groceriesId = ownerCats.find((c) => c.name === `${DEMO_PREFIX} Zakupy`)?.id;
  const salaryId = ownerCats.find((c) => c.name === `${DEMO_PREFIX} Wynagrodzenie`)?.id;

  const sharedTransactions = [
    { d: 7, amount: 540, label: "Wspólne zakupy (grupa)" },
    { d: 19, amount: 220, label: "Rachunek za prąd (grupa)" },
    { d: 33, amount: 380, label: "Wspólne zakupy (grupa, zeszły mies.)" },
  ].map((t) => ({
    user_id: ownerId,
    group_id: ownerGroupId,
    amount: t.amount,
    currency: "PLN",
    description: `${DEMO_PREFIX} ${t.label}`,
    date: isoDaysAgo(t.d),
    type: "expense",
    status: "paid",
    category_id: groceriesId,
  }));
  await must(
    "create demo shared transactions",
    supabase.from("transactions").insert(sharedTransactions)
  );

  await must(
    "create demo group plan",
    supabase.from("plans").insert({
      user_id: ownerId,
      group_id: ownerGroupId,
      name: `${DEMO_PREFIX} Wspólny cel - wakacje`,
      kind: "save",
      category_id: salaryId,
      budget_amount: null,
      target_amount: 4000,
      start_date: isoDaysAgo(15),
      end_date: isoDaysAgo(-60),
    })
  );
}

function manualPersonas() {
  return [
    {
      email: adminEmail,
      password: targetEnv("ADMIN_PASSWORD") ?? process.env.SEED_ADMIN_PASSWORD ?? adminEmail,
      label: "Portfelik Admin",
      role: "admin",
      withDemoRows: true,
    },
    {
      email: userEmail,
      password: targetEnv("USER_PASSWORD") ?? process.env.SEED_USER_PASSWORD ?? userEmail,
      label: "Portfelik User",
      role: "user",
      withDemoRows: true,
    },
  ];
}

function stagingPersonas() {
  if (!config.requireStagingPersonas) return [];

  const required = [
    "STAGING_DEMO_EMAIL",
    "STAGING_DEMO_PASSWORD",
    "STAGING_E2E_SMOKE_EMAIL",
    "STAGING_E2E_SMOKE_PASSWORD",
  ];
  for (const name of required) {
    if (!process.env[name]) throw new Error(`Missing ${name}.`);
  }

  return [
    {
      email: process.env.STAGING_E2E_SMOKE_EMAIL,
      password: process.env.STAGING_E2E_SMOKE_PASSWORD,
      label: "Portfelik Smoke",
      role: "user",
      withDemoRows: false,
    },
    {
      email: process.env.STAGING_DEMO_EMAIL,
      password: process.env.STAGING_DEMO_PASSWORD,
      label: "Portfelik Demo",
      role: "user",
      withDemoRows: true,
    },
  ];
}

const personas = [...manualPersonas(), ...stagingPersonas()];
const seen = new Set();
const personaResults = new Map();
for (const persona of personas) {
  if (seen.has(persona.email)) continue;
  seen.add(persona.email);

  const user = await ensureUser(persona);
  let groupId = null;
  if (persona.withDemoRows) {
    await cleanupDemoRows(user.id);
    groupId = await seedDemoRows(user.id);
  }
  personaResults.set(persona.email, { userId: user.id, groupId });

  console.log(
    `${target}: seeded ${persona.role} persona ${persona.email}` +
      (persona.password === persona.email ? " (password matches login)" : "")
  );
}

// Collaboration scenario: admin co-owns the user persona's demo group.
const owner = personaResults.get(userEmail);
const coOwner = personaResults.get(adminEmail);
if (owner?.groupId && coOwner?.userId && owner.userId !== coOwner.userId) {
  await seedSharedScenario(owner.userId, coOwner.userId, owner.groupId);
  console.log(`${target}: wired shared-group scenario (${adminEmail} co-owns ${userEmail}'s group)`);
}

console.log(`${target}: personas and synthetic rows are ready.`);
