import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("$lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import {
  fetchMaskedTransaction,
  fetchMaskedImportSession,
  fetchMaskedUserContext,
} from "$lib/services/admin-diagnostics";

describe("admin-diagnostics service", () => {
  beforeEach(() => rpc.mockReset());

  it("calls the transaction RPC with the id and returns data", async () => {
    rpc.mockResolvedValue({ data: { transaction_id: "t1", amount_bucket: "< 50 PLN" }, error: null });
    const r = await fetchMaskedTransaction("t1");
    expect(rpc).toHaveBeenCalledWith("admin_masked_transaction_by_id", { p_transaction_id: "t1" });
    expect(r?.amount_bucket).toBe("< 50 PLN");
  });

  it("throws on RPC error", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "permission_denied" } });
    await expect(fetchMaskedUserContext("u1")).rejects.toThrow(/permission_denied/);
  });

  it("maps session + user RPC names", async () => {
    rpc.mockResolvedValue({ data: {}, error: null });
    await fetchMaskedImportSession("s1");
    expect(rpc).toHaveBeenCalledWith("admin_masked_import_session_by_id", { p_session_id: "s1" });
    await fetchMaskedUserContext("u1");
    expect(rpc).toHaveBeenCalledWith("admin_masked_user_context_by_id", { p_user_id: "u1" });
  });
});
