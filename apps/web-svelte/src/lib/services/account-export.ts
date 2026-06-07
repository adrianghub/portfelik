import { supabase } from "$lib/supabase";
import { fetchCategories } from "$lib/services/categories";
import { fetchUserGroups } from "$lib/services/groups";
import { fetchPlansForExport } from "$lib/services/plans";
import { fetchAllTransactionsForExport } from "$lib/services/transactions";

export interface AccountExportBundle {
  exported_at: string;
  transactions: unknown[];
  categories: unknown[];
  categorization_rules: unknown[];
  plans: unknown[];
  plan_debt_terms: unknown[];
  groups: unknown[];
  group_members: unknown[];
  bank_accounts: unknown[];
  import_sessions: unknown[];
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
      "id, status, adapter_kind, source_filename, row_count, committed_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false });
  if (sessionsError) throw sessionsError;

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
  let planDebtTerms: unknown[] = [];
  if (planIds.length > 0) {
    const { data, error } = await supabase
      .from("plan_debt_terms")
      .select("*")
      .in("plan_id", planIds);
    if (error) throw error;
    planDebtTerms = data ?? [];
  }

  return {
    exported_at: now.toISOString(),
    transactions,
    categories,
    categorization_rules: rules ?? [],
    plans,
    plan_debt_terms: planDebtTerms,
    groups,
    group_members: groupMembers,
    bank_accounts: accounts ?? [],
    import_sessions: sessions ?? [],
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
  a.download = `portfelik-export-${bundle.exported_at.slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
