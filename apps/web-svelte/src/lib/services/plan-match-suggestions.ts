import type { PlanKind, TransactionWithCategory } from "$lib/types";
import {
  fetchDashboardPlanProgress,
  fetchDismissedTransactionIds,
  fetchRankedEligibleTransactions,
  type RankedTransaction,
} from "$lib/services/plan-settlement";
import type { ScopeFilter } from "$lib/utils/list-view-url";

export const DASHBOARD_PLAN_MATCH_LIMIT = 2;
export const PLAN_DETAIL_MATCH_LIMIT = 2;

const RANK_ORDER: Record<RankedTransaction["rankLabel"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export interface RankedPlanBucket {
  planId: string;
  planName: string;
  kind: PlanKind;
  groupId: string | null;
  ranked: RankedTransaction[];
}

export interface PlanMatchSuggestion {
  planId: string;
  planName: string;
  kind: PlanKind;
  groupId: string | null;
  tx: TransactionWithCategory;
  score: number;
}

function passesMinRank(
  label: RankedTransaction["rankLabel"],
  minRank: RankedTransaction["rankLabel"]
): boolean {
  return RANK_ORDER[label] <= RANK_ORDER[minRank];
}

export function planMatchesGroupFilter(
  plan: { groupId: string | null },
  groupFilter: ScopeFilter
): boolean {
  if (groupFilter === "all") return true;
  if (groupFilter === "own") return plan.groupId === null;
  return plan.groupId === groupFilter;
}

/** Highest-scoring settlement candidates, capped so Kokpit stays a short list. */
export function pickTopPlanMatches(
  plans: readonly RankedPlanBucket[],
  opts?: {
    limit?: number;
    maxPerPlan?: number;
    minRank?: RankedTransaction["rankLabel"];
    excludeTxIds?: Iterable<string>;
  }
): PlanMatchSuggestion[] {
  const limit = opts?.limit ?? DASHBOARD_PLAN_MATCH_LIMIT;
  const maxPerPlan = opts?.maxPerPlan ?? 1;
  const minRank = opts?.minRank ?? "high";
  const excluded = new Set(opts?.excludeTxIds ?? []);

  const rows: { bucket: RankedPlanBucket; ranked: RankedTransaction }[] = [];
  for (const bucket of plans) {
    for (const ranked of bucket.ranked) {
      if (!passesMinRank(ranked.rankLabel, minRank)) continue;
      if (excluded.has(ranked.tx.id)) continue;
      rows.push({ bucket, ranked });
    }
  }
  rows.sort((a, b) => b.ranked.score - a.ranked.score);

  const usedByPlan = new Map<string, number>();
  const usedTx = new Set<string>();
  const picked: PlanMatchSuggestion[] = [];
  for (const { bucket, ranked } of rows) {
    if (usedTx.has(ranked.tx.id)) continue;
    const count = usedByPlan.get(bucket.planId) ?? 0;
    if (count >= maxPerPlan) continue;
    usedByPlan.set(bucket.planId, count + 1);
    usedTx.add(ranked.tx.id);
    picked.push({
      planId: bucket.planId,
      planName: bucket.planName,
      kind: bucket.kind,
      groupId: bucket.groupId,
      tx: ranked.tx,
      score: ranked.score,
    });
    if (picked.length >= limit) break;
  }
  return picked;
}

export async function fetchDashboardPlanMatches(
  groupFilter: ScopeFilter = "all"
): Promise<PlanMatchSuggestion[]> {
  const progress = await fetchDashboardPlanProgress();
  const candidates = progress.filter(
    (plan) => plan.eligibleCount > 0 && planMatchesGroupFilter(plan, groupFilter)
  );
  if (candidates.length === 0) return [];

  const buckets = await Promise.all(
    candidates.map(async (plan) => {
      const [ranked, dismissedIds] = await Promise.all([
        fetchRankedEligibleTransactions(plan.planId),
        fetchDismissedTransactionIds(plan.planId),
      ]);
      const excluded = new Set(dismissedIds);
      return {
        planId: plan.planId,
        planName: plan.planName,
        kind: plan.kind,
        groupId: plan.groupId,
        ranked: ranked.filter((row) => !excluded.has(row.tx.id)),
      };
    })
  );

  return pickTopPlanMatches(buckets, {
    limit: DASHBOARD_PLAN_MATCH_LIMIT,
    maxPerPlan: 1,
    minRank: "high",
  });
}
