// Service-layer unit tests for bank-import.ts.
//
// These run in a plain node env: the supabase singleton is fully mocked, so
// the SvelteKit $env import never evaluates and no DB/DOM is needed. The mock
// is a chainable, thenable PostgREST-style builder that resolves each awaited
// chain to the next queued { data, error } and records the calls so we can
// assert payloads (user_id, column mapping) and query shape (neq cancelled,
// status=preview, limit 1).

import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_UID = "user-aaa";

const h = vi.hoisted(() => {
  type Result = { data: unknown; error: unknown };
  const state = {
    results: [] as Result[],
    // Inlined literal (not TEST_UID) - vi.hoisted runs before the const above.
    user: { id: "user-aaa" } as { id: string } | null,
    log: {
      from: [] as string[],
      insert: [] as unknown[],
      update: [] as unknown[],
      rpc: [] as { name: string; args: unknown }[],
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
            else if (prop === "update") state.log.update.push(args[0]);
            else state.log.chain.push([prop, ...args]);
            return builderRef.current;
          };
        },
      }
    );

  const builderRef = { current: null as unknown };

  const supabase = {
    auth: { getUser: async () => ({ data: { user: state.user } }) },
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

import {
  cancelImportSession,
  commitImportSession,
  fetchActivePreviewSession,
  findExistingSession,
  insertPreviewRows,
  openImportSession,
  updateRowDecision,
} from "$lib/services/bank-import";
import type { NormalizedRow } from "$lib/import/banks/types";

beforeEach(() => {
  h.state.results = [];
  h.state.user = { id: TEST_UID };
  h.state.log.from = [];
  h.state.log.insert = [];
  h.state.log.update = [];
  h.state.log.rpc = [];
  h.state.log.chain = [];
});

describe("openImportSession", () => {
  it("inserts with the caller's user_id and mirrors adapter -> detected kind", async () => {
    const session = { id: "s1", status: "preview" };
    h.state.results = [{ data: session, error: null }];

    const out = await openImportSession({
      bankAccountId: "acc1",
      sourceFilename: "wyciag.csv",
      sourceFileHash: "hash1",
      adapterKind: "mbank",
    });

    expect(out).toBe(session);
    expect(h.state.log.from).toContain("transaction_import_sessions");
    expect(h.state.log.insert[0]).toMatchObject({
      user_id: TEST_UID,
      bank_account_id: "acc1",
      source_file_hash: "hash1",
      adapter_kind: "mbank",
      detected_kind: "mbank",
      source_kind: "bank_statement",
    });
  });
});

describe("findExistingSession", () => {
  it("excludes cancelled drafts from the lookup", async () => {
    h.state.results = [{ data: { id: "s1" }, error: null }];

    const out = await findExistingSession({ bankAccountId: "acc1", sourceFileHash: "h" });

    expect(out).toEqual({ id: "s1" });
    expect(h.state.log.chain).toContainEqual(["neq", "status", "cancelled"]);
  });
});

describe("fetchActivePreviewSession", () => {
  it("returns null and never queries when unauthenticated", async () => {
    h.state.user = null;

    const out = await fetchActivePreviewSession();

    expect(out).toBeNull();
    expect(h.state.log.from).toHaveLength(0);
  });

  it("queries the caller's latest open preview", async () => {
    h.state.results = [{ data: { id: "s9", status: "preview" }, error: null }];

    const out = await fetchActivePreviewSession();

    expect(out).toEqual({ id: "s9", status: "preview" });
    expect(h.state.log.chain).toContainEqual(["eq", "status", "preview"]);
    expect(h.state.log.chain).toContainEqual(["limit", 1]);
  });
});

describe("insertPreviewRows", () => {
  const row = (i: number): NormalizedRow =>
    ({
      row_index: i,
      posted_at: "2026-05-0" + (i + 1),
      amount: 10 + i,
      type: "expense",
      description: "d" + i,
      counterparty: null,
      currency: "PLN",
      external_id: null,
      raw_row_hash: "h" + i,
      source_row_text: "raw" + i,
    }) as unknown as NormalizedRow;

  it("returns [] and makes no calls for an empty batch", async () => {
    const out = await insertPreviewRows("s1", []);
    expect(out).toEqual([]);
    expect(h.state.log.from).toHaveLength(0);
  });

  it("applies the category resolver to both columns and records rows_total", async () => {
    const inserted = [{ id: "r0" }, { id: "r1" }];
    h.state.results = [
      { data: inserted, error: null },
      { data: null, error: null },
    ];

    const out = await insertPreviewRows("s1", [row(0), row(1)], () => "cat-9");

    expect(out).toBe(inserted);
    const payload = h.state.log.insert[0] as Record<string, unknown>[];
    expect(payload).toHaveLength(2);
    expect(payload[0]).toMatchObject({
      session_id: "s1",
      suggested_category_id: "cat-9",
      selected_category_id: "cat-9",
      decision: "import",
    });
    expect(h.state.log.update[0]).toEqual({ rows_total: 2 });
  });

  it("leaves categories null when no resolver matches", async () => {
    h.state.results = [
      { data: [], error: null },
      { data: null, error: null },
    ];

    await insertPreviewRows("s1", [row(0)], () => null);

    const payload = h.state.log.insert[0] as Record<string, unknown>[];
    expect(payload[0]).toMatchObject({
      suggested_category_id: null,
      selected_category_id: null,
    });
  });
});

describe("updateRowDecision", () => {
  it("skips the write when the patch is empty", async () => {
    await updateRowDecision("r1", {});
    expect(h.state.log.from).toHaveLength(0);
  });

  it("maps fields to columns and targets the row id", async () => {
    h.state.results = [{ data: null, error: null }];

    await updateRowDecision("r1", {
      decision: "skip",
      selectedCategoryId: "c2",
      duplicateOf: null,
    });

    expect(h.state.log.update[0]).toEqual({
      decision: "skip",
      selected_category_id: "c2",
      duplicate_of: null,
    });
    expect(h.state.log.chain).toContainEqual(["eq", "id", "r1"]);
  });
});

describe("cancelImportSession", () => {
  it("soft-cancels by setting status=cancelled", async () => {
    h.state.results = [{ data: null, error: null }];

    await cancelImportSession("s1");

    expect(h.state.log.update[0]).toEqual({ status: "cancelled" });
    expect(h.state.log.chain).toContainEqual(["eq", "id", "s1"]);
  });

  it("throws on error", async () => {
    h.state.results = [{ data: null, error: { message: "boom" } }];
    await expect(cancelImportSession("s1")).rejects.toEqual({ message: "boom" });
  });
});

describe("commitImportSession", () => {
  it("calls the commit RPC and returns the result", async () => {
    const result = { inserted: 3, skipped: 1 };
    h.state.results = [{ data: result, error: null }];

    const out = await commitImportSession("s1");

    expect(out).toBe(result);
    expect(h.state.log.rpc[0]).toEqual({
      name: "commit_import_session",
      args: { p_session_id: "s1" },
    });
  });

  it("throws when the RPC errors (validation rollback)", async () => {
    h.state.results = [{ data: null, error: { message: "rows_pending" } }];
    await expect(commitImportSession("s1")).rejects.toEqual({ message: "rows_pending" });
  });
});
