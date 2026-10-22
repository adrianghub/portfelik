import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  account: vi.fn(),
  existing: vi.fn(),
  open: vi.fn(),
  insert: vi.fn(),
  rows: vi.fn(),
  count: vi.fn(),
  categories: vi.fn(),
  createCategory: vi.fn(),
  categorize: vi.fn(),
  recount: vi.fn(),
  commit: vi.fn(),
  duplicates: vi.fn(),
  cash: vi.fn(),
}));
vi.mock("$lib/supabase", () => ({
  supabase: { auth: { getUser: mocks.getUser }, rpc: mocks.cash },
}));
vi.mock("$lib/services/categories", () => ({
  fetchCategories: mocks.categories,
  createCategory: mocks.createCategory,
}));
vi.mock("$lib/services/transactions", () => ({ fetchTransactionCount: mocks.count }));
vi.mock("$lib/services/bank-import", () => ({
  findOrCreateActiveAccount: mocks.account,
  findExistingSession: mocks.existing,
  openImportSession: mocks.open,
  insertPreviewRows: mocks.insert,
  fetchSessionRows: mocks.rows,
  updatePreviewCategories: mocks.categorize,
  updatePreviewRowCount: mocks.recount,
  markPreviewDuplicates: mocks.duplicates,
  commitImportSession: mocks.commit,
}));
import { DEMO_SAMPLE_OPENING, demoSampleCategory, prepareDemoSample } from "$lib/demo/sample";
import { fillDemoSample } from "$lib/services/demo-sample";

let bytes: ArrayBuffer;
let state: {
  session: null | { id: string; status: string; rows_committed: number };
  rows: unknown[];
  count: number;
};
beforeEach(async () => {
  vi.resetAllMocks();
  bytes = new Uint8Array(
    await readFile(new URL("../../static/sample-imports/jakstoimy-demo.csv", import.meta.url))
  ).buffer;
  state = { session: null, rows: [], count: 0 };
  vi.stubGlobal("navigator", {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes))
  );
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "demo-current", app_metadata: { account_kind: "demo" } } },
    error: null,
  });
  mocks.account.mockResolvedValue({ id: "demo-bank" });
  mocks.existing.mockImplementation(async () => state.session && { ...state.session });
  mocks.open.mockImplementation(async () => {
    state.session = { id: "preview", status: "preview", rows_committed: 0 };
    return { ...state.session };
  });
  mocks.insert.mockImplementation(async (_id, rows, resolver) => {
    state.rows = rows.map((r: { row_index: number }) => ({
      ...r,
      id: `row-${r.row_index}`,
      selected_category_id: resolver(r),
      selected_group_id: null,
      edited_description: null,
      decision: "import",
    }));
    return state.rows;
  });
  mocks.rows.mockImplementation(async () => state.rows);
  mocks.count.mockImplementation(async () => state.count);
  const file = await prepareDemoSample(bytes);
  mocks.categories.mockResolvedValue(
    [...new Set(file.rows.map(demoSampleCategory))].flatMap((name) =>
      ["income", "expense"].map((type) => ({
        id: `${type}-${name}`,
        name,
        type,
        user_id: "demo-current",
        archived_at: null,
      }))
    )
  );
  mocks.commit.mockImplementation(async () => {
    state.count = 96;
    state.session!.status = "committed";
    state.session!.rows_committed = 96;
    return { inserted: 96, duplicates_commit: 0, duplicates_preview: 0, skipped: 0 };
  });
  mocks.cash.mockResolvedValue({ error: null });
});
afterEach(() => vi.unstubAllGlobals());

it("maps all 96 pinned fictional rows to meaningful categories and preserves manifest totals", async () => {
  const file = await prepareDemoSample(bytes);
  expect(file.rows).toHaveLength(96);
  expect(new Set(file.rows.map((r) => r.posted_at.slice(0, 7))).size).toBe(6);
  expect(
    file.rows.filter((r) => r.type === "income").reduce((n, r) => n + Math.round(r.amount * 100), 0)
  ).toBe(6150000);
  expect(
    file.rows
      .filter((r) => r.type === "expense")
      .reduce((n, r) => n + Math.round(r.amount * 100), 0)
  ).toBe(3676584);
  for (const row of file.rows) expect(demoSampleCategory(row)).not.toMatch(/Inne/);
});
it("refuses different input even if it is a valid bank export", async () => {
  const changed = new TextEncoder().encode(
    new TextDecoder().decode(bytes).replace("BIEDRONKA", "LIDL")
  );
  await expect(prepareDemoSample(changed.buffer)).rejects.toThrow("demo_sample_invalid");
});
it("uses the existing cash engine with the persisted opening anchor", async () => {
  const { livePosition } = await vi.importActual<typeof import("$lib/services/cash-position")>(
    "$lib/services/cash-position"
  );
  const file = await prepareDemoSample(bytes);
  expect(
    livePosition(
      DEMO_SAMPLE_OPENING,
      file.rows.map((row) => ({
        amount: row.amount,
        type: row.type,
        currency: row.currency,
        date: row.posted_at,
        status: "paid",
      }))
    )
  ).toBe(29734.16);
});
it("coalesces double clicks and reuses the committed import without another ledger write", async () => {
  expect(await Promise.all([fillDemoSample(), fillDemoSample()])).toEqual([
    { inserted: 96, total: 96 },
    { inserted: 96, total: 96 },
  ]);
  expect(mocks.commit).toHaveBeenCalledTimes(1);
  expect(mocks.insert).toHaveBeenCalledTimes(1);
  expect(mocks.cash).toHaveBeenCalledWith("finish_demo_sample", { p_session_id: "preview" });
  expect(await fillDemoSample()).toEqual({ inserted: 0, total: 96 });
  expect(mocks.commit).toHaveBeenCalledTimes(1);
});
it("safely resumes a preview after commit fails", async () => {
  mocks.commit.mockRejectedValueOnce(new Error("commit unavailable"));
  await expect(fillDemoSample()).rejects.toThrow("commit unavailable");
  expect(state.count).toBe(0);
  expect(mocks.cash).not.toHaveBeenCalled();
  expect(await fillDemoSample()).toEqual({ inserted: 96, total: 96 });
  expect(mocks.insert).toHaveBeenCalledTimes(1);
});
it("repairs a missing cash anchor after successful commit without importing again", async () => {
  mocks.cash.mockRejectedValueOnce(new Error("anchor unavailable"));
  await expect(fillDemoSample()).rejects.toThrow("anchor unavailable");
  expect(state.count).toBe(96);
  expect(await fillDemoSample()).toEqual({ inserted: 0, total: 96 });
  expect(mocks.commit).toHaveBeenCalledTimes(1);
  expect(mocks.insert).toHaveBeenCalledTimes(1);
});
it("recovers preview rows and their count after a lost bulk-insert response", async () => {
  const insert = mocks.insert.getMockImplementation()!;
  mocks.insert.mockImplementationOnce(async (...args) => {
    await insert(...args);
    throw new Error("response lost");
  });
  expect(await fillDemoSample()).toEqual({ inserted: 96, total: 96 });
  expect(mocks.recount).toHaveBeenCalledWith("preview", 96);
  expect(mocks.commit).toHaveBeenCalledTimes(1);
});
it("refuses to add a second dataset over a partially seeded legacy ledger", async () => {
  state.count = 26;
  await expect(fillDemoSample()).rejects.toThrow("demo_sample_ledger_not_empty");
  expect(mocks.insert).not.toHaveBeenCalled();
  expect(mocks.commit).not.toHaveBeenCalled();
});
it("does not run on a real account", async () => {
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "real", app_metadata: {} } },
    error: null,
  });
  await expect(fillDemoSample()).rejects.toThrow("demo_account_required");
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.open).not.toHaveBeenCalled();
});

it("refills a deliberately cleared ledger without rewriting committed history", async () => {
  await fillDemoSample();
  state.count = 0;
  state.rows = [];
  expect(await fillDemoSample()).toEqual({ inserted: 96, total: 96 });
  expect(mocks.open).toHaveBeenCalledTimes(2);
  expect(mocks.commit).toHaveBeenCalledTimes(2);
});

it("retries the same imported history with three scheduled operations without importing again", async () => {
  await fillDemoSample();
  state.count = 99;
  expect(await fillDemoSample()).toEqual({ inserted: 0, total: 96 });
  expect(mocks.commit).toHaveBeenCalledTimes(1);
  expect(mocks.cash).toHaveBeenCalledTimes(2);
});

it("validates imported provenance when another client has already finalized the operations", async () => {
  const commit = mocks.commit.getMockImplementation()!;
  mocks.commit.mockImplementationOnce(async (...args) => {
    const result = await commit(...args);
    state.count = 99;
    return result;
  });
  expect(await fillDemoSample()).toEqual({ inserted: 96, total: 96 });
  expect(mocks.cash).toHaveBeenCalledWith("finish_demo_sample", { p_session_id: "preview" });
  expect(mocks.commit).toHaveBeenCalledTimes(1);
});
