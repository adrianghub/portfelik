import { supabase } from "$lib/supabase";
import { fetchAllTransactionsForExport } from "$lib/services/transactions";
import { saveTextFile } from "$lib/services/save-text-file";
import { chunksOf, fetchAllPages } from "$lib/services/fetch-all-pages";

/**
 * Informational account dump — not a round-trip restore format.
 * Includes user-owned ledger + balance-sheet basics; omits notifications,
 * push subscriptions, dismissals, invite tokens, and raw import row payloads.
 */
export const ACCOUNT_EXPORT_CONTRACT = "informational_v1" as const;

type ExportInventoryEntry =
  | { disposition: "exported"; field: string; note?: string }
  | { disposition: "omitted" | "ephemeral"; reason: string };

/**
 * Exhaustive classification of app-owned public tables. The unit suite derives
 * the final table set from migrations and fails when a new table is not listed.
 */
export const ACCOUNT_EXPORT_TABLE_INVENTORY = {
  profiles: { disposition: "exported", field: "profile" },
  user_groups: { disposition: "exported", field: "groups" },
  group_members: { disposition: "exported", field: "group_members" },
  group_invitations: { disposition: "omitted", reason: "Pending access workflow, not finance" },
  categories: { disposition: "exported", field: "categories" },
  transactions: { disposition: "exported", field: "transactions" },
  notifications: { disposition: "ephemeral", reason: "Delivery inbox, not financial truth" },
  push_subscriptions: { disposition: "omitted", reason: "Device secret and delivery metadata" },
  bank_accounts: { disposition: "exported", field: "bank_accounts" },
  transaction_import_sessions: { disposition: "exported", field: "import_sessions" },
  transaction_import_rows: { disposition: "omitted", reason: "Raw statement review payload" },
  transaction_import_links: {
    disposition: "omitted",
    reason: "Internal deduplication hashes and bank provenance",
  },
  categorization_rules: { disposition: "exported", field: "categorization_rules" },
  plan_transaction_links: { disposition: "exported", field: "plan_transaction_links" },
  plans: { disposition: "exported", field: "plans" },
  plan_debt_terms: { disposition: "exported", field: "plan_debt_terms" },
  financial_snapshots: { disposition: "exported", field: "financial_snapshot" },
  plan_settlement_dismissals: {
    disposition: "ephemeral",
    reason: "Suggestion preference, not plan progress",
  },
  cash_positions: {
    disposition: "exported",
    field: "cash_positions",
    note: "Private owner rows only; unsupported group cash is intentionally excluded",
  },
  net_worth_items: { disposition: "exported", field: "net_worth_items" },
  action_dismissals: { disposition: "ephemeral", reason: "Attention preference" },
  recurring_occurrence_skips: { disposition: "exported", field: "recurring_occurrence_skips" },
  group_invitation_tokens: { disposition: "omitted", reason: "Hashed access token workflow" },
  group_invitation_access_attempts: {
    disposition: "ephemeral",
    reason: "Security rate-limit telemetry",
  },
  plan_progress_snapshots: { disposition: "exported", field: "plan_progress_snapshots" },
} as const satisfies Record<string, ExportInventoryEntry>;

export interface AccountExportBundle {
  export_contract: typeof ACCOUNT_EXPORT_CONTRACT;
  exported_at: string;
  transactions: unknown[];
  categories: unknown[];
  categorization_rules: unknown[];
  plans: unknown[];
  plan_transaction_links: unknown[];
  plan_debt_terms: unknown[];
  plan_progress_snapshots: unknown[];
  groups: unknown[];
  group_members: unknown[];
  bank_accounts: unknown[];
  import_sessions: unknown[];
  cash_positions: unknown[];
  recurring_occurrence_skips: unknown[];
  net_worth_items: unknown[];
  financial_snapshot: unknown | null;
  profile: unknown | null;
}

export async function buildAccountExport(): Promise<AccountExportBundle> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const now = new Date();

  const [
    transactions,
    categories,
    plans,
    groups,
    rules,
    accounts,
    sessions,
    cashPositions,
    netWorthItems,
  ] = await Promise.all([
    fetchAllTransactionsForExport(),
    fetchAllPages((from, to) =>
      supabase
        .from("categories")
        .select("id, name, type, user_id, cap_amount, cap_period, created_at, updated_at")
        .eq("user_id", user.id)
        .order("name")
        .order("id")
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("plans")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase.from("user_groups").select("*").order("name").order("id").range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("categorization_rules")
        .select("*")
        .order("priority", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("bank_accounts")
        .select("id, kind, label, archived_at, created_at, updated_at")
        .order("id")
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("transaction_import_sessions")
        .select("id, status, adapter_kind, source_filename, rows_total, committed_at, created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("cash_positions")
        .select("id, owner_id, group_id, opening_amount, as_of_date, created_at, updated_at")
        .eq("owner_id", user.id)
        .order("id")
        .range(from, to)
    ),
    fetchAllPages((from, to) =>
      supabase
        .from("net_worth_items")
        .select("id, user_id, label, amount, currency, position, is_demo, created_at, updated_at")
        .eq("user_id", user.id)
        .order("position", { ascending: true })
        .order("id")
        .range(from, to)
    ),
  ]);

  const groupIds = groups.map((g) => g.id);
  let groupMembers: unknown[] = [];
  if (groupIds.length > 0) {
    groupMembers = (
      await Promise.all(
        chunksOf(groupIds).map((ids) =>
          fetchAllPages((from, to) =>
            supabase
              .from("group_members")
              .select("group_id, user_id, role, joined_at")
              .in("group_id", ids)
              .order("group_id")
              .order("user_id")
              .range(from, to)
          )
        )
      )
    ).flat();
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, name, settings, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const { data: snapshot, error: snapshotError } = await supabase
    .from("financial_snapshots")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (snapshotError) throw snapshotError;

  const planIds = (plans as { id: string }[]).map((p) => p.id);
  let planTransactionLinks: unknown[] = [];
  let planDebtTerms: unknown[] = [];
  let planProgressSnapshots: unknown[] = [];
  if (planIds.length > 0) {
    const perPlanChunk = await Promise.all(
      chunksOf(planIds).map(async (ids) => {
        const [links, debtTerms, progressSnapshots] = await Promise.all([
          fetchAllPages((from, to) =>
            supabase
              .from("plan_transaction_links")
              .select("id, plan_id, transaction_id, created_by, created_at")
              .in("plan_id", ids)
              .order("id")
              .range(from, to)
          ),
          fetchAllPages((from, to) =>
            supabase
              .from("plan_debt_terms")
              .select("*")
              .in("plan_id", ids)
              .order("plan_id")
              .range(from, to)
          ),
          fetchAllPages((from, to) =>
            supabase
              .from("plan_progress_snapshots")
              .select("id, plan_id, saved_amount, effective_date, note, created_by, created_at")
              .in("plan_id", ids)
              .order("effective_date", { ascending: false })
              .order("id")
              .range(from, to)
          ),
        ]);
        return { links, debtTerms, progressSnapshots };
      })
    );
    planTransactionLinks = perPlanChunk.flatMap((result) => result.links);
    planDebtTerms = perPlanChunk.flatMap((result) => result.debtTerms);
    planProgressSnapshots = perPlanChunk.flatMap((result) => result.progressSnapshots);
  }

  const recurringSkips = await fetchAllPages((from, to) =>
    supabase
      .from("recurring_occurrence_skips")
      .select(
        "id, user_id, group_id, recurring_template_id, occurrence_date, created_by, created_at"
      )
      .order("occurrence_date", { ascending: false })
      .order("id")
      .range(from, to)
  );

  return {
    export_contract: ACCOUNT_EXPORT_CONTRACT,
    exported_at: now.toISOString(),
    transactions,
    categories,
    categorization_rules: rules,
    plans,
    plan_transaction_links: planTransactionLinks,
    plan_debt_terms: planDebtTerms,
    plan_progress_snapshots: planProgressSnapshots,
    groups,
    group_members: groupMembers,
    bank_accounts: accounts,
    import_sessions: sessions,
    cash_positions: cashPositions,
    recurring_occurrence_skips: recurringSkips,
    net_worth_items: netWorthItems,
    financial_snapshot: snapshot ?? null,
    profile: profile ?? null,
  };
}

export async function downloadAccountExport(bundle: AccountExportBundle): Promise<boolean> {
  return saveTextFile(
    `jakstoimy-export-${bundle.exported_at.slice(0, 10)}.json`,
    JSON.stringify(bundle, null, 2),
    "application/json;charset=utf-8"
  );
}
