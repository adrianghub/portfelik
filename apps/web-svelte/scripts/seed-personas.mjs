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

const DEFAULT_SHOPPING_ITEM_CATEGORIES = [
  "Warzywa",
  "Owoce",
  "Pieczywo",
  "Nabiał",
  "Mięso",
  "Mrożonki",
  "Napoje",
  "Przyprawy",
  "Sosy",
  "Przekąski",
  "Słodycze",
  "Przybory kuchenne",
  "Przybory toaletowe",
  "Kosmetyki",
  "Chemia do domu",
  "Przybory do sprzątania",
  "Przybory biurowe",
].filter((name, index, all) => all.indexOf(name) === index);

const DEMO_PREFIX = "Demo:";
const DEFAULT_ADMIN_LOGIN = "admin@portfelik.test";
const DEFAULT_USER_LOGIN = "user@portfelik.test";

function targetEnv(name) {
  if (target === "staging") return process.env[`STAGING_${name}`];
  if (target === "local") return process.env[`LOCAL_${name}`];
  return undefined;
}

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

  await seedShoppingItemCategories(user.id);
  return user;
}

async function seedShoppingItemCategories(userId) {
  await must(
    "seed shopping item categories",
    supabase.from("shopping_item_categories").upsert(
      DEFAULT_SHOPPING_ITEM_CATEGORIES.map((name, position) => ({
        user_id: userId,
        name,
        position,
      })),
      { onConflict: "user_id,name", ignoreDuplicates: true }
    )
  );
}

async function deleteRows(label, query) {
  await must(`cleanup ${label}`, query);
}

async function cleanupDemoRows(userId) {
  await deleteRows(
    "demo transactions",
    supabase
      .from("transactions")
      .delete()
      .eq("user_id", userId)
      .like("description", `${DEMO_PREFIX}%`)
  );
  await deleteRows(
    "demo lists",
    supabase.from("shopping_lists").delete().eq("user_id", userId).like("name", `${DEMO_PREFIX}%`)
  );
  await deleteRows(
    "demo categories",
    supabase.from("categories").delete().eq("user_id", userId).like("name", `${DEMO_PREFIX}%`)
  );
  await deleteRows(
    "demo groups",
    supabase.from("user_groups").delete().eq("owner_id", userId).like("name", `${DEMO_PREFIX}%`)
  );
}

async function seedDemoRows(userId) {
  const [groceries, salary] = await must(
    "create demo categories",
    supabase
      .from("categories")
      .insert([
        { user_id: userId, name: `${DEMO_PREFIX} Zakupy`, type: "expense" },
        { user_id: userId, name: `${DEMO_PREFIX} Wynagrodzenie`, type: "income" },
      ])
      .select("id, type")
  );

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
    })
  );

  const [activeList, completedList] = await must(
    "create demo shopping lists",
    supabase
      .from("shopping_lists")
      .insert([
        {
          user_id: userId,
          group_id: group.id,
          name: `${DEMO_PREFIX} Zakupy na weekend`,
          status: "active",
          category_id: groceries.id,
        },
        {
          user_id: userId,
          name: `${DEMO_PREFIX} Lista z paragonem`,
          status: "completed",
          total_amount: 84.2,
          category_id: groceries.id,
        },
      ])
      .select("id, status")
  );

  await must(
    "create demo shopping list items",
    supabase.from("shopping_list_items").insert([
      {
        shopping_list_id: activeList.id,
        name: "Pomidory",
        quantity: 4,
        unit: "szt.",
        category: "Warzywa",
        position: 1,
        completed: false,
      },
      {
        shopping_list_id: activeList.id,
        name: "Makaron",
        quantity: 2,
        unit: "opak.",
        category: "Pieczywo",
        position: 2,
        completed: false,
      },
      {
        shopping_list_id: completedList.id,
        name: "Kawa",
        quantity: 1,
        unit: "opak.",
        category: "Napoje",
        completed: true,
        position: 1,
      },
    ])
  );

  await must(
    "create demo transactions",
    supabase.from("transactions").insert([
      {
        user_id: userId,
        amount: 6900,
        currency: "PLN",
        description: `${DEMO_PREFIX} Pensja`,
        date: "2026-05-01",
        type: "income",
        status: "paid",
        category_id: salary.id,
      },
      {
        user_id: userId,
        group_id: group.id,
        amount: 126.4,
        currency: "PLN",
        description: `${DEMO_PREFIX} Zakupy domowe`,
        date: "2026-05-18",
        type: "expense",
        status: "paid",
        category_id: groceries.id,
      },
      {
        user_id: userId,
        amount: 84.2,
        currency: "PLN",
        description: `${DEMO_PREFIX} Lista z paragonem`,
        date: "2026-05-20",
        type: "expense",
        status: "paid",
        category_id: groceries.id,
        shopping_list_id: completedList.id,
      },
    ])
  );
}

function manualPersonas() {
  const adminEmail =
    targetEnv("ADMIN_EMAIL") ?? process.env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN_LOGIN;
  const userEmail = targetEnv("USER_EMAIL") ?? process.env.SEED_USER_EMAIL ?? DEFAULT_USER_LOGIN;
  return [
    {
      email: adminEmail,
      password: targetEnv("ADMIN_PASSWORD") ?? process.env.SEED_ADMIN_PASSWORD ?? adminEmail,
      label: "Portfelik Admin",
      role: "admin",
      withDemoRows: false,
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
for (const persona of personas) {
  if (seen.has(persona.email)) continue;
  seen.add(persona.email);

  const user = await ensureUser(persona);
  if (persona.withDemoRows) {
    await cleanupDemoRows(user.id);
    await seedDemoRows(user.id);
  }

  console.log(
    `${target}: seeded ${persona.role} persona ${persona.email}` +
      (persona.password === persona.email ? " (password matches login)" : "")
  );
}

console.log(`${target}: personas and synthetic rows are ready.`);
