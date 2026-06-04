import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createUserClient, provisionTwoUsers, type TestContext } from "./setup";

const S = {
  merchant: "__SECRET_MERCHANT_81__",
  desc: "__SECRET_DESC_81__",
  filename: "__secret_file_81__.csv",
  accountLabel: "__SECRET_ACCOUNT_81__",
  amount: 1234.56, // -> '> 1000 PLN'
};

type Seeded = {
  transactionId: string;
  sessionId: string;
  categoryId: string;
  groupId: string;
};

async function seedImportedTransaction(
  admin: SupabaseClient,
  userId: string,
): Promise<Seeded> {
  const { data: cat } = await admin
    .from("categories")
    .insert({ user_id: userId, name: S.desc + "_CAT", type: "expense" })
    .select("id")
    .single()
    .throwOnError();
  const { data: grp } = await admin
    .from("user_groups")
    .insert({ name: S.desc + "_GRP", owner_id: userId })
    .select("id")
    .single()
    .throwOnError();
  const { data: acct } = await admin
    .from("bank_accounts")
    .insert({ user_id: userId, kind: "mbank", label: S.accountLabel })
    .select("id")
    .single()
    .throwOnError();
  const { data: tx } = await admin
    .from("transactions")
    .insert({
      user_id: userId,
      group_id: grp!.id,
      category_id: cat!.id,
      amount: S.amount,
      currency: "PLN",
      description: S.desc,
      date: new Date().toISOString(),
      type: "expense",
      status: "paid",
    })
    .select("id")
    .single()
    .throwOnError();
  const { data: sess } = await admin
    .from("transaction_import_sessions")
    .insert({
      user_id: userId,
      bank_account_id: acct!.id,
      source_filename: S.filename,
      source_file_hash: "hash_" + S.filename,
      detected_kind: "mbank",
      adapter_kind: "mbank",
      source_kind: "bank_statement",
      status: "committed",
      rows_total: 1,
      rows_committed: 1,
    })
    .select("id")
    .single()
    .throwOnError();
  const { data: row } = await admin
    .from("transaction_import_rows")
    .insert({
      session_id: sess!.id,
      row_index: 0,
      posted_at: new Date().toISOString().slice(0, 10),
      amount: S.amount,
      type: "expense",
      description: S.desc,
      counterparty: S.merchant,
      currency: "PLN",
      raw_row_hash: "rrh_0",
      decision: "import",
      transaction_id: tx!.id,
    })
    .select("id")
    .single()
    .throwOnError();
  await admin
    .from("transaction_import_links")
    .insert({
      transaction_id: tx!.id,
      user_id: userId,
      bank_account_id: acct!.id,
      session_id: sess!.id,
      row_id: row!.id,
      source_file_hash: "hash_" + S.filename,
      source_row_index: 0,
      fingerprint: "fp_0",
    })
    .throwOnError();
  return { transactionId: tx!.id, sessionId: sess!.id, categoryId: cat!.id, groupId: grp!.id };
}

async function cleanupSeed(admin: SupabaseClient, userId: string) {
  // FK chain is ON DELETE RESTRICT: links -> rows -> sessions -> bank_accounts.
  // Delete in dependency order: links restrict rows/sessions/accounts; rows restrict sessions.
  const { data: sessions } = await admin
    .from("transaction_import_sessions")
    .select("id")
    .eq("user_id", userId);
  const sessionIds = (sessions ?? []).map((s) => s.id);
  await admin.from("transaction_import_links").delete().eq("user_id", userId);
  if (sessionIds.length) {
    await admin.from("transaction_import_rows").delete().in("session_id", sessionIds);
  }
  await admin.from("transaction_import_sessions").delete().eq("user_id", userId);
  await admin.from("transactions").delete().eq("user_id", userId);
  await admin.from("bank_accounts").delete().eq("user_id", userId);
  await admin.from("user_groups").delete().eq("owner_id", userId);
  await admin.from("categories").delete().eq("user_id", userId).like("name", "__SECRET%");
}

async function adminClientFor(ctx: TestContext): Promise<SupabaseClient> {
  await ctx.admin.from("profiles").update({ role: "admin" }).eq("id", ctx.userA.userId);
  return createUserClient(ctx.userA.accessToken);
}

describe("admin masked diagnostics: transaction", () => {
  let ctx: TestContext;
  let seeded: Seeded;
  let asAdmin: SupabaseClient;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSeed(ctx.admin, ctx.userB.userId); // defensive: auth users persist across db reset
    seeded = await seedImportedTransaction(ctx.admin, ctx.userB.userId);
    asAdmin = await adminClientFor(ctx);
  });

  afterAll(async () => {
    await ctx.admin.from("profiles").update({ role: "user" }).eq("id", ctx.userA.userId);
    await cleanupSeed(ctx.admin, ctx.userB.userId);
  });

  it("denies non-admin", async () => {
    const { error } = await ctx.userB.client.rpc("admin_masked_transaction_by_id", {
      p_transaction_id: seeded.transactionId,
    });
    expect(error).not.toBeNull();
    expect(String(error?.message ?? "")).toMatch(/permission_denied/);
  });

  it("returns masked fields with no raw sentinels", async () => {
    const { data, error } = await asAdmin.rpc("admin_masked_transaction_by_id", {
      p_transaction_id: seeded.transactionId,
    });
    expect(error).toBeNull();
    const json = JSON.stringify(data);
    expect(json).not.toContain(S.merchant);
    expect(json).not.toContain(S.desc);
    expect(json).not.toContain(S.filename);
    expect(json).not.toContain(S.accountLabel);
    expect(json).not.toContain("1234.56");
    expect(data.description_masked).toBe("[masked]");
    expect(data.amount_bucket).toBe("> 1000 PLN");
    expect(data.type).toBe("expense");
    expect(data.currency).toBe("PLN");
    expect(data.source_kind).toBe("bank_statement");
    expect(data.user_token).toMatch(/^[0-9a-f]{64}$/);
    expect(data.merchant_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("uses context separation: user vs merchant token differ for same input class", async () => {
    const { data } = await asAdmin.rpc("admin_masked_transaction_by_id", {
      p_transaction_id: seeded.transactionId,
    });
    expect(data.user_token).not.toBe(data.merchant_token);
    expect(data.category_token).not.toBe(data.group_token);
  });
});
