import { beforeAll, describe, expect, it } from "vitest";
import { createAnonClient, provisionTwoUsers, type TestContext } from "./setup";

describe("function execute hardening", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await provisionTwoUsers();
  });

  it("denies anon seed_default_categories", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("seed_default_categories", {
      p_user_id: ctx.userA.userId,
    });
    expect(error).not.toBeNull();
  });

  it("denies authenticated direct seed_default_categories", async () => {
    const { error } = await ctx.userA.client.rpc("seed_default_categories", {
      p_user_id: ctx.userA.userId,
    });
    expect(error).not.toBeNull();
  });

  it("denies anon complete_shopping_list when present", async () => {
    const anon = createAnonClient();
    const { error } = await anon.rpc("complete_shopping_list", {
      p_list_id: "00000000-0000-4000-8000-000000000001",
      p_total_amount: 1,
      p_category_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(error).not.toBeNull();
  });
});
