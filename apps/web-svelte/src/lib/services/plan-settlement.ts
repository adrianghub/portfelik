import { supabase } from "$lib/supabase";
import type { TransactionWithCategory } from "$lib/types";

export interface PlanTransactionLink {
  id: string;
  plan_id: string;
  transaction_id: string;
  created_by: string;
  created_at: string;
}

export interface PlanSettlementProgress {
  planId: string;
  planName: string;
  plannedAmount: number | null;
  linkedAmount: number;
  linkedCount: number;
  remaining: number | null;
  eligibleCount: number;
}

export interface RankedTransactionReason {
  key: string;
  label: string;
  signal: "match" | "warn";
}

export interface RankedTransaction {
  tx: TransactionWithCategory;
  score: number;
  rankPct: number;
  rankLabel: "high" | "medium" | "low";
  reasons: RankedTransactionReason[];
}

export async function fetchPlanLinks(planId: string): Promise<PlanTransactionLink[]> {
  const { data, error } = await supabase
    .from("plan_transaction_links")
    .select("id, plan_id, transaction_id, created_by, created_at")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as PlanTransactionLink[];
}

export async function linkPlanTransaction(
  planId: string,
  transactionId: string
): Promise<PlanTransactionLink> {
  const { data, error } = await supabase.rpc("link_plan_transaction", {
    p_plan_id: planId,
    p_transaction_id: transactionId,
  });
  if (error) throw error;
  return data as PlanTransactionLink;
}

export async function unlinkPlanTransaction(planId: string, transactionId: string): Promise<void> {
  const { error } = await supabase.rpc("unlink_plan_transaction", {
    p_plan_id: planId,
    p_transaction_id: transactionId,
  });
  if (error) throw error;
}

export async function fetchLinkedTransactions(planId: string): Promise<TransactionWithCategory[]> {
  const links = await fetchPlanLinks(planId);
  if (links.length === 0) return [];
  const ids = links.map((l) => l.transaction_id);
  const { data, error } = await supabase
    .from("transactions_with_category")
    .select("*")
    .in("id", ids)
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TransactionWithCategory[];
}

export async function fetchEligibleSettlementTransactions(
  planId: string,
  opts?: { dateWindow?: "default" | "all"; start?: string; end?: string }
): Promise<TransactionWithCategory[]> {
  const { data: plan, error: planError } = await supabase
    .from("shopping_lists")
    .select("id, user_id, group_id, planned_for, category_id, total_amount")
    .eq("id", planId)
    .single();
  if (planError) throw planError;

  const dateWindow = opts?.dateWindow ?? "default";

  let query = supabase
    .from("transactions_with_category")
    .select("*")
    .eq("type", "expense")
    .order("date", { ascending: false })
    .limit(200);

  if (dateWindow === "default") {
    const start =
      opts?.start ??
      (() => {
        const d = new Date(plan.planned_for);
        d.setDate(d.getDate() - 30);
        return d.toISOString().slice(0, 10);
      })();
    const end =
      opts?.end ??
      (() => {
        const d = new Date(plan.planned_for);
        d.setDate(d.getDate() + 60);
        return d.toISOString().slice(0, 10);
      })();
    query = query.gte("date", start).lte("date", end);
  }

  if (plan.group_id) {
    query = query.eq("group_id", plan.group_id);
  } else {
    query = query.eq("user_id", plan.user_id);
  }

  const { data, error } = await query;
  if (error) throw error;

  const { data: linked, error: linkError } = await supabase
    .from("plan_transaction_links")
    .select("transaction_id")
    .neq("plan_id", planId);
  if (linkError) throw linkError;
  const blocked = new Set((linked ?? []).map((r) => r.transaction_id));

  return ((data ?? []) as TransactionWithCategory[]).filter((tx) => !blocked.has(tx.id));
}

function extractKeywords(name: string): string[] {
  const STOP_WORDS = new Set([
    "i",
    "w",
    "z",
    "na",
    "do",
    "za",
    "po",
    "od",
    "dla",
    "nie",
    "jak",
    "tak",
    "ze",
    "ten",
    "ta",
    "to",
    "te",
    "co",
    "się",
    "jest",
  ]);
  return name
    .toLowerCase()
    .split(/[\s\-–—,./()]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

export function rankPlanTransaction(
  plan: {
    category_id: string | null;
    planned_for: string;
    total_amount: number | null;
    name: string;
  },
  tx: TransactionWithCategory,
  linkedAmount: number
): RankedTransaction {
  const reasons: RankedTransactionReason[] = [];
  let score = 0;

  // Baseline: date in window (±30/+60 d) and not linked elsewhere — always true in eligible set
  score += 15 + 10;

  // Category match
  if (plan.category_id && tx.category_id === plan.category_id) {
    score += 30;
    reasons.push({ key: "category", label: tx.category_name, signal: "match" });
  } else if (tx.category_name) {
    reasons.push({ key: "other_category", label: tx.category_name, signal: "warn" });
  }

  // Keyword match: first matching keyword wins (capped at 25)
  const keywords = extractKeywords(plan.name);
  const desc = tx.description.toLowerCase();
  const matchedKeyword = keywords.find((kw) => desc.includes(kw));
  if (matchedKeyword) {
    score += 25;
    reasons.push({ key: "keyword", label: matchedKeyword, signal: "match" });
  }

  // Amount fits remaining budget
  const remaining =
    plan.total_amount != null && plan.total_amount > 0
      ? Math.max(0, plan.total_amount - linkedAmount)
      : null;
  if (remaining !== null && tx.amount <= remaining) {
    score += 20;
    reasons.push({ key: "amount", label: "", signal: "match" });
  }

  const rankPct = Math.round(score);
  const rankLabel: "high" | "medium" | "low" =
    rankPct >= 75 ? "high" : rankPct >= 45 ? "medium" : "low";

  return { tx, score, rankPct, rankLabel, reasons };
}

export async function fetchRankedEligibleTransactions(
  planId: string
): Promise<RankedTransaction[]> {
  const [eligible, linked, planRaw] = await Promise.all([
    fetchEligibleSettlementTransactions(planId),
    fetchLinkedTransactions(planId),
    supabase
      .from("shopping_lists")
      .select("id, name, category_id, planned_for, total_amount")
      .eq("id", planId)
      .single(),
  ]);

  if (planRaw.error) throw planRaw.error;
  const plan = planRaw.data;
  const linkedAmount = linked.reduce((s, t) => s + t.amount, 0);

  return eligible
    .map((tx) => rankPlanTransaction(plan, tx, linkedAmount))
    .sort((a, b) => b.score - a.score);
}

export function computePlanProgress(input: {
  planId: string;
  planName: string;
  plannedAmount: number | null;
  linkedTransactions: TransactionWithCategory[];
  eligibleCount?: number;
}): PlanSettlementProgress {
  const linkedAmount = input.linkedTransactions.reduce((s, t) => s + t.amount, 0);
  const remaining =
    input.plannedAmount != null && input.plannedAmount > 0
      ? Math.max(0, input.plannedAmount - linkedAmount)
      : null;
  return {
    planId: input.planId,
    planName: input.planName,
    plannedAmount: input.plannedAmount,
    linkedAmount,
    linkedCount: input.linkedTransactions.length,
    remaining,
    eligibleCount: input.eligibleCount ?? 0,
  };
}

/** Dashboard widget: top N active plans with linked amounts + eligible counts. */
export async function fetchDashboardPlanProgress(limit = 8): Promise<PlanSettlementProgress[]> {
  const { data: plans, error } = await supabase
    .from("shopping_lists")
    .select("id, name, total_amount, completed_at, planned_for")
    .is("completed_at", null)
    .order("planned_for", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!plans?.length) return [];

  const planIds = plans.map((p) => p.id);

  const [linksRes, eligibleCountsRes] = await Promise.all([
    supabase
      .from("plan_transaction_links")
      .select("plan_id, transaction_id")
      .in("plan_id", planIds),
    _batchEligibleCounts(planIds),
  ]);

  if (linksRes.error) throw linksRes.error;
  const links = linksRes.data ?? [];

  const txIds = [...new Set(links.map((l) => l.transaction_id))];
  const txById = new Map<string, TransactionWithCategory>();
  if (txIds.length > 0) {
    const { data: txs, error: txError } = await supabase
      .from("transactions_with_category")
      .select("*")
      .in("id", txIds);
    if (txError) throw txError;
    for (const t of txs ?? []) {
      if (t.id) txById.set(t.id, t as TransactionWithCategory);
    }
  }

  return plans.map((plan) => {
    const linkedTxs = links
      .filter((l) => l.plan_id === plan.id)
      .map((l) => txById.get(l.transaction_id))
      .filter((t): t is TransactionWithCategory => !!t);
    return computePlanProgress({
      planId: plan.id,
      planName: plan.name,
      plannedAmount: plan.total_amount,
      linkedTransactions: linkedTxs,
      eligibleCount: eligibleCountsRes[plan.id] ?? 0,
    });
  });
}

/** List page: fetch linked amounts + eligible counts for an explicit set of planIds. */
export async function fetchPlanProgressForPlans(
  planIds: string[]
): Promise<Record<string, PlanSettlementProgress>> {
  if (planIds.length === 0) return {};

  const [plansRes, linksRes] = await Promise.all([
    supabase.from("shopping_lists").select("id, name, total_amount, planned_for").in("id", planIds),
    supabase
      .from("plan_transaction_links")
      .select("plan_id, transaction_id")
      .in("plan_id", planIds),
  ]);

  if (plansRes.error) throw plansRes.error;
  if (linksRes.error) throw linksRes.error;

  const plans = plansRes.data ?? [];
  const links = linksRes.data ?? [];

  const txIds = [...new Set(links.map((l) => l.transaction_id))];
  const txById = new Map<string, TransactionWithCategory>();
  if (txIds.length > 0) {
    const { data: txs, error: txError } = await supabase
      .from("transactions_with_category")
      .select("*")
      .in("id", txIds);
    if (txError) throw txError;
    for (const t of txs ?? []) {
      if (t.id) txById.set(t.id, t as TransactionWithCategory);
    }
  }

  const eligibleCounts = await _batchEligibleCounts(planIds);

  const result: Record<string, PlanSettlementProgress> = {};
  for (const plan of plans) {
    const linkedTxs = links
      .filter((l) => l.plan_id === plan.id)
      .map((l) => txById.get(l.transaction_id))
      .filter((t): t is TransactionWithCategory => !!t);
    result[plan.id] = computePlanProgress({
      planId: plan.id,
      planName: plan.name,
      plannedAmount: plan.total_amount,
      linkedTransactions: linkedTxs,
      eligibleCount: eligibleCounts[plan.id] ?? 0,
    });
  }
  return result;
}

/**
 * Batch-count eligible transactions per plan.
 * Delegates to fetchEligibleSettlementTransactions so scope/date/link rules stay identical.
 */
export async function countEligibleTransactionsByPlanIds(
  planIds: string[]
): Promise<Record<string, number>> {
  if (planIds.length === 0) return {};

  const pairs = await Promise.all(
    planIds.map(async (planId) => {
      const txs = await fetchEligibleSettlementTransactions(planId);
      return [planId, txs.length] as const;
    })
  );
  return Object.fromEntries(pairs);
}

/** @internal Alias for callers inside this module. */
const _batchEligibleCounts = countEligibleTransactionsByPlanIds;
