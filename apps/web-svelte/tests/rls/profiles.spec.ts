import { beforeAll, describe, expect, it } from "vitest";
import { expectBlockedWrite, provisionTwoUsers, type TestContext } from "./setup";

describe("RLS: profiles", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
  });

  it("user A reads own profile", async () => {
    const { data, error } = await ctx.userA.client
      .from("profiles")
      .select("id, email, role")
      .eq("id", ctx.userA.userId);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
    expect(data?.[0].email).toBe(ctx.userA.email);
  });

  it("user A cannot read user B's profile", async () => {
    const { data, error } = await ctx.userA.client
      .from("profiles")
      .select("id")
      .eq("id", ctx.userB.userId);
    expect(error).toBeNull();
    expect(data?.length).toBe(0);
  });

  it("user A cannot self-elevate to admin (role column protected)", async () => {
    const result = await ctx.userA.client
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", ctx.userA.userId)
      .select();
    // Either explicit grant error or update succeeds but role stays "user"
    // (REVOKE UPDATE on role column from authenticated).
    if (!result.error) {
      const { data } = await ctx.admin
        .from("profiles")
        .select("role")
        .eq("id", ctx.userA.userId)
        .single();
      expect(data?.role).toBe("user");
    }
  });

  it("assign_admin_role denies non-admin caller", async () => {
    const { error } = await ctx.userA.client.rpc("assign_admin_role", {
      p_user_id: ctx.userA.userId,
    });
    expect(error).not.toBeNull();
  });

  it("user A cannot update user B's profile", async () => {
    const result = await ctx.userA.client
      .from("profiles")
      .update({ name: "hacked" })
      .eq("id", ctx.userB.userId)
      .select();
    expectBlockedWrite(result);
  });
});
