import type { PlanKind, TransactionWithCategory } from "$lib/types";
import {
  fetchDashboardPlanProgress,
  fetchRankedEligibleTransactions,
  type RankedTransaction,
} from "$lib/services/plan-settlement";

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

/** Highest-scoring settlement candidates, capped so Kokpit stays a short list. */
export function pickTopPlanMatches(
  plans: readonly RankedPlanBucket[],
  opts?: {
    limit?: number;
    maxPerPlan?: number;
    minRank?: RankedTransaction["rankLabel"];
  }
): PlanMatchSuggestion[] {
  const limit = opts?.limit ?? DASHBOARD_PLAN_MATCH_LIMIT;
  const maxPerPlan = opts?.maxPerPlan ?? 1;
  const minRank = opts?.minRank ?? "high";

  const rows: { bucket: RankedPlanBucket; ranked: RankedTransaction }[] = [];
  for (const bucket of plans) {
    for (const ranked of bucket.ranked) {
      if (!passesMinRank(ranked.rankLabel, minRank)) continue;
      rows.push({ bucket, ranked });
    }
  }
  rows.sort((a, b) => b.ranked.score - a.ranked.score);

  const used = new Map<string, number>();
  const picked: PlanMatchSuggestion[] = [];
  for (const { bucket, ranked } of rows) {
    const count = used.get(bucket.planId) ?? 0;
    if (count >= maxPerPlan) continue;
    used.set(bucket.planId, count + 1);
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

export async function fetchDashboardPlanMatches(): Promise<PlanMatchSuggestion[]> {
  const progress = await fetchDashboardPlanProgress();
  const candidates = progress.filter((plan) => plan.eligibleCount > 0);
  if (candidates.length === 0) return [];

  const buckets = await Promise.all(
    candidates.map(async (plan) => ({
      planId: plan.planId,
      planName: plan.planName,
      kind: plan.kind,
      groupId: plan.groupId,
      ranked: await fetchRankedEligibleTransactions(plan.planId),
    }))
  );

  return pickTopPlanMatches(buckets, {
    limit: DASHBOARD_PLAN_MATCH_LIMIT,
    maxPerPlan: 1,
    minRank: "high",
  });
}
