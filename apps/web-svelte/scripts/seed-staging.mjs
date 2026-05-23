import { createClient } from "@supabase/supabase-js";

const required = [
  "STAGING_SUPABASE_URL",
  "STAGING_SUPABASE_SERVICE_ROLE_KEY",
  "STAGING_DEMO_EMAIL",
  "STAGING_DEMO_PASSWORD",
  "STAGING_E2E_SMOKE_EMAIL",
  "STAGING_E2E_SMOKE_PASSWORD",
];

for (const name of required) {
  if (!process.env[name]) throw new Error(`Missing ${name}.`);
}

const DEMO_PREFIX = "Demo:";
const supabase = createClient(
  process.env.STAGING_SUPABASE_URL,
  process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  }
);

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

async function ensureUser(email, password, label) {
  const existing = await findUser(email);
  if (existing) {
    return must(
      `update ${label} user`,
      supabase.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      })
    ).then((data) => data.user);
  }

  return must(
    `create ${label} user`,
    supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { staging_persona: label },
    })
  ).then((data) => data.user);
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
        position: 1,
        completed: false,
      },
      {
        shopping_list_id: activeList.id,
        name: "Makaron",
        quantity: 2,
        unit: "opak.",
        position: 2,
        completed: false,
      },
      {
        shopping_list_id: completedList.id,
        name: "Kawa",
        quantity: 1,
        unit: "opak.",
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

const smokeUser = await ensureUser(
  process.env.STAGING_E2E_SMOKE_EMAIL,
  process.env.STAGING_E2E_SMOKE_PASSWORD,
  "smoke"
);
const demoUser = await ensureUser(
  process.env.STAGING_DEMO_EMAIL,
  process.env.STAGING_DEMO_PASSWORD,
  "demo"
);

if (!smokeUser?.id || !demoUser?.id) {
  throw new Error("Supabase user creation returned no id.");
}

await cleanupDemoRows(demoUser.id);
await seedDemoRows(demoUser.id);

console.log("Staging personas and synthetic demo rows are ready.");
