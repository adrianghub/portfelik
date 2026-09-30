import { describe, expect, it, vi } from "vitest";
import { fetchAllPages } from "$lib/services/fetch-all-pages";

describe("fetchAllPages", () => {
  it("combines subsequent pages in order", async () => {
    const rows = Array.from({ length: 1501 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    }));

    await expect(fetchAllPages(fetchPage)).resolves.toEqual(rows);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it("propagates an error from a later page", async () => {
    const failure = new Error("second-page-failed");
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, id) => ({ id })),
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: failure });

    await expect(fetchAllPages(fetchPage)).rejects.toBe(failure);
  });
});
