import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
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
  cash_positions: () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn(async () => ({
      data: [{ owner_id: "user-1", opening_amount: 500 }],
      error: null,
    })),
  }),
  net_worth_items: () => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({
      data: [{ label: "ETF", amount: 1000, currency: "PLN" }],
      error: null,
    })),
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
  plan_transaction_links: () => ({
    select: vi.fn().mockReturnThis(),
    in: vi.fn(async () => ({ data: [{ id: "link-1", plan_id: "p1" }], error: null })),
  }),
  plan_progress_snapshots: () => ({
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({
      data: [{ id: "ps1", plan_id: "p1", saved_amount: 250 }],
      error: null,
    })),
  }),
  group_members: () => ({
    select: vi.fn().mockReturnThis(),
    in: vi.fn(async () => ({ data: [{ group_id: "g1", user_id: "user-1" }], error: null })),
  }),
  recurring_occurrence_skips: () => ({
    select: vi.fn().mockReturnThis(),
    order: vi.fn(async () => ({ data: [{ id: "skip-1" }], error: null })),
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

import {
  ACCOUNT_EXPORT_CONTRACT,
  ACCOUNT_EXPORT_TABLE_INVENTORY,
  buildAccountExport,
} from "$lib/services/account-export";

function finalPublicTablesFromMigrations(): string[] {
  const migrationsDir = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../supabase/migrations"
  );
  const tables = new Set<string>();
  for (const filename of readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    const sql = readFileSync(resolve(migrationsDir, filename), "utf8");
    for (const match of sql.matchAll(
      /\b(create|drop)\s+table\s+(?:(?:if\s+not\s+exists|if\s+exists)\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi
    )) {
      if (match[1].toLowerCase() === "create") tables.add(match[2]);
      else tables.delete(match[2]);
    }
  }
  return [...tables].sort();
}

describe("buildAccountExport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes balance-sheet keys under the informational contract", async () => {
    const bundle = await buildAccountExport();
    expect(bundle.export_contract).toBe(ACCOUNT_EXPORT_CONTRACT);
    expect(bundle.transactions).toHaveLength(1);
    expect(bundle.plans).toHaveLength(1);
    expect(bundle.plan_transaction_links).toHaveLength(1);
    expect(bundle.plan_debt_terms).toHaveLength(1);
    expect(bundle.plan_progress_snapshots).toEqual([
      expect.objectContaining({ id: "ps1", plan_id: "p1", saved_amount: 250 }),
    ]);
    expect(bundle.cash_positions).toHaveLength(1);
    expect(bundle.net_worth_items).toHaveLength(1);
    expect(bundle.financial_snapshot).toMatchObject({ cash_amount: 100 });
    expect(bundle.group_members).toHaveLength(1);
    expect(bundle.recurring_occurrence_skips).toHaveLength(1);
    expect(bundle.exported_at).toBeTruthy();
  });

  it("classifies every app-owned public table from the final migration schema", () => {
    expect(Object.keys(ACCOUNT_EXPORT_TABLE_INVENTORY).sort()).toEqual(
      finalPublicTablesFromMigrations()
    );
  });
});
