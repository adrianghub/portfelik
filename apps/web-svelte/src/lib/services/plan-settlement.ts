import { currentCalendarMonthBounds } from "$lib/services/financial-surplus";
import {
  isSettlementStatus,
  isTransactionEligibleForPlanSettlement,
  resolveSettlementTypes,
  SETTLEMENT_STATUSES,
} from "$lib/services/plan-settlement-policy";
import {
  derivePlanBucket,
  monthsBetween,
  monthsRemaining as planMonthsRemaining,
  todayIso,
} from "$lib/services/plans";
import { supabase } from "$lib/supabase";
import { suggestRuleText } from "$lib/import/categorize";
import type { Plan, PlanKind, TransactionType, TransactionWithCategory } from "$lib/types";

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
  kind: PlanKind;
  /** Plan start date (debt disbursement anchor for the amortization schedule). */
  startDate: string | null;
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
  monthlyActualBasis: SavePaceBasis;
  /** Sum of paid linked EXPENSE transactions dated in the current calendar month
      (debt-payment coverage actually present in this month's tracked expenses). */
  linkedExpenseCurrentMonth: number;
  /** Sum of paid linked INCOME transactions dated in the current calendar month
      (save-goal deposits already made this month - credited against the monthly
      pace so a deposit is never counted as both an expense and an unmet goal). */
  linkedIncomeCurrentMonth: number;
  /** Paid linked expense payments (amount + date) — lets hub/net-worth surfaces run the
      same flat-accrual debt balance as the plan detail instead of a stored-balance
      heuristic. */
  linkedExpenses: { amount: number; date: string }[];
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

export async function fetchDismissedTransactionIds(planId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("plan_settlement_dismissals")
    .select("transaction_id")
    .eq("plan_id", planId);
  if (error) throw error;
  return (data ?? []).map((r) => r.transaction_id as string);
}

export async function dismissPlanSuggestion(planId: string, transactionId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { error } = await supabase
    .from("plan_settlement_dismissals")
    .upsert(
      { plan_id: planId, transaction_id: transactionId, dismissed_by: user.id },
      { onConflict: "plan_id,transaction_id", ignoreDuplicates: true }
    );
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

/** Suggestions below this rank are hidden entirely - baseline-only rows carry no real signal. */
export const MIN_SUGGESTION_RANK_PCT = 45;

// A stable similarity key for "the user already rejected things like this on this plan".
// Counterparty-preferred token (same extractor the import rules use) so repeated dismissals
// of e.g. "Żabka" suppress future Żabka rows without touching unrelated candidates.
function dismissalKey(tx: {
  type: TransactionType;
  description: string;
  counterparty: string | null;
}): string {
  return suggestRuleText({
    type: tx.type,
    description: tx.description,
    counterparty: tx.counterparty,
  }).toLowerCase();
}

export function rankPlanTransaction(
  plan: Pick<Plan, "category_id" | "name" | "budget_amount" | "kind" | "target_amount">,
  tx: TransactionWithCategory,
  spentAmount: number,
  opts?: { savedAmount?: number; today?: string; dismissedKeys?: ReadonlySet<string> }
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
  } else if (tx.type === "income" && (plan.kind ?? "spend") === "save") {
    // Income on save plans previously had no path past the baseline, so every deposit
    // showed as a weak match. A deposit that fits the remaining target is a real signal.
    const targetRemaining =
      plan.target_amount != null && plan.target_amount > 0
        ? Math.max(0, plan.target_amount - (opts?.savedAmount ?? 0))
        : null;
    if (targetRemaining !== null && tx.amount > 0 && tx.amount <= targetRemaining) {
      score += 20;
      reasons.push({ key: "amount", label: "", signal: "match" });
    }
  }

  const today = opts?.today ?? todayIso();
  const txDate = tx.date.slice(0, 10);
  const ageDays = (Date.parse(today) - Date.parse(txDate)) / 86_400_000;
  if (ageDays >= 0 && ageDays <= 30) {
    score += 10;
    reasons.push({ key: "recent", label: "", signal: "match" });
  }

  // Settlement memory: a candidate similar to one the user already dismissed on this plan
  // is penalised below the visibility cutoff, so the same rejected merchant stops resurfacing.
  if (opts?.dismissedKeys && opts.dismissedKeys.size > 0) {
    const key = dismissalKey(tx);
    if (key !== "" && opts.dismissedKeys.has(key)) {
      score -= 40;
      reasons.push({ key: "dismissed_similar", label: "", signal: "warn" });
    }
  }

  const rankPct = Math.min(100, Math.round(score));
  const rankLabel: "high" | "medium" | "low" =
    rankPct >= 75 ? "high" : rankPct >= MIN_SUGGESTION_RANK_PCT ? "medium" : "low";

  return { tx, score, rankPct, rankLabel, reasons };
}

/** Count suggestions that would appear on the settle screen (rank ≥ cutoff, not dismissed). */
export function countRankedSuggestions(
  plan: Pick<Plan, "category_id" | "name" | "budget_amount" | "kind" | "target_amount">,
  eligible: TransactionWithCategory[],
  linkedTransactions: TransactionWithCategory[],
  dismissedIds: ReadonlySet<string> = new Set()
): number {
  const spentAmount = linkedTransactions
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);
  const savedAmount = linkedTransactions
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  return eligible
    .filter((tx) => !dismissedIds.has(tx.id))
    .map((tx) => rankPlanTransaction(plan, tx, spentAmount, { savedAmount }))
    .filter((r) => r.rankPct >= MIN_SUGGESTION_RANK_PCT).length;
}

export async function fetchSuggestionCount(planId: string): Promise<number> {
  const plan = await fetchPlanForSettlement(planId);
  const blockedIds = await fetchBlockedTransactionIds();
  const [eligible, linked, dismissed] = await Promise.all([
    fetchEligibleSettlementTransactions(planId, undefined, { plan, blockedIds }),
    fetchLinkedTransactions(planId),
    fetchDismissedTransactionIds(planId),
  ]);
  return countRankedSuggestions(plan, eligible, linked, new Set(dismissed));
}

/** Similarity keys of transactions previously dismissed on this plan (settlement memory). */
async function fetchDismissedKeys(planId: string): Promise<Set<string>> {
  const ids = await fetchDismissedTransactionIds(planId);
  if (ids.length === 0) return new Set();
  const { data, error } = await supabase
    .from("transactions_with_category")
    .select("type, description, counterparty")
    .in("id", ids);
  if (error) throw error;
  const keys = new Set<string>();
  for (const t of (data ?? []) as Pick<
    TransactionWithCategory,
    "type" | "description" | "counterparty"
  >[]) {
    const key = dismissalKey(t);
    if (key !== "") keys.add(key);
  }
  return keys;
}

export async function fetchRankedEligibleTransactions(
  planId: string,
  opts?: { type?: TransactionType | "all" }
): Promise<RankedTransaction[]> {
  const plan = await fetchPlanForSettlement(planId);
  const blockedIds = await fetchBlockedTransactionIds();
  const [eligible, linked, dismissedKeys] = await Promise.all([
    fetchEligibleSettlementTransactions(planId, opts, { plan, blockedIds }),
    fetchLinkedTransactions(planId),
    fetchDismissedKeys(planId),
  ]);
  const spentAmount = linked.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const savedAmount = linked.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);

  return eligible
    .map((tx) => rankPlanTransaction(plan, tx, spentAmount, { savedAmount, dismissedKeys }))
    .filter((r) => r.rankPct >= MIN_SUGGESTION_RANK_PCT)
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

export type SavePaceBasis = "none" | "current-month" | "historical-average";

export interface SaveMonthlyActualDetail {
  /** null when the plan is not a save plan. */
  amount: number | null;
  /**
   * How `amount` was derived:
   * - "current-month": real deposits linked this calendar month (demonstrated pace),
   * - "historical-average": savedAmount averaged over elapsed months (an estimate - a single
   *   upfront lump sum inflates this and must not be presented as sustained ongoing pace),
   * - "none": not a save plan, not active, or nothing saved yet.
   */
  basis: SavePaceBasis;
}

export function computeSaveMonthlyActualDetail(input: {
  kind?: import("$lib/types").PlanKind;
  startDate?: string;
  endDate?: string;
  savedAmount: number;
  linkedIncomes: TransactionWithCategory[];
  today?: string;
}): SaveMonthlyActualDetail {
  if (input.kind !== "save") return { amount: null, basis: "none" };
  const today = input.today ?? todayIso();
  if (
    input.startDate &&
    input.endDate &&
    derivePlanBucket({ start_date: input.startDate, end_date: input.endDate }, today) !== "active"
  ) {
    return { amount: 0, basis: "none" };
  }
  const bounds = currentCalendarMonthBounds(new Date(today));
  const currentMonthDeposits = sumLinkedIncomeInMonth(
    input.linkedIncomes,
    bounds.start,
    bounds.end
  );
  if (currentMonthDeposits > 0) return { amount: currentMonthDeposits, basis: "current-month" };
  if (input.savedAmount <= 0) return { amount: 0, basis: "none" };
  const elapsedMonths = input.startDate ? monthsBetween(input.startDate, today) : 1;
  return {
    amount: input.savedAmount / Math.max(1, elapsedMonths),
    basis: "historical-average",
  };
}

export function computeSaveMonthlyActual(input: {
  kind?: import("$lib/types").PlanKind;
  startDate?: string;
  endDate?: string;
  savedAmount: number;
  linkedIncomes: TransactionWithCategory[];
  today?: string;
}): number | null {
  return computeSaveMonthlyActualDetail(input).amount;
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
  const today = input.today ?? todayIso();
  const paidLinked = input.linkedTransactions.filter((t) => isSettlementStatus(t.status));
  const expenses = paidLinked.filter((t) => t.type === "expense");
  const incomes = paidLinked.filter((t) => t.type === "income");
  const spentAmount = expenses.reduce((s, t) => s + t.amount, 0);
  const incomeAmount = incomes.reduce((s, t) => s + t.amount, 0);
  const monthBounds = currentCalendarMonthBounds(new Date(today));
  const inCurrentMonth = (t: TransactionWithCategory) => {
    const d = t.date.slice(0, 10);
    return d >= monthBounds.start && d <= monthBounds.end;
  };
  const linkedExpenseCurrentMonth = expenses
    .filter(inCurrentMonth)
    .reduce((sum, t) => sum + t.amount, 0);
  const linkedIncomeCurrentMonth = incomes
    .filter(inCurrentMonth)
    .reduce((sum, t) => sum + t.amount, 0);
  const savedAmount = incomeAmount;
  const targetAmount = input.targetAmount ?? null;
  const remaining =
    input.budgetAmount != null && input.budgetAmount > 0
      ? Math.max(0, input.budgetAmount - spentAmount)
      : targetAmount != null && targetAmount > 0
        ? Math.max(0, targetAmount - savedAmount)
        : null;
  const monthsRem = input.endDate ? planMonthsRemaining(input.endDate) : null;
  const isActive =
    input.startDate && input.endDate
      ? derivePlanBucket({ start_date: input.startDate, end_date: input.endDate }, today) ===
        "active"
      : true;
  const monthlyNeeded =
    isActive && targetAmount != null && targetAmount > 0 && monthsRem != null && monthsRem > 0
      ? Math.max(0, (targetAmount - savedAmount) / monthsRem)
      : null;
  const monthlyActualDetail = computeSaveMonthlyActualDetail({
    kind: input.kind,
    startDate: input.startDate,
    endDate: input.endDate,
    savedAmount,
    linkedIncomes: incomes,
    today,
  });
  const monthlyActual = monthlyActualDetail.amount;
  return {
    planId: input.planId,
    planName: input.planName,
    kind: input.kind ?? "spend",
    startDate: input.startDate ?? null,
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
    monthlyActualBasis: monthlyActualDetail.basis,
    linkedExpenseCurrentMonth,
    linkedIncomeCurrentMonth,
    linkedExpenses: expenses.map((t) => ({ amount: t.amount, date: t.date })),
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
  const [linkedIds, linksRes, dismissRes] = await Promise.all([
    fetchLinkedTransactionIds(),
    supabase
      .from("plan_transaction_links")
      .select("plan_id, transaction_id")
      .in("plan_id", planIds),
    supabase
      .from("plan_settlement_dismissals")
      .select("plan_id, transaction_id")
      .in("plan_id", planIds),
  ]);
  if (linksRes.error) throw linksRes.error;
  if (dismissRes.error) throw dismissRes.error;

  const links = linksRes.data ?? [];
  const txById = await fetchTransactionsByLinkedIds(links);
  const dismissedByPlan = new Map<string, Set<string>>();
  for (const row of dismissRes.data ?? []) {
    const set = dismissedByPlan.get(row.plan_id) ?? new Set();
    set.add(row.transaction_id);
    dismissedByPlan.set(row.plan_id, set);
  }

  const linkedByPlan = new Map<string, TransactionWithCategory[]>();
  for (const planId of planIds) linkedByPlan.set(planId, []);
  for (const link of links) {
    const tx = txById.get(link.transaction_id);
    if (tx) linkedByPlan.get(link.plan_id)?.push(tx);
  }

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
        .select("*")
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
      const txs = (data ?? []) as TransactionWithCategory[];

      for (const plan of scopePlans) {
        const allowedTypes = resolveSettlementTypes(plan);
        const eligible = txs.filter((tx) =>
          isTransactionEligibleForPlanSettlement({
            plan,
            tx,
            blockedIds: linkedIds,
            allowedTypes,
          })
        );
        counts[plan.id] = countRankedSuggestions(
          plan,
          eligible,
          linkedByPlan.get(plan.id) ?? [],
          dismissedByPlan.get(plan.id) ?? new Set()
        );
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
