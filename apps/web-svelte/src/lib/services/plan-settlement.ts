import { currentCalendarMonthBounds } from "$lib/services/financial-surplus";
import {
  isSettlementStatus,
  isTransactionEligibleForPlanSettlement,
  resolveSettlementTypes,
  SETTLEMENT_STATUSES,
} from "$lib/services/plan-settlement-policy";
import {
  monthsBetween,
  monthsRemaining as planMonthsRemaining,
  todayIso,
} from "$lib/services/plans";
import { supabase } from "$lib/supabase";
import type { Plan, TransactionType, TransactionWithCategory } from "$lib/types";

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
  budgetAmount: number | null;
  targetAmount: number | null;
  spentAmount: number;
  incomeAmount: number;
  savedAmount: number;
  expenseCount: number;
  incomeCount: number;
  linkedCount: number;
  remaining: number | null;
  balance: number;
  eligibleCount: number;
  monthlyNeeded: number | null;
  monthlyActual: number | null;
  monthsRemaining: number | null;
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

async function fetchPlanForSettlement(planId: string): Promise<Plan> {
  const { data, error } = await supabase.from("plans").select("*").eq("id", planId).single();
  if (error) throw error;
  return data as Plan;
}

function planScopeKey(plan: Pick<Plan, "user_id" | "group_id">): string {
  return plan.group_id ? `g:${plan.group_id}` : `u:${plan.user_id}`;
}

async function fetchLinkedTransactionIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from("plan_transaction_links").select("transaction_id");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.transaction_id));
}

async function fetchBlockedTransactionIds(): Promise<Set<string>> {
  return fetchLinkedTransactionIds();
}

function filterEligibleTransactions(
  txs: TransactionWithCategory[],
  plan: Plan,
  blockedIds: Set<string>,
  opts?: { type?: TransactionType | "all" }
): TransactionWithCategory[] {
  const allowedTypes = resolveSettlementTypes(plan, opts);
  return txs.filter((tx) =>
    isTransactionEligibleForPlanSettlement({ plan, tx, blockedIds, allowedTypes })
  );
}

export async function fetchEligibleSettlementTransactions(
  planId: string,
  opts?: { type?: TransactionType | "all" },
  prefetched?: { plan?: Plan; blockedIds?: Set<string> }
): Promise<TransactionWithCategory[]> {
  const plan = prefetched?.plan ?? (await fetchPlanForSettlement(planId));
  let query = supabase
    .from("transactions_with_category")
    .select("*")
    .gte("date", plan.start_date)
    .lte("date", plan.end_date)
    .order("date", { ascending: false })
    .limit(200);

  const allowedTypes = resolveSettlementTypes(plan, opts);
  if (allowedTypes.length === 1) {
    query = query.eq("type", allowedTypes[0]);
  } else {
    query = query.in("type", allowedTypes);
  }
  query = query.in("status", [...SETTLEMENT_STATUSES]);

  if (plan.group_id) {
    query = query.eq("group_id", plan.group_id);
  } else {
    query = query.eq("user_id", plan.user_id).is("group_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;

  const blocked = prefetched?.blockedIds ?? (await fetchBlockedTransactionIds());
  return filterEligibleTransactions((data ?? []) as TransactionWithCategory[], plan, blocked, opts);
}

function extractKeywords(name: string): string[] {
  const stopWords = new Set([
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
    .split(/[\s\-–,./()]+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

export function rankPlanTransaction(
  plan: Pick<Plan, "category_id" | "name" | "budget_amount">,
  tx: TransactionWithCategory,
  spentAmount: number
): RankedTransaction {
  const reasons: RankedTransactionReason[] = [
    { key: "date_in_range", label: "", signal: "match" },
    { key: "not_linked", label: "", signal: "match" },
  ];
  let score = 25;

  if (plan.category_id && tx.category_id === plan.category_id) {
    score += 30;
    reasons.push({ key: "category", label: tx.category_name, signal: "match" });
  } else if (tx.category_name) {
    reasons.push({ key: "other_category", label: tx.category_name, signal: "warn" });
  }

  const matchedKeyword = extractKeywords(plan.name).find((kw) =>
    tx.description.toLowerCase().includes(kw)
  );
  if (matchedKeyword) {
    score += 25;
    reasons.push({ key: "keyword", label: matchedKeyword, signal: "match" });
  }

  const remaining =
    plan.budget_amount != null && plan.budget_amount > 0
      ? Math.max(0, plan.budget_amount - spentAmount)
      : null;
  if (tx.type === "expense" && remaining !== null && tx.amount <= remaining) {
    score += 20;
    reasons.push({ key: "amount", label: "", signal: "match" });
  }

  const rankPct = Math.min(100, Math.round(score));
  const rankLabel: "high" | "medium" | "low" =
    rankPct >= 75 ? "high" : rankPct >= 45 ? "medium" : "low";

  return { tx, score, rankPct, rankLabel, reasons };
}

export async function fetchRankedEligibleTransactions(
  planId: string,
  opts?: { type?: TransactionType | "all" }
): Promise<RankedTransaction[]> {
  const plan = await fetchPlanForSettlement(planId);
  const blockedIds = await fetchBlockedTransactionIds();
  const [eligible, linked] = await Promise.all([
    fetchEligibleSettlementTransactions(planId, opts, { plan, blockedIds }),
    fetchLinkedTransactions(planId),
  ]);
  const spentAmount = linked.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  return eligible
    .map((tx) => rankPlanTransaction(plan, tx, spentAmount))
    .sort((a, b) => b.score - a.score);
}

function sumLinkedIncomeInMonth(
  incomes: TransactionWithCategory[],
  monthStart: string,
  monthEnd: string
): number {
  return incomes
    .filter((t) => {
      const d = t.date.slice(0, 10);
      return d >= monthStart && d <= monthEnd;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

export function computeSaveMonthlyActual(input: {
  kind?: import("$lib/types").PlanKind;
  startDate?: string;
  savedAmount: number;
  linkedIncomes: TransactionWithCategory[];
  today?: string;
}): number | null {
  if (input.kind !== "save") return null;
  const today = input.today ?? todayIso();
  const bounds = currentCalendarMonthBounds(new Date(today));
  const currentMonthDeposits = sumLinkedIncomeInMonth(
    input.linkedIncomes,
    bounds.start,
    bounds.end
  );
  if (currentMonthDeposits > 0) return currentMonthDeposits;
  if (input.savedAmount <= 0) return 0;
  const elapsedMonths = input.startDate ? monthsBetween(input.startDate, today) : 1;
  return input.savedAmount / Math.max(1, elapsedMonths);
}

export function computePlanProgress(input: {
  planId: string;
  planName: string;
  kind?: import("$lib/types").PlanKind;
  budgetAmount: number | null;
  targetAmount?: number | null;
  startDate?: string;
  endDate?: string;
  linkedTransactions: TransactionWithCategory[];
  eligibleCount?: number;
  today?: string;
}): PlanSettlementProgress {
  const paidLinked = input.linkedTransactions.filter((t) => isSettlementStatus(t.status));
  const expenses = paidLinked.filter((t) => t.type === "expense");
  const incomes = paidLinked.filter((t) => t.type === "income");
  const spentAmount = expenses.reduce((s, t) => s + t.amount, 0);
  const incomeAmount = incomes.reduce((s, t) => s + t.amount, 0);
  const savedAmount = incomeAmount;
  const targetAmount = input.targetAmount ?? null;
  const remaining =
    input.budgetAmount != null && input.budgetAmount > 0
      ? Math.max(0, input.budgetAmount - spentAmount)
      : targetAmount != null && targetAmount > 0
        ? Math.max(0, targetAmount - savedAmount)
        : null;
  const monthsRem = input.endDate ? planMonthsRemaining(input.endDate) : null;
  const monthlyNeeded =
    targetAmount != null && targetAmount > 0 && monthsRem != null && monthsRem > 0
      ? Math.max(0, (targetAmount - savedAmount) / monthsRem)
      : null;
  const monthlyActual = computeSaveMonthlyActual({
    kind: input.kind,
    startDate: input.startDate,
    savedAmount,
    linkedIncomes: incomes,
    today: input.today,
  });
  return {
    planId: input.planId,
    planName: input.planName,
    budgetAmount: input.budgetAmount,
    targetAmount,
    spentAmount,
    incomeAmount,
    savedAmount,
    expenseCount: expenses.length,
    incomeCount: incomes.length,
    linkedCount: input.linkedTransactions.length,
    remaining,
    balance: incomeAmount - spentAmount,
    eligibleCount: input.eligibleCount ?? 0,
    monthlyNeeded,
    monthlyActual,
    monthsRemaining: monthsRem,
  };
}

async function fetchTransactionsByLinkedIds(
  links: { transaction_id: string }[]
): Promise<Map<string, TransactionWithCategory>> {
  const ids = [...new Set(links.map((l) => l.transaction_id))];
  const txById = new Map<string, TransactionWithCategory>();
  if (ids.length === 0) return txById;
  const { data, error } = await supabase
    .from("transactions_with_category")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  for (const tx of data ?? []) {
    if (tx.id) txById.set(tx.id, tx as TransactionWithCategory);
  }
  return txById;
}

export async function fetchDashboardPlanProgress(limit = 8): Promise<PlanSettlementProgress[]> {
  const { data: plans, error } = await supabase
    .from("plans")
    .select("*")
    .gte("end_date", new Date().toISOString().slice(0, 10))
    .order("start_date", { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!plans?.length) return [];

  const planIds = plans.map((p) => p.id);
  const [linksRes, eligibleCounts] = await Promise.all([
    supabase
      .from("plan_transaction_links")
      .select("plan_id, transaction_id")
      .in("plan_id", planIds),
    countEligibleForPlans(plans as Plan[]),
  ]);
  if (linksRes.error) throw linksRes.error;

  const links = linksRes.data ?? [];
  const txById = await fetchTransactionsByLinkedIds(links);

  return (plans as Plan[]).map((plan) => {
    const linkedTxs = links
      .filter((l) => l.plan_id === plan.id)
      .map((l) => txById.get(l.transaction_id))
      .filter((t): t is TransactionWithCategory => !!t);
    return computePlanProgress({
      planId: plan.id,
      planName: plan.name,
      kind: plan.kind,
      budgetAmount: plan.budget_amount,
      targetAmount: plan.target_amount,
      startDate: plan.start_date,
      endDate: plan.end_date,
      linkedTransactions: linkedTxs,
      eligibleCount: eligibleCounts[plan.id] ?? 0,
    });
  });
}

export async function fetchPlanProgressForPlans(
  planIds: string[]
): Promise<Record<string, PlanSettlementProgress>> {
  if (planIds.length === 0) return {};

  const [plansRes, linksRes] = await Promise.all([
    supabase.from("plans").select("*").in("id", planIds),
    supabase
      .from("plan_transaction_links")
      .select("plan_id, transaction_id")
      .in("plan_id", planIds),
  ]);

  if (plansRes.error) throw plansRes.error;
  if (linksRes.error) throw linksRes.error;

  const plans = (plansRes.data ?? []) as Plan[];
  const eligibleCounts = await countEligibleForPlans(plans);

  const links = linksRes.data ?? [];
  const txById = await fetchTransactionsByLinkedIds(links);
  const result: Record<string, PlanSettlementProgress> = {};

  for (const plan of plans) {
    const linkedTxs = links
      .filter((l) => l.plan_id === plan.id)
      .map((l) => txById.get(l.transaction_id))
      .filter((t): t is TransactionWithCategory => !!t);
    result[plan.id] = computePlanProgress({
      planId: plan.id,
      planName: plan.name,
      kind: plan.kind,
      budgetAmount: plan.budget_amount,
      targetAmount: plan.target_amount,
      startDate: plan.start_date,
      endDate: plan.end_date,
      linkedTransactions: linkedTxs,
      eligibleCount: eligibleCounts[plan.id] ?? 0,
    });
  }
  return result;
}

async function countEligibleForPlans(plans: Plan[]): Promise<Record<string, number>> {
  if (plans.length === 0) return {};

  const planIds = plans.map((p) => p.id);
  const linkedIds = await fetchLinkedTransactionIds();
  const counts: Record<string, number> = Object.fromEntries(planIds.map((id) => [id, 0]));

  const byScope = new Map<string, Plan[]>();
  for (const plan of plans) {
    const key = planScopeKey(plan);
    const group = byScope.get(key) ?? [];
    group.push(plan);
    byScope.set(key, group);
  }

  await Promise.all(
    [...byScope.entries()].map(async ([, scopePlans]) => {
      const sample = scopePlans[0];
      const minStart = scopePlans.reduce(
        (min, p) => (p.start_date < min ? p.start_date : min),
        scopePlans[0].start_date
      );
      const maxEnd = scopePlans.reduce(
        (max, p) => (p.end_date > max ? p.end_date : max),
        scopePlans[0].end_date
      );

      let query = supabase
        .from("transactions_with_category")
        .select("id, date, type, status")
        .gte("date", minStart)
        .lte("date", maxEnd)
        .in("status", [...SETTLEMENT_STATUSES])
        .limit(500);

      if (sample.group_id) {
        query = query.eq("group_id", sample.group_id);
      } else {
        query = query.eq("user_id", sample.user_id).is("group_id", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      const txs = (data ?? []) as Pick<
        TransactionWithCategory,
        "id" | "date" | "type" | "status"
      >[];

      for (const plan of scopePlans) {
        const allowedTypes = resolveSettlementTypes(plan);
        counts[plan.id] = txs.filter((tx) =>
          isTransactionEligibleForPlanSettlement({
            plan,
            tx,
            blockedIds: linkedIds,
            allowedTypes,
          })
        ).length;
      }
    })
  );

  return counts;
}

export async function countEligibleTransactionsByPlanIds(
  planIds: string[]
): Promise<Record<string, number>> {
  if (planIds.length === 0) return {};
  const { data, error } = await supabase.from("plans").select("*").in("id", planIds);
  if (error) throw error;
  return countEligibleForPlans((data ?? []) as Plan[]);
}
