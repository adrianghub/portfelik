import { supabase } from "$lib/supabase";
import { fetchCategories } from "$lib/services/categories";
import { fetchUserGroups } from "$lib/services/groups";
import { fetchPlansForExport } from "$lib/services/plans";
import { fetchAllTransactionsForExport } from "$lib/services/transactions";

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

  const [transactions, categories, plans, groups] = await Promise.all([
    fetchAllTransactionsForExport(),
    fetchCategories(),
    fetchPlansForExport(),
    fetchUserGroups(),
  ]);

  const { data: rules, error: rulesError } = await supabase
    .from("categorization_rules")
    .select("*")
    .order("priority", { ascending: false });
  if (rulesError) throw rulesError;

  const { data: accounts, error: accountsError } = await supabase
    .from("bank_accounts")
    .select("id, kind, label, archived_at, created_at, updated_at");
  if (accountsError) throw accountsError;

  const { data: sessions, error: sessionsError } = await supabase
    .from("transaction_import_sessions")
    .select(
      "id, status, adapter_kind, source_filename, rows_total, committed_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false });
  if (sessionsError) throw sessionsError;

  const { data: cashPositions, error: cashError } = await supabase
    .from("cash_positions")
    .select("id, owner_id, group_id, opening_amount, as_of_date, created_at, updated_at")
    .eq("owner_id", user.id);
  if (cashError) throw cashError;

  const { data: netWorthItems, error: netWorthError } = await supabase
    .from("net_worth_items")
    .select("id, user_id, label, amount, currency, position, created_at, updated_at")
    .eq("user_id", user.id)
    .order("position", { ascending: true });
  if (netWorthError) throw netWorthError;

  const groupIds = groups.map((g) => g.id);
  let groupMembers: unknown[] = [];
  if (groupIds.length > 0) {
    const { data, error } = await supabase
      .from("group_members")
      .select("group_id, user_id, role, joined_at")
      .in("group_id", groupIds);
    if (error) throw error;
    groupMembers = data ?? [];
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
    const [linksResult, debtTermsResult, progressSnapshotsResult] = await Promise.all([
      supabase
        .from("plan_transaction_links")
        .select("id, plan_id, transaction_id, created_by, created_at")
        .in("plan_id", planIds),
      supabase.from("plan_debt_terms").select("*").in("plan_id", planIds),
      supabase
        .from("plan_progress_snapshots")
        .select("id, plan_id, saved_amount, effective_date, note, created_by, created_at")
        .in("plan_id", planIds)
        .order("effective_date", { ascending: false }),
    ]);
    if (linksResult.error) throw linksResult.error;
    if (debtTermsResult.error) throw debtTermsResult.error;
    if (progressSnapshotsResult.error) throw progressSnapshotsResult.error;
    planTransactionLinks = linksResult.data ?? [];
    planDebtTerms = debtTermsResult.data ?? [];
    planProgressSnapshots = progressSnapshotsResult.data ?? [];
  }

  const { data: recurringSkips, error: recurringSkipsError } = await supabase
    .from("recurring_occurrence_skips")
    .select("id, user_id, group_id, recurring_template_id, occurrence_date, created_by, created_at")
    .order("occurrence_date", { ascending: false });
  if (recurringSkipsError) throw recurringSkipsError;

  return {
    export_contract: ACCOUNT_EXPORT_CONTRACT,
    exported_at: now.toISOString(),
    transactions,
    categories,
    categorization_rules: rules ?? [],
    plans,
    plan_transaction_links: planTransactionLinks,
    plan_debt_terms: planDebtTerms,
    plan_progress_snapshots: planProgressSnapshots,
    groups,
    group_members: groupMembers,
    bank_accounts: accounts ?? [],
    import_sessions: sessions ?? [],
    cash_positions: cashPositions ?? [],
    recurring_occurrence_skips: recurringSkips ?? [],
    net_worth_items: netWorthItems ?? [],
    financial_snapshot: snapshot ?? null,
    profile: profile ?? null,
  };
}

export function downloadAccountExport(bundle: AccountExportBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jakstoimy-export-${bundle.exported_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
