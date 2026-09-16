import { describe, expect, it } from "vitest";
import {
  pickTopPlanMatches,
  type RankedPlanBucket,
} from "$lib/services/plan-match-suggestions";
import type { RankedTransaction } from "$lib/services/plan-settlement";
import type { TransactionWithCategory } from "$lib/types";

function tx(overrides: Partial<TransactionWithCategory> = {}): TransactionWithCategory {
  return {
    id: "tx-1",
    amount: 200,
    currency: "PLN",
    counterparty: null,
    description: "Rata wakacje",
    date: "2026-07-05",
    type: "expense",
    status: "paid",
    category_id: "cat-1",
    category_name: "Jedzenie",
    category_type: "expense",
    is_hold: false,
    user_id: "u1",
    is_recurring: false,
    recurring_day: null,
    recurrence_frequency: null,
    recurrence_interval: 1,
    recurrence_weekday: null,
    recurrence_month: null,
    recurring_template_id: null,
    recurring_occurrence_date: null,
    recurrence_end_date: null,
    group_id: null,
    created_at: "2026-07-05T10:00:00Z",
    updated_at: "2026-07-05T10:00:00Z",
    ...overrides,
  };
}

function ranked(
  overrides: Partial<RankedTransaction> & Pick<RankedTransaction, "rankLabel" | "score">
): RankedTransaction {
  return {
    tx: tx({ id: `tx-${overrides.score}` }),
    rankPct: overrides.score,
    reasons: [],
    ...overrides,
  };
}

function bucket(overrides: Partial<RankedPlanBucket> = {}): RankedPlanBucket {
  return {
    planId: "plan-1",
    planName: "Wakacje",
    kind: "save",
    groupId: null,
    ranked: [ranked({ rankLabel: "high", score: 80 })],
    ...overrides,
  };
}

describe("pickTopPlanMatches", () => {
  it("keeps the highest high-rank row and ignores medium by default", () => {
    const picked = pickTopPlanMatches([
      bucket({
        ranked: [
          ranked({ rankLabel: "medium", score: 60, tx: tx({ id: "med", description: "medium" }) }),
          ranked({ rankLabel: "high", score: 80, tx: tx({ id: "hi", description: "high" }) }),
        ],
      }),
    ]);

    expect(picked.map((row) => row.tx.id)).toEqual(["hi"]);
  });

  it("takes at most one transaction per plan on the dashboard", () => {
    const picked = pickTopPlanMatches([
      bucket({
        ranked: [
          ranked({ rankLabel: "high", score: 90, tx: tx({ id: "a" }) }),
          ranked({ rankLabel: "high", score: 85, tx: tx({ id: "b" }) }),
        ],
      }),
    ]);

    expect(picked.map((row) => row.tx.id)).toEqual(["a"]);
  });

  it("caps the list and prefers the highest scores across plans", () => {
    const picked = pickTopPlanMatches(
      [
        bucket({
          planId: "p1",
          planName: "A",
          ranked: [ranked({ rankLabel: "high", score: 70, tx: tx({ id: "p1" }) })],
        }),
        bucket({
          planId: "p2",
          planName: "B",
          ranked: [ranked({ rankLabel: "high", score: 95, tx: tx({ id: "p2" }) })],
        }),
        bucket({
          planId: "p3",
          planName: "C",
          ranked: [ranked({ rankLabel: "high", score: 80, tx: tx({ id: "p3" }) })],
        }),
      ],
      { limit: 2, maxPerPlan: 1 }
    );

    expect(picked.map((row) => row.tx.id)).toEqual(["p2", "p3"]);
  });

  it("can include medium ranks on plan detail", () => {
    const picked = pickTopPlanMatches(
      [
        bucket({
          ranked: [
            ranked({ rankLabel: "high", score: 80, tx: tx({ id: "hi" }) }),
            ranked({ rankLabel: "medium", score: 50, tx: tx({ id: "med" }) }),
          ],
        }),
      ],
      { limit: 2, maxPerPlan: 2, minRank: "medium" }
    );

    expect(picked.map((row) => row.tx.id)).toEqual(["hi", "med"]);
  });
});
