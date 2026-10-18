import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SENTINEL,
  assertLocalSupabaseUrl,
  cleanupSentinels,
  createAdminClient,
  createUserClient,
  provisionTwoUsers,
  type TestContext,
} from "./setup";

type DemoFixture = {
  userId: string;
  email: string;
  client: SupabaseClient;
  accessToken: string;
};

async function provisionDemoUser(label: string): Promise<DemoFixture> {
  const admin = createAdminClient();
  const password = process.env.RLS_TEST_PASSWORD!;
  const email = `demo-${label}-${randomUUID()}@demo.jakstoimy.local`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { account_kind: "demo" },
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("create demo user failed");
  }
  const userId = created.data.user.id;
  const registered = await admin.rpc("register_demo_identity", { p_user_id: userId });
  if (registered.error) throw registered.error;

  const url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY!;
  const loginClient = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const login = await loginClient.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) {
    throw login.error ?? new Error("demo sign-in failed");
  }
  return {
    userId,
    email,
    accessToken: login.data.session.access_token,
    client: createUserClient(login.data.session.access_token),
  };
}

function expectDemoDenied(error: { message?: string } | null) {
  expect(error).not.toBeNull();
  expect(error?.message ?? "").toMatch(/demo_not_allowed/);
}

describe("B1 demo identity guards", () => {
  let ctx: TestContext;
  let demoA: DemoFixture;
  let demoB: DemoFixture;
  const createdDemoIds: string[] = [];

  beforeAll(async () => {
    assertLocalSupabaseUrl(process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL!);
    ctx = await provisionTwoUsers();
    await cleanupSentinels(ctx.admin);
    demoA = await provisionDemoUser("a");
    demoB = await provisionDemoUser("b");
    createdDemoIds.push(demoA.userId, demoB.userId);
  });

  afterAll(async () => {
    const admin = createAdminClient();
    for (const id of createdDemoIds) {
      await admin.from("demo_identities").delete().eq("user_id", id);
      await admin.auth.admin.deleteUser(id);
    }
    if (ctx) await cleanupSentinels(ctx.admin);
  });

  it("demo cannot create_group", async () => {
    const { error } = await demoA.client.rpc("create_group", {
      p_name: `${SENTINEL} demo-group`,
    });
    expectDemoDenied(error);
  });

  it("demo cannot claim or accept invitations", async () => {
    const group = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} real-for-invite`,
    });
    expect(group.error).toBeNull();
    const groupId = (group.data as { id: string }).id;

    const invited = await ctx.admin.rpc("create_group_invitation_for_delivery", {
      p_group_id: groupId,
      p_email: demoA.email,
      p_actor_id: ctx.userA.userId,
    });
    expectDemoDenied(invited.error);

    const pending = await ctx.admin.from("group_invitations").insert({
      group_id: groupId,
      group_name: `${SENTINEL} pending`,
      invited_user_email: demoA.email,
      created_by: ctx.userA.userId,
      status: "pending",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    }).select("id").single();
    // Direct insert may be blocked for service role depending on grants; use admin bypass.
    if (!pending.error && pending.data?.id) {
      const accept = await demoA.client.rpc("accept_invitation", {
        p_invitation_id: pending.data.id,
      });
      expectDemoDenied(accept.error);
    }

    const claim = await demoA.client.rpc("claim_group_invitation", {
      p_token: "0000000000000000000000000000000000000000000000000000000000000000",
    });
    expectDemoDenied(claim.error);
  });

  it("real owner cannot invite a registered demo email", async () => {
    const group = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} invite-demo-email`,
    });
    expect(group.error).toBeNull();
    const groupId = (group.data as { id: string }).id;
    const invited = await ctx.admin.rpc("create_group_invitation_for_delivery", {
      p_group_id: groupId,
      p_email: demoB.email,
      p_actor_id: ctx.userA.userId,
    });
    expectDemoDenied(invited.error);
  });

  it("demo cannot obtain membership via admin upsert then keep social RPCs denied", async () => {
    const group = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} force-member`,
    });
    const groupId = (group.data as { id: string }).id;
    // Service-role bypass of RLS is not a product path; still ensure demo cannot
    // elevate via transfer/nominate even if a row were forced in.
    await ctx.admin.from("group_members").upsert({
      group_id: groupId,
      user_id: demoA.userId,
      role: "member",
    });
    const transfer = await ctx.userA.client.rpc("transfer_group_ownership", {
      p_group_id: groupId,
      p_new_owner_id: demoA.userId,
    });
    expectDemoDenied(transfer.error);
    const nominate = await ctx.userA.client.rpc("nominate_group_co_owner", {
      p_group_id: groupId,
      p_user_id: demoA.userId,
    });
    expectDemoDenied(nominate.error);
  });

  it("demo cannot assign or receive admin role", async () => {
    const asDemo = await demoA.client.rpc("assign_admin_role", {
      p_user_id: ctx.userB.userId,
    });
    expect(asDemo.error).not.toBeNull();

    // Make userA admin, then try targeting demo.
    await ctx.admin.from("profiles").update({ role: "admin" }).eq("id", ctx.userA.userId);
    // Refresh token not needed for service-side assign via userA if is_admin reads profiles.
    const targetDemo = await ctx.userA.client.rpc("assign_admin_role", {
      p_user_id: demoA.userId,
    });
    // userA may not be admin in JWT path - is_admin() reads profiles table.
    expectDemoDenied(targetDemo.error);
    await ctx.admin.from("profiles").update({ role: "user" }).eq("id", ctx.userA.userId);
  });

  it("client cannot self-promote out of demo via user_metadata", async () => {
    const url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY!;
    const authed = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${demoA.accessToken}` } },
    });
    await authed.auth.updateUser({ data: { account_kind: "real" } });
    const stillDemo = await ctx.admin.rpc("is_demo_account", { p_user_id: demoA.userId });
    expect(stillDemo.data).toBe(true);
    const group = await demoA.client.rpc("create_group", {
      p_name: `${SENTINEL} after-meta`,
    });
    expectDemoDenied(group.error);
  });

  it("Auth conversion (password update) does not elevate demo", async () => {
    const url = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY!;
    const password = `${randomUUID()}Aa1!`;
    const login = await createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.signInWithPassword({
      email: demoB.email,
      password: process.env.RLS_TEST_PASSWORD!,
    });
    expect(login.error).toBeNull();
    const authed = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await authed.auth.setSession({
      access_token: login.data.session!.access_token,
      refresh_token: login.data.session!.refresh_token,
    });
    const updated = await authed.auth.updateUser({ password });
    expect(updated.error).toBeNull();

    const kind = await ctx.admin.rpc("is_demo_account", { p_user_id: demoB.userId });
    expect(kind.data).toBe(true);

    const relogin = await createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.signInWithPassword({ email: demoB.email, password });
    expect(relogin.error).toBeNull();
    const convertedClient = createUserClient(relogin.data.session!.access_token);
    const still = await convertedClient.rpc("create_group", {
      p_name: `${SENTINEL} after-convert`,
    });
    expectDemoDenied(still.error);
  });

  it("demo A cannot read demo B private transactions; demo cannot read real data", async () => {
    const realCat = await ctx.admin
      .from("categories")
      .select("id")
      .eq("user_id", ctx.userA.userId)
      .limit(1)
      .single();
    const demoCat = await ctx.admin
      .from("categories")
      .select("id")
      .eq("user_id", demoB.userId)
      .limit(1)
      .single();
    expect(realCat.data?.id).toBeTruthy();
    expect(demoCat.data?.id).toBeTruthy();

    const realTx = await ctx.userA.client.from("transactions").insert({
      user_id: ctx.userA.userId,
      amount: 12.34,
      type: "expense",
      description: `${SENTINEL} real-tx`,
      date: "2026-10-01",
      category_id: realCat.data!.id,
      currency: "PLN",
      status: "paid",
    }).select("id").single();
    expect(realTx.error).toBeNull();

    const demoTx = await demoB.client.from("transactions").insert({
      user_id: demoB.userId,
      amount: 5.5,
      type: "expense",
      description: `${SENTINEL} demo-b-tx`,
      date: "2026-10-01",
      category_id: demoCat.data!.id,
      currency: "PLN",
      status: "paid",
    }).select("id").single();
    expect(demoTx.error).toBeNull();

    const crossDemo = await demoA.client
      .from("transactions")
      .select("id")
      .eq("id", demoTx.data!.id);
    expect(crossDemo.data ?? []).toEqual([]);

    const crossReal = await demoA.client
      .from("transactions")
      .select("id")
      .eq("id", realTx.data!.id);
    expect(crossReal.data ?? []).toEqual([]);
  });

  it("real accounts still create groups; demo keeps private financial writes", async () => {
    const group = await ctx.userA.client.rpc("create_group", {
      p_name: `${SENTINEL} real-still-works`,
    });
    expect(group.error).toBeNull();

    const demoCat = await ctx.admin
      .from("categories")
      .select("id")
      .eq("user_id", demoA.userId)
      .eq("type", "income")
      .limit(1)
      .single();
    expect(demoCat.data?.id).toBeTruthy();
    const tx = await demoA.client.from("transactions").insert({
      user_id: demoA.userId,
      amount: 42,
      type: "income",
      description: `${SENTINEL} demo-income`,
      date: "2026-10-02",
      category_id: demoCat.data!.id,
      currency: "PLN",
      status: "paid",
    }).select("id").single();
    expect(tx.error).toBeNull();
  });

  it("missing registry + non-demo metadata keeps real capable; missing user fails closed", async () => {
    const realCheck = await ctx.admin.rpc("is_demo_account", {
      p_user_id: ctx.userA.userId,
    });
    expect(realCheck.data).toBe(false);

    const missing = await ctx.admin.rpc("assert_real_capable", {
      p_user_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(missing.error).not.toBeNull();
    expect(missing.error?.message ?? "").toMatch(/demo_not_allowed/);
  });

  it("authenticated cannot insert into demo_identities", async () => {
    const forged = await demoA.client.from("demo_identities").insert({
      user_id: ctx.userA.userId,
    });
    expect(forged.error).not.toBeNull();
  });
});
