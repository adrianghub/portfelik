import { describe, expect, it } from "vitest";
import { canManageTransaction } from "$lib/services/transaction-permissions";
import type { GroupMemberRole } from "$lib/types";

describe("canManageTransaction", () => {
  const roles = new Map<string, GroupMemberRole>([
    ["g1", "member"],
    ["g2", "co_owner"],
  ]);

  it("allows creator on private row", () => {
    expect(canManageTransaction({ user_id: "u1", group_id: null }, "u1", roles)).toBe(true);
  });

  it("denies peer member on shared row", () => {
    expect(canManageTransaction({ user_id: "u2", group_id: "g1" }, "u1", roles)).toBe(false);
  });

  it("allows co-owner on shared row", () => {
    expect(canManageTransaction({ user_id: "u2", group_id: "g2" }, "u1", roles)).toBe(true);
  });

  it("allows group owner role on shared row", () => {
    const ownerRoles = new Map<string, GroupMemberRole>([["g3", "owner"]]);
    expect(canManageTransaction({ user_id: "u2", group_id: "g3" }, "u1", ownerRoles)).toBe(true);
  });
});
