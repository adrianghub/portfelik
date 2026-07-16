import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

describe("RPC: cancel_import_session", () => {
  let ctx: TestContext;
  let accountId: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);
    const acc = await ctx.admin
      .from("bank_accounts")
      .insert({
        user_id: ctx.userA.userId,
        kind: "ing",
        label: `${SENTINEL} cancel-import acct`,
      })
      .select("id")
      .single();
    if (acc.error) throw acc.error;
    accountId = acc.data.id;
  });

  beforeEach(async () => {
    await ctx.admin.from("transaction_import_sessions").delete().eq("bank_account_id", accountId);
  });

  afterAll(async () => {
    await ctx.admin.from("transaction_import_sessions").delete().eq("bank_account_id", accountId);
    await cleanupSentinels(ctx.admin);
  });

  async function insertPreview(suffix: string): Promise<string> {
    const { data, error } = await ctx.admin
      .from("transaction_import_sessions")
      .insert({
        user_id: ctx.userA.userId,
        bank_account_id: accountId,
        source_file_hash: `hash-${SENTINEL}-${suffix}`,
        detected_kind: "ing",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  it("cancels a preview session", async () => {
    const id = await insertPreview("a");
    const { data, error } = await ctx.userA.client.rpc("cancel_import_session", {
      p_session_id: id,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "cancelled", already: false });

    const row = await ctx.admin
      .from("transaction_import_sessions")
      .select("status")
      .eq("id", id)
      .single();
    expect(row.data?.status).toBe("cancelled");
  });

  it("is idempotent when already cancelled", async () => {
    const id = await insertPreview("b");
    await ctx.userA.client.rpc("cancel_import_session", { p_session_id: id });
    const { data, error } = await ctx.userA.client.rpc("cancel_import_session", {
      p_session_id: id,
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "cancelled", already: true });
  });

  it("rejects cancelling another user's session", async () => {
    const id = await insertPreview("c");
    const { error } = await ctx.userB.client.rpc("cancel_import_session", {
      p_session_id: id,
    });
    expect(error).not.toBeNull();
  });

  it("denies anon", async () => {
    const id = await insertPreview("d");
    const anon = createAnonClient();
    const { error } = await anon.rpc("cancel_import_session", { p_session_id: id });
    expect(error).not.toBeNull();
  });
});
