import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUser = { id: "user-1" };

const fromHandlers: Record<string, () => unknown> = {
  categorization_rules: () => ({
    select: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({ data: [{ id: "r1" }], error: null })),
  }),
  bank_accounts: () => ({
    select: vi.fn(async () => ({ data: [], error: null })),
  }),
  transaction_import_sessions: () => ({
    select: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({ data: [], error: null })),
  }),
  profiles: () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({
      data: { id: "user-1", email: "a@test.pl" },
      error: null,
    })),
  }),
  financial_snapshots: () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({
      data: { user_id: "user-1", cash_amount: 100 },
      error: null,
    })),
  }),
  plan_debt_terms: () => ({
    select: vi.fn().mockReturnThis(),
    in: vi.fn(async () => ({ data: [{ plan_id: "p1" }], error: null })),
  }),
  group_members: () => ({
    select: vi.fn().mockReturnThis(),
    in: vi.fn(async () => ({ data: [{ group_id: "g1", user_id: "user-1" }], error: null })),
  }),
};

vi.mock("$lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mockUser }, error: null })),
    },
    from: vi.fn((table: string) => {
      const handler = fromHandlers[table];
      if (!handler) throw new Error(`unexpected table ${table}`);
      return handler();
    }),
  },
}));

vi.mock("$lib/services/transactions", () => ({
  fetchAllTransactionsForExport: vi.fn(async () => [{ id: "t1" }]),
}));
vi.mock("$lib/services/categories", () => ({
  fetchCategories: vi.fn(async () => [{ id: "c1" }]),
}));
vi.mock("$lib/services/plans", () => ({
  fetchPlansForExport: vi.fn(async () => [{ id: "p1" }]),
}));
vi.mock("$lib/services/groups", () => ({
  fetchUserGroups: vi.fn(async () => [{ id: "g1" }]),
}));

import { buildAccountExport } from "$lib/services/account-export";

describe("buildAccountExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes debt terms and financial snapshot keys", async () => {
    const bundle = await buildAccountExport();
    expect(bundle.transactions).toHaveLength(1);
    expect(bundle.plans).toHaveLength(1);
    expect(bundle.plan_debt_terms).toHaveLength(1);
    expect(bundle.financial_snapshot).toMatchObject({ cash_amount: 100 });
    expect(bundle.group_members).toHaveLength(1);
    expect(bundle.exported_at).toBeTruthy();
  });
});
