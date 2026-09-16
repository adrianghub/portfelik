import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SENTINEL,
  cleanupSentinels,
  createAnonClient,
  createUserClient,
  createTestInvitation,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

async function createTemporaryUser(ctx: TestContext, label: string) {
  const password = process.env.RLS_TEST_PASSWORD;
  if (!password) throw new Error("RLS_TEST_PASSWORD is required");

  const email = `rls-delete-${label}-${crypto.randomUUID()}@rls.test`;
  const created = await ctx.admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("temporary user was not created");
  }

  const signedIn = await createAnonClient().auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) {
    throw signedIn.error ?? new Error("temporary user did not receive a session");
  }

  return {
    email,
    userId: created.data.user.id,
    client: createUserClient(signedIn.data.session.access_token),
  };
}

describe("RPC: delete_account", () => {
  let ctx: TestContext;
  let expenseCatA: string;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);

    const catA = await ctx.admin
      .from("categories")
      .insert({
        user_id: ctx.userA.userId,
        name: `${SENTINEL} delete-account cat`,
        type: "expense",
      })
      .select("id")
      .single();
    if (catA.error) throw catA.error;
    expenseCatA = catA.data.id;
  });

  afterAll(async () => {
    await cleanupSentinels(ctx.admin);
  });

  it("denies anon", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("delete_account");
    expect(error).not.toBeNull();
  });

  it("blocks deletion while the caller still owns a group", async () => {
    const temporary = await createTemporaryUser(ctx, "owner");
    let groupId: string | null = null;

    try {
      const group = await temporary.client.rpc("create_group", {
        p_name: `${SENTINEL} owned-by-departing`,
      });
      if (group.error || !group.data) {
        throw group.error ?? new Error("group was not created");
      }
      groupId = (group.data as { id: string }).id;

      const deletion = await temporary.client.rpc("delete_account");
      expect(deletion.error).not.toBeNull();
      expect(String(deletion.error?.message ?? "")).toMatch(/has_owned_groups/);

      const stillThere = await ctx.admin.auth.admin.getUserById(temporary.userId);
      expect(stillThere.data.user?.id).toBe(temporary.userId);
    } finally {
      if (groupId) {
        await ctx.admin.from("user_groups").delete().eq("id", groupId);
      }
      await ctx.admin.auth.admin.deleteUser(temporary.userId);
    }
  });

  it("erases private inventory for a user with no group history", async () => {
    const temporary = await createTemporaryUser(ctx, "solo");
    const category = await ctx.admin
      .from("categories")
      .insert({
        user_id: temporary.userId,
        name: `${SENTINEL} private cat`,
        type: "expense",
      })
      .select("id")
      .single();
    if (category.error) throw category.error;

    try {
      const tx = await ctx.admin.from("transactions").insert({
        amount: 12,
        currency: "PLN",
        description: `${SENTINEL} private tx`,
        date: "2026-06-01",
        type: "expense",
        status: "paid",
        category_id: category.data.id,
        user_id: temporary.userId,
      });
      if (tx.error) throw tx.error;

      const plan = await ctx.admin.from("plans").insert({
        name: `${SENTINEL} private plan`,
        user_id: temporary.userId,
        kind: "save",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        target_amount: 100,
      });
      if (plan.error) throw plan.error;

      const item = await ctx.admin.from("net_worth_items").insert({
        user_id: temporary.userId,
        label: `${SENTINEL} private item`,
        amount: 50,
        currency: "PLN",
        position: 0,
      });
      if (item.error) throw item.error;

      const bankAccount = await ctx.admin
        .from("bank_accounts")
        .insert({
          user_id: temporary.userId,
          kind: "ing",
          label: `${SENTINEL} private import`,
        })
        .select("id")
        .single();
      if (bankAccount.error) throw bankAccount.error;

      const note = await ctx.admin.from("notifications").insert({
        user_id: temporary.userId,
        type: "system_notification",
        title: `${SENTINEL} private note`,
        body: "x",
      });
      if (note.error) throw note.error;

      const deletion = await temporary.client.rpc("delete_account");
      expect(deletion.error).toBeNull();

      const leftoverTxs = await ctx.admin
        .from("transactions")
        .select("id")
        .eq("user_id", temporary.userId);
      expect(leftoverTxs.data ?? []).toEqual([]);

      const leftoverPlans = await ctx.admin
        .from("plans")
        .select("id")
        .eq("user_id", temporary.userId);
      expect(leftoverPlans.data ?? []).toEqual([]);

      const leftoverItems = await ctx.admin
        .from("net_worth_items")
        .select("id")
        .eq("user_id", temporary.userId);
      expect(leftoverItems.data ?? []).toEqual([]);

      const leftoverAccounts = await ctx.admin
        .from("bank_accounts")
        .select("id")
        .eq("user_id", temporary.userId);
      expect(leftoverAccounts.data ?? []).toEqual([]);

      const leftoverNotes = await ctx.admin
        .from("notifications")
        .select("id")
        .eq("user_id", temporary.userId);
      expect(leftoverNotes.data ?? []).toEqual([]);

      const leftoverCategories = await ctx.admin
        .from("categories")
        .select("id")
        .eq("user_id", temporary.userId);
      expect(leftoverCategories.data ?? []).toEqual([]);

      const deletedUser = await ctx.admin.auth.admin.getUserById(temporary.userId);
      expect(deletedUser.data.user).toBeNull();
    } finally {
      await ctx.admin.auth.admin.deleteUser(temporary.userId);
    }
  });

  it("removes the departing invitee's email from group invitations", async () => {
    const temporary = await createTemporaryUser(ctx, "invitee");
    let groupId: string | null = null;

    try {
      const group = await ctx.userA.client.rpc("create_group", {
        p_name: `${SENTINEL} invitee-wipe`,
      });
      if (group.error || !group.data) {
        throw group.error ?? new Error("group was not created");
      }
      groupId = (group.data as { id: string }).id;

      await createTestInvitation(ctx.admin, groupId, temporary.email, ctx.userA.userId);

      const pending = await ctx.admin
        .from("group_invitations")
        .select("id, invited_user_email")
        .eq("group_id", groupId)
        .eq("invited_user_email", temporary.email);
      expect(pending.data?.length).toBe(1);

      const deletion = await temporary.client.rpc("delete_account");
      expect(deletion.error).toBeNull();

      const leftover = await ctx.admin
        .from("group_invitations")
        .select("id, invited_user_email")
        .eq("group_id", groupId);
      expect(leftover.error).toBeNull();
      expect(leftover.data ?? []).toEqual([]);
    } finally {
      if (groupId) {
        await ctx.admin.from("user_groups").delete().eq("id", groupId);
      }
      await ctx.admin.auth.admin.deleteUser(temporary.userId);
    }
  });

  it("does not transfer another user's private rows when deleting", async () => {
    const temporary = await createTemporaryUser(ctx, "isolation");

    try {
      const deletion = await temporary.client.rpc("delete_account");
      expect(deletion.error).toBeNull();

      const survivor = await ctx.admin
        .from("categories")
        .select("id")
        .eq("id", expenseCatA)
        .single();
      expect(survivor.error).toBeNull();
      expect(survivor.data?.id).toBe(expenseCatA);
    } finally {
      await ctx.admin.auth.admin.deleteUser(temporary.userId);
    }
  });
});
