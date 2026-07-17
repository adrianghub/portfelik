import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_UID = "user-aaa";

const h = vi.hoisted(() => {
  type Result = { data: unknown; error: unknown };
  const state = {
    results: [] as Result[],
    user: { id: "user-aaa" } as { id: string } | null,
    log: {
      from: [] as string[],
      insert: [] as unknown[],
      chain: [] as unknown[][],
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
            if (prop === "insert") state.log.insert.push(args[0]);
            else state.log.chain.push([prop, ...args]);
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
  };

  return { state, supabase };
});

vi.mock("$lib/supabase", () => ({ supabase: h.supabase }));

import {
  buildCategorizationRuleEditPatch,
  createCategorizationRule,
} from "$lib/services/categorization-rules";

beforeEach(() => {
  h.state.results = [];
  h.state.user = { id: TEST_UID };
  h.state.log.from = [];
  h.state.log.insert = [];
  h.state.log.chain = [];
});

describe("createCategorizationRule", () => {
  it("throws duplicate_categorization_rule when findDuplicate matches", async () => {
    h.state.results = [
      {
        data: [
          {
            id: "rule-1",
            user_id: TEST_UID,
            kind: "contains",
            match_description: "biedronka",
            match_counterparty: null,
            match_type: null,
            match_day_of_month: null,
            category_id: "cat-1",
            priority: 0,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      },
    ];

    await expect(
      createCategorizationRule({
        kind: "contains",
        match_description: "  BIEDRONKA ",
        category_id: "cat-1",
      })
    ).rejects.toThrow("duplicate_categorization_rule");

    expect(h.state.log.insert).toHaveLength(0);
  });

  it("passes user_id on insert", async () => {
    const created = {
      id: "rule-new",
      user_id: TEST_UID,
      kind: "contains",
      match_description: "lidl",
      match_counterparty: null,
      match_type: null,
      match_day_of_month: null,
      category_id: "cat-2",
      priority: 0,
      created_at: "2026-06-01T00:00:00Z",
    };
    h.state.results = [{ data: [], error: null }, { data: created, error: null }];

    const out = await createCategorizationRule({
      kind: "contains",
      match_description: "lidl",
      category_id: "cat-2",
    });

    expect(out).toEqual(created);
    expect(h.state.log.from).toEqual(["categorization_rules", "categorization_rules"]);
    expect(h.state.log.insert[0]).toMatchObject({
      user_id: TEST_UID,
      kind: "contains",
      match_description: "lidl",
      category_id: "cat-2",
      priority: 0,
    });
  });
});

describe("buildCategorizationRuleEditPatch", () => {
  const form = {
    categoryId: "cat-9",
    descEnabled: true,
    desc: "  lidl  ",
    counterpartyEnabled: false,
    counterparty: "",
    dateEnabled: false,
    dayOfMonth: "1",
  };

  it("never includes kind and preserves composite match_type", () => {
    const built = buildCategorizationRuleEditPatch(
      { kind: "composite", match_type: "expense" },
      form
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.patch).toEqual({
      category_id: "cat-9",
      match_description: "lidl",
      match_counterparty: null,
      match_day_of_month: null,
      match_type: "expense",
    });
    expect(built.patch).not.toHaveProperty("kind");
  });

  it("allows type rules without text fields", () => {
    const built = buildCategorizationRuleEditPatch(
      { kind: "type", match_type: "income" },
      { ...form, descEnabled: false, categoryId: "cat-income" }
    );
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.patch).toEqual({
      category_id: "cat-income",
      match_type: "income",
      match_day_of_month: null,
    });
  });

  it("rejects clearing text on contains rules", () => {
    expect(
      buildCategorizationRuleEditPatch(
        { kind: "contains", match_type: null },
        { ...form, descEnabled: false, counterpartyEnabled: false }
      )
    ).toEqual({ ok: false, issue: "require_condition" });
  });
});
