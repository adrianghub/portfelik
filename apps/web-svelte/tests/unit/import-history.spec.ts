import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportRow } from "$lib/services/bank-import";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  range: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  select: vi.fn(),
}));
vi.mock("$lib/supabase", () => ({
  supabase: { auth: { getUser: mocks.getUser }, from: mocks.from },
}));

import {
  fetchImportHistory,
  importHistoryDateRange,
  importHistoryTransactionsUrl,
} from "$lib/services/import-history";

describe("committed import history", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = { select: mocks.select, eq: mocks.eq, order: mocks.order, range: mocks.range };
    mocks.from.mockReturnValue(query);
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.order.mockReturnValue(query);
    mocks.getUser.mockResolvedValue({ data: { user: { id: "owner" } }, error: null });
  });

  it("reads only the caller's committed sessions and preserves stored results across pages", async () => {
    const first = Array.from({ length: 1000 }, (_, id) => ({
      id: String(id),
      rows_committed: 76,
      rows_duplicate: 8,
      rows_skipped: 0,
    }));
    mocks.range
      .mockResolvedValueOnce({ data: first, error: null })
      .mockResolvedValueOnce({ data: [{ id: "last", rows_committed: 3 }], error: null });
    const result = await fetchImportHistory();
    expect(result).toHaveLength(1001);
    expect(result[0].rows_committed).toBe(76);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "owner");
    expect(mocks.eq).toHaveBeenCalledWith("status", "committed");
    expect(mocks.range).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(mocks.order).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("does not query provenance without authentication", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await expect(fetchImportHistory()).rejects.toThrow("Not authenticated");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("propagates failed pages without presenting partial history", async () => {
    const error = new Error("unavailable");
    mocks.range.mockResolvedValue({ data: null, error });
    await expect(fetchImportHistory()).rejects.toBe(error);
  });

  it("finds the complete statement period independently of ordering and decisions", () => {
    const rows = [
      { posted_at: "2026-10-02", decision: "skip" },
      { posted_at: "2026-08-30", decision: "duplicate" },
      { posted_at: "2026-09-01", decision: "import" },
    ] as ImportRow[];
    expect(importHistoryDateRange(rows)).toEqual({ start: "2026-08-30", end: "2026-10-02" });
    expect(importHistoryTransactionsUrl(rows)).toBe(
      "/transactions?startYear=2026&startMonth=8&endYear=2026&endMonth=10"
    );
    expect(importHistoryDateRange([])).toBeNull();
    expect(importHistoryTransactionsUrl([])).toBeNull();
  });
});
