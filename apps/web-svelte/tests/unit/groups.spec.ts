import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  type Result = { data: unknown; error: unknown };
  const state = {
    results: [] as Result[],
    user: { id: "user-1" } as { id: string } | null,
    log: {
      from: [] as string[],
      chain: [] as unknown[][],
      rpc: [] as { name: string; args: unknown }[],
    },
  };
  const nextResult = (): Result => state.results.shift() ?? { data: null, error: null };

  const makeBuilder = () =>
    new Proxy(
      {},
      {
        get(_target, prop: string) {
          if (prop === "then") {
            return (resolve: (r: unknown) => unknown) => resolve(nextResult());
          }
          return (...args: unknown[]) => {
            state.log.chain.push([prop, ...args]);
            return builderRef.current;
          };
        },
      }
    );

  const builderRef = { current: null as unknown };

  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    from: (table: string) => {
      state.log.from.push(table);
      builderRef.current = makeBuilder();
      return builderRef.current;
    },
    rpc: async (name: string, args: unknown) => {
      state.log.rpc.push({ name, args });
      return nextResult();
    },
  };

  return { state, supabase };
});

vi.mock("$lib/supabase", () => ({ supabase: h.supabase }));

import { acceptInvitation, createGroup, fetchMyGroupRoles } from "$lib/services/groups";

beforeEach(() => {
  h.state.results = [];
  h.state.user = { id: "user-1" };
  h.state.log.from = [];
  h.state.log.chain = [];
  h.state.log.rpc = [];
});

describe("fetchMyGroupRoles", () => {
  it("maps group_id to role", async () => {
    h.state.results = [
      {
        data: [
          { group_id: "g1", role: "owner" },
          { group_id: "g2", role: "co_owner" },
          { group_id: "g3", role: "member" },
        ],
        error: null,
      },
    ];

    const roles = await fetchMyGroupRoles();

    expect(roles.get("g1")).toBe("owner");
    expect(roles.get("g2")).toBe("co_owner");
    expect(roles.get("g3")).toBe("member");
    expect(roles.size).toBe(3);
    expect(h.state.log.from).toContain("group_members");
    expect(h.state.log.chain).toContainEqual(["eq", "user_id", "user-1"]);
  });

  it("throws when unauthenticated", async () => {
    h.state.user = null;

    await expect(fetchMyGroupRoles()).rejects.toThrow("not_authenticated");
    expect(h.state.log.from).toHaveLength(0);
  });
});

describe("createGroup", () => {
  it("returns the RPC payload", async () => {
    const group = {
      id: "g-new",
      name: "Dom",
      owner_id: "user-1",
      created_at: "2026-06-01T00:00:00Z",
      updated_at: "2026-06-01T00:00:00Z",
    };
    h.state.results = [{ data: group, error: null }];

    const out = await createGroup("Dom");

    expect(out).toEqual(group);
    expect(h.state.log.rpc).toEqual([{ name: "create_group", args: { p_name: "Dom" } }]);
  });

  it("propagates RPC errors", async () => {
    const rpcError = { message: "group_name_taken", code: "P0001" };
    h.state.results = [{ data: null, error: rpcError }];

    await expect(createGroup("Dom")).rejects.toEqual(rpcError);
  });
});

describe("acceptInvitation", () => {
  it("calls accept_invitation with the invitation id", async () => {
    h.state.results = [{ data: null, error: null }];

    await acceptInvitation("inv-42");

    expect(h.state.log.rpc).toEqual([
      { name: "accept_invitation", args: { p_invitation_id: "inv-42" } },
    ]);
  });

  it("propagates RPC errors", async () => {
    const rpcError = { message: "invitation_not_found" };
    h.state.results = [{ data: null, error: rpcError }];

    await expect(acceptInvitation("inv-missing")).rejects.toEqual(rpcError);
  });
});
