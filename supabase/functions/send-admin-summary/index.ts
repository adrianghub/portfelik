// supabase/functions/send-admin-summary/index.ts
//
// Replaces Cloud Function sendAdminTransactionSummary. Aggregates the previous
// 7 days of paid transactions across all users, then inserts one notification
// per admin. The notifications.insert trigger (Phase 5.2 wiring migration)
// fans those out as web-push via the send-push function.
//
// Scheduled by pg_cron at Mon 07:00 UTC (08:00 / 09:00 Warsaw).
//
// Auth: verify_jwt = false. Caller must pass Authorization: Bearer <INTERNAL_TRIGGER_SECRET>.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TRIGGER_SECRET = Deno.env.get("INTERNAL_TRIGGER_SECRET");

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface UserTotals {
  income: number;
  expense: number;
  txnCount: number;
}

function fmtPLN(n: number) {
  return n.toFixed(2).replace(/\.?0+$/, "") + " PLN";
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get("Authorization");
  if (!TRIGGER_SECRET || auth !== `Bearer ${TRIGGER_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const end = new Date();
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 7);
  start.setUTCHours(0, 0, 0, 0);

  const { data: txns, error: txErr } = await supabase
    .from("transactions")
    .select("user_id, amount, type, status")
    .gte("date", start.toISOString())
    .lte("date", end.toISOString())
    .eq("status", "paid");

  if (txErr) {
    return new Response(`Transactions query failed: ${txErr.message}`, { status: 500 });
  }

  const totals: Record<string, UserTotals> = {};
  for (const t of txns ?? []) {
    totals[t.user_id] ??= { income: 0, expense: 0, txnCount: 0 };
    if (t.type === "income") totals[t.user_id].income += Number(t.amount);
    else totals[t.user_id].expense += Number(t.amount);
    totals[t.user_id].txnCount += 1;
  }

  const totalIncome = Object.values(totals).reduce((s, v) => s + v.income, 0);
  const totalExpense = Object.values(totals).reduce((s, v) => s + v.expense, 0);
  const userCount = Object.keys(totals).length;

  const { data: admins, error: aErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "admin");

  if (aErr) {
    return new Response(`Admin query failed: ${aErr.message}`, { status: 500 });
  }

  if (!admins || admins.length === 0) {
    return new Response(JSON.stringify({ inserted: 0, reason: "no admins" }), {
      headers: { "content-type": "application/json" },
    });
  }

  const rows = admins.map((a) => ({
    user_id: a.id,
    type: "transaction_summary",
    title: "Podsumowanie tygodniowe",
    body: `${userCount} użytkowników. Przychody: ${fmtPLN(totalIncome)}, wydatki: ${fmtPLN(totalExpense)}.`,
    data: {
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      userCount,
      totalIncome,
      totalExpense,
      perUser: totals,
    },
  }));

  const { error: iErr } = await supabase.from("notifications").insert(rows);
  if (iErr) {
    return new Response(`Insert failed: ${iErr.message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ inserted: rows.length, userCount, totalIncome, totalExpense }), {
    headers: { "content-type": "application/json" },
  });
});
