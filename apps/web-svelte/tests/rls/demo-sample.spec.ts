import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, expect, it } from "vitest";
import { prepareDemoSample } from "$lib/demo/sample";
import { provisionTwoUsers, type TestContext } from "./setup";

let ctx: TestContext;
let client: SupabaseClient;
let uid: string;
let sessionId: string;
let accountId: string;
let categoryId: string;
let categoryIncomeId: string;
beforeAll(async () => {
  ctx = await provisionTwoUsers();
  const email = `demo-sample-${randomUUID()}@demo.jakstoimy.local`;
  const created = await ctx.admin.auth.admin.createUser({
    email,
    password: process.env.RLS_TEST_PASSWORD!,
    email_confirm: true,
    app_metadata: { account_kind: "demo" },
  });
  if (created.error || !created.data.user) throw created.error ?? new Error("fixture user missing");
  uid = created.data.user.id;
  expect((await ctx.admin.rpc("register_demo_identity", { p_user_id: uid })).error).toBeNull();
  client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (await client.auth.signInWithPassword({ email, password: process.env.RLS_TEST_PASSWORD! }))
      .error
  ).toBeNull();
  const account = await client
    .from("bank_accounts")
    .insert({ user_id: uid, kind: "erste", label: "Sample fixture" })
    .select("id")
    .single();
  if (account.error) throw account.error;
  accountId = account.data.id;
  const categories = await client.from("categories").select("id,type").eq("user_id", uid);
  if (categories.error) throw categories.error;
  categoryId = categories.data.find((c) => c.type === "expense")!.id;
  categoryIncomeId = categories.data.find((c) => c.type === "income")!.id;
});
afterAll(async () => {
  if (uid) {
    await ctx.admin.from("demo_identities").delete().eq("user_id", uid);
    await ctx.admin.auth.admin.deleteUser(uid);
  }
});

async function committedSample() {
  const bytes = new Uint8Array(
    await readFile(new URL("../../static/sample-imports/jakstoimy-demo.csv", import.meta.url))
  );
  const file = await prepareDemoSample(bytes.buffer);
  const session = await client
    .from("transaction_import_sessions")
    .insert({
      user_id: uid,
      bank_account_id: accountId,
      source_file_hash: file.sourceFileHash,
      source_filename: "jakstoimy-demo.csv",
      detected_kind: "erste",
      adapter_kind: "erste",
      rows_total: 96,
    })
    .select("id")
    .single();
  if (session.error) throw session.error;
  sessionId = session.data.id;
  const rows = await client.from("transaction_import_rows").insert(
    file.rows.map((r) => ({
      session_id: sessionId,
      row_index: r.row_index,
      posted_at: r.posted_at,
      amount: r.amount,
      type: r.type,
      description: r.description,
      currency: r.currency,
      raw_row_hash: r.raw_row_hash,
      decision: "import",
      selected_category_id: r.type === "income" ? categoryIncomeId : categoryId,
    }))
  );
  if (rows.error) throw rows.error;
  expect((await client.rpc("clear_demo_sample")).error?.message).toBe(
    "demo_sample_import_in_progress"
  );
  const committed = await client.rpc("commit_import_session", { p_session_id: sessionId });
  expect(committed.error).toBeNull();
  expect(committed.data.inserted).toBe(96);
}
it("denies real accounts access to sample finalization and sample cleanup", async () => {
  expect(
    (await ctx.userA.client.rpc("finish_demo_sample", { p_session_id: randomUUID() })).error?.code
  ).toBe("42501");
  expect((await ctx.userA.client.rpc("clear_demo_sample")).error?.code).toBe("42501");
});
it("finishes a real import once, records private provenance, and prevents receipt forgery", async () => {
  await committedSample();
  expect((await client.rpc("finish_demo_sample", { p_session_id: sessionId })).error).toBeNull();
  expect((await client.rpc("finish_demo_sample", { p_session_id: sessionId })).error).toBeNull();
  expect((await client.from("cash_positions").select("opening_amount")).data).toEqual([
    { opening_amount: 5000 },
  ]);
  expect((await client.from("transactions").select("id").eq("is_demo", true)).data).toHaveLength(
    96
  );
  expect((await ctx.userB.client.from("demo_sample_receipts").select("session_id")).data).toEqual(
    []
  );
  expect(
    (
      await client
        .from("demo_sample_receipts")
        .insert({ user_id: uid, session_id: sessionId, cash_position_id: randomUUID() })
    ).error?.code
  ).toBe("42501");
});
it("removes only the sample, restores the absent anchor, and permits refill with retained history", async () => {
  expect((await client.rpc("clear_demo_sample")).error).toBeNull();
  expect((await client.from("transactions").select("id")).data).toHaveLength(0);
  expect((await client.from("cash_positions").select("id")).data).toHaveLength(0);
  expect(
    (await client.from("transaction_import_sessions").select("id").eq("status", "committed")).data
  ).toHaveLength(1);
  expect(
    (await client.rpc("finish_demo_sample", { p_session_id: sessionId })).error
  ).not.toBeNull();
  await committedSample();
  expect((await client.rpc("finish_demo_sample", { p_session_id: sessionId })).error).toBeNull();
  expect((await client.from("transactions").select("id")).data).toHaveLength(96);
});
it("preserves a manually edited anchor and unrelated user transaction during cleanup", async () => {
  expect(
    (await client.from("cash_positions").update({ opening_amount: 777 }).eq("owner_id", uid)).error
  ).toBeNull();
  expect(
    (
      await client.from("transactions").insert({
        user_id: uid,
        amount: 12,
        type: "expense",
        status: "paid",
        date: "2026-10-01",
        description: "My own transaction",
        category_id: categoryId,
      })
    ).error
  ).toBeNull();
  expect((await client.rpc("clear_demo_sample")).error).toBeNull();
  expect((await client.from("transactions").select("description")).data).toEqual([
    { description: "My own transaction" },
  ]);
  expect((await client.from("cash_positions").select("opening_amount")).data).toEqual([
    { opening_amount: 777 },
  ]);
});
