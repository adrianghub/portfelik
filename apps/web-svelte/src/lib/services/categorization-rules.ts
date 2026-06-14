// Service layer for user-owned categorization rules.
//
// These deterministic rules pre-fill a category for bank-import rows (see
// import/categorize.ts) and are the foundation for later AI-assisted
// suggestions. The categorization_rules table is fully RLS-owned: read /
// insert / update / delete are scoped to the caller; user_id is NOT in the
// UPDATE grant, so it cannot be reassigned. PostgREST does not auto-fill
// user_id on insert - pass it explicitly.

import { supabase } from "$lib/supabase";
import { findDuplicateCategorizationRule, selectRetroMatches } from "$lib/import/categorize";
import { fetchCategories } from "$lib/services/categories";
import { fetchAllTransactionsForExport } from "$lib/services/transactions";
import type { CategorizationRule, CategorizationRuleKind, TransactionType } from "$lib/types";

export interface CategorizationRuleInput {
  kind: CategorizationRuleKind;
  match_description?: string | null;
  match_counterparty?: string | null;
  match_type?: TransactionType | null;
  match_day_of_month?: number | null;
  category_id: string;
  priority?: number;
}

export async function fetchCategorizationRules(): Promise<CategorizationRule[]> {
  const { data, error } = await supabase
    .from("categorization_rules")
    .select("*")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as CategorizationRule[];
}

export async function createCategorizationRule(
  input: CategorizationRuleInput
): Promise<CategorizationRule> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) throw userError ?? new Error("not_authenticated");

  const existingRules = await fetchCategorizationRules();
  const candidate = {
    kind: input.kind,
    match_description: input.match_description ?? null,
    match_counterparty: input.match_counterparty ?? null,
    match_type: input.match_type ?? null,
    match_day_of_month: input.match_day_of_month ?? null,
    category_id: input.category_id,
  };
  if (findDuplicateCategorizationRule(existingRules, candidate)) {
    throw new Error("duplicate_categorization_rule");
  }

  const { data, error } = await supabase
    .from("categorization_rules")
    .insert({
      user_id: user.id,
      kind: input.kind,
      match_description: input.match_description ?? null,
      match_counterparty: input.match_counterparty ?? null,
      match_type: input.match_type ?? null,
      match_day_of_month: input.match_day_of_month ?? null,
      category_id: input.category_id,
      priority: input.priority ?? 0,
    })
    .select()
    .single();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      throw new Error("duplicate_categorization_rule");
    }
    throw error;
  }
  return data as CategorizationRule;
}

export async function updateCategorizationRule(
  id: string,
  patch: Partial<CategorizationRuleInput>
): Promise<CategorizationRule> {
  const { data, error } = await supabase
    .from("categorization_rules")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CategorizationRule;
}

export async function deleteCategorizationRule(id: string): Promise<void> {
  const { error } = await supabase.from("categorization_rules").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Ids of the caller's own already-committed transactions a freshly-created rule would
 * re-categorize (retroactive apply). Scoped to own transactions to avoid touching
 * co-owned group rows; the bulk update goes through `updateTransactionsCategory`.
 */
export async function findRetroMatchIds(rule: CategorizationRule): Promise<string[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const [transactions, categories] = await Promise.all([
    fetchAllTransactionsForExport(),
    fetchCategories(),
  ]);
  return selectRetroMatches(rule, transactions, categories, user.id);
}
