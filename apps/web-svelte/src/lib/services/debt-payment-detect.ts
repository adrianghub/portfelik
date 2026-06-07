import { supabase } from "$lib/supabase";
import type { TransactionWithCategory } from "$lib/types";

export interface DetectedDebtPayment {
  tx: TransactionWithCategory;
  score: number;
  reasons: string[];
}

function amountMatches(expected: number, actual: number): boolean {
  const tolerance = Math.max(50, expected * 0.02);
  return Math.abs(actual - expected) <= tolerance;
}

export async function detectRecurringDebtPayments(input: {
  monthlyPayment: number;
  userId: string;
  groupId: string | null;
  lookbackMonths?: number;
}): Promise<DetectedDebtPayment[]> {
  const lookback = input.lookbackMonths ?? 6;
  const start = new Date();
  start.setMonth(start.getMonth() - lookback);
  const startIso = start.toISOString().slice(0, 10);

  let query = supabase
    .from("transactions_with_category")
    .select("*")
    .eq("type", "expense")
    .gte("date", startIso)
    .order("date", { ascending: false })
    .limit(200);

  if (input.groupId) {
    query = query.eq("group_id", input.groupId);
  } else {
    query = query.eq("user_id", input.userId).is("group_id", null);
  }

  const { data, error } = await query;
  if (error) throw error;

  const candidates = (data ?? []) as TransactionWithCategory[];
  const byDescription = new Map<string, TransactionWithCategory[]>();

  for (const tx of candidates) {
    if (!amountMatches(input.monthlyPayment, tx.amount)) continue;
    const key = tx.description.trim().toLowerCase().slice(0, 40) || tx.id;
    const group = byDescription.get(key) ?? [];
    group.push(tx);
    byDescription.set(key, group);
  }

  const results: DetectedDebtPayment[] = [];

  for (const [, txs] of byDescription) {
    if (txs.length < 2) continue;
    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const daySpread = sorted.map((t) => new Date(t.date).getDate());
    const avgDay = daySpread.reduce((s, d) => s + d, 0) / daySpread.length;
    const desc = sorted[0].description.toLowerCase();
    const keywordHit = ["hipotek", "kredyt", "rata", "spłat", "splata", "loan"].some((k) =>
      desc.includes(k)
    );
    const reasons = [
      `${txs.length}× kwota ~${input.monthlyPayment} zł`,
      `ok. ${Math.round(avgDay)}. dnia miesiąca`,
    ];
    if (keywordHit) reasons.push("pasuje opis (kredyt/rata)");
    results.push({
      tx: sorted[0],
      score: 50 + txs.length * 10 + (keywordHit ? 15 : 0),
      reasons,
    });
  }

  return results.sort((a, b) => b.score - a.score);
}
