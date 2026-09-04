import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    result: { data: [] as { id: string }[], error: null as unknown },
  };

  const builder = new Proxy(
    {},
    {
      get(_target, prop: string) {
        if (prop === "then") {
          return (resolve: (result: unknown) => unknown) => resolve(state.result);
        }
        return () => builder;
      },
    }
  );

  return {
    state,
    supabase: { from: vi.fn(() => builder) },
  };
});

vi.mock("$lib/supabase", () => ({ supabase: h.supabase }));

import { updateTransactionStatus } from "$lib/services/transactions";

describe("updateTransactionStatus", () => {
  beforeEach(() => {
    h.state.result = { data: [], error: null };
    h.supabase.from.mockClear();
  });

  it("rejects a zero-row update instead of reporting settlement success", async () => {
    await expect(updateTransactionStatus("missing", "paid")).rejects.toThrow(
      "transaction_status_not_updated"
    );
  });

  it("resolves when the transaction was updated", async () => {
    h.state.result = { data: [{ id: "tx-1" }], error: null };

    await expect(updateTransactionStatus("tx-1", "paid")).resolves.toBeUndefined();
  });
});
