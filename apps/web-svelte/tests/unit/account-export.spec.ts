import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockUser = { id: "user-1" };
let ruleRows: unknown[] = [{ id: "r1" }];

function pagedRows(rows: unknown[]) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(async (from: number, to: number) => ({
      data: rows.slice(from, to + 1),
      error: null,
    })),
  };
  return builder;
}

const fromHandlers: Record<string, () => unknown> = {
  categories: () => pagedRows([{ id: "c1" }]),
  plans: () => pagedRows([{ id: "p1" }]),
  user_groups: () => pagedRows([{ id: "g1" }]),
  categorization_rules: () => pagedRows(ruleRows),
  bank_accounts: () => pagedRows([]),
  transaction_import_sessions: () => pagedRows([]),
  cash_positions: () => pagedRows([{ owner_id: "user-1", opening_amount: 500 }]),
  net_worth_items: () => pagedRows([{ label: "ETF", amount: 1000, currency: "PLN" }]),
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
  plan_debt_terms: () => pagedRows([{ plan_id: "p1" }]),
  plan_transaction_links: () => pagedRows([{ id: "link-1", plan_id: "p1" }]),
  plan_progress_snapshots: () => pagedRows([{ id: "ps1", plan_id: "p1", saved_amount: 250 }]),
  group_members: () => pagedRows([{ group_id: "g1", user_id: "user-1" }]),
  recurring_occurrence_skips: () => pagedRows([{ id: "skip-1" }]),
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
    ruleRows = [{ id: "r1" }];
  });

  it("exports every page when a collection exceeds the Data API row cap", async () => {
    ruleRows = Array.from({ length: 1001 }, (_, index) => ({ id: `r${index}` }));
    const bundle = await buildAccountExport();
    expect(bundle.categorization_rules).toHaveLength(1001);
    expect(bundle.categorization_rules.at(-1)).toEqual({ id: "r1000" });
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
