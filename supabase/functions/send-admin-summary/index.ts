// supabase/functions/send-admin-summary/index.ts
//
// Weekly admin digest: aggregates paid transactions from the last 7 days and
// inserts one notification per eligible admin.
//
// Schedule (pg_cron daily 07:00 UTC):
//   - every Monday (Europe/Warsaw), or
//   - the day after a bank_import_reminder for admins with import alerts on.
// Manual admin trigger bypasses schedule checks.
//
// Auth: verify_jwt = false. Caller must pass Authorization: Bearer <INTERNAL_TRIGGER_SECRET>.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TRIGGER_SECRET = Deno.env.get("INTERNAL_TRIGGER_SECRET");
const WARSAW_TZ = "Europe/Warsaw";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface UserTotals {
  income: number;
  expense: number;
  txnCount: number;
}

interface ProfileRow {
  id: string;
  settings: Record<string, unknown> | null;
}

interface TriggerPayload {
  triggered_by?: string;
}

function fmtPLN(n: number): string {
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n);
}

function warsawYmd(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: WARSAW_TZ }).format(date);
}

function isMondayInWarsaw(date: Date): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: WARSAW_TZ,
    weekday: "short",
  }).format(date);
  return weekday === "Mon";
}

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const mapped: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") mapped[part.type] = part.value;
  }
  const asUtc = Date.UTC(
    Number(mapped.year),
    Number(mapped.month) - 1,
    Number(mapped.day),
    Number(mapped.hour),
    Number(mapped.minute),
    Number(mapped.second),
  );
  return asUtc - date.getTime();
}

function warsawDayStartUtc(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset = getTimeZoneOffsetMs(WARSAW_TZ, new Date(utcGuess));
  return new Date(utcGuess - offset);
}

function addCalendarDaysYmd(ymd: string, delta: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const noonUtc = Date.UTC(year, month - 1, day + delta, 12, 0, 0);
  return warsawYmd(new Date(noonUtc));
}

function activeUsersPhrase(count: number): string {
  if (count === 0) return "Na razie nikt nie dodał transakcji";
  if (count === 1) return "1 aktywna osoba";
  const lastTwo = count % 100;
  const last = count % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) {
    return `${count} aktywne osoby`;
  }
  return `${count} aktywnych osób`;
}

function buildSummaryBody(income: number, expense: number, userCount: number): string {
  const users = activeUsersPhrase(userCount);
  return `Ostatnie 7 dni: wpływy ${fmtPLN(income)}, wydatki ${fmtPLN(expense)} — ${users}.`;
}

function isImportReminderEnabled(settings: Record<string, unknown> | null): boolean {
  const alerts = settings?.alerts;
  if (!alerts || typeof alerts !== "object") return false;
  const bankImportReminder = (alerts as Record<string, unknown>).bankImportReminder;
  if (!bankImportReminder || typeof bankImportReminder !== "object") return false;
  const enabled = (bankImportReminder as Record<string, unknown>).enabled;
  if (typeof enabled === "boolean") return enabled;
  if (typeof enabled === "string") return enabled.toLowerCase() === "true";
  return false;
}

async function wasSummarySentRecently(adminId: string): Promise<boolean> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", adminId)
    .eq("type", "transaction_summary")
    .gte("created_at", weekAgo)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function hadImportReminderYesterday(adminId: string, now = new Date()): Promise<boolean> {
  const todayYmd = warsawYmd(now);
  const yesterdayYmd = addCalendarDaysYmd(todayYmd, -1);
  const start = warsawDayStartUtc(yesterdayYmd).toISOString();
  const end = warsawDayStartUtc(todayYmd).toISOString();

  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .eq("user_id", adminId)
    .eq("type", "bank_import_reminder")
    .gte("created_at", start)
    .lt("created_at", end)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

async function shouldSendScheduledSummary(admin: ProfileRow, now = new Date()): Promise<boolean> {
  if (await wasSummarySentRecently(admin.id)) return false;

  if (isMondayInWarsaw(now)) return true;

  if (!isImportReminderEnabled(admin.settings)) return false;
  return hadImportReminderYesterday(admin.id, now);
}

Deno.serve(async (req: Request) => {
  const auth = req.headers.get("Authorization");
  if (!TRIGGER_SECRET || auth !== `Bearer ${TRIGGER_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: TriggerPayload = {};
  try {
    const text = await req.text();
    if (text) payload = JSON.parse(text) as TriggerPayload;
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const forced = payload.triggered_by === "admin";
  const now = new Date();

  const { data: admins, error: aErr } = await supabase
    .from("profiles")
    .select("id, settings")
    .eq("role", "admin");

  if (aErr) {
    return new Response(`Admin query failed: ${aErr.message}`, { status: 500 });
  }

  if (!admins || admins.length === 0) {
    return new Response(JSON.stringify({ inserted: 0, reason: "no admins" }), {
      headers: { "content-type": "application/json" },
    });
  }

  const eligibleAdmins: ProfileRow[] = [];
  for (const admin of admins as ProfileRow[]) {
    if (forced || (await shouldSendScheduledSummary(admin, now))) {
      eligibleAdmins.push(admin);
    }
  }

  if (eligibleAdmins.length === 0) {
    return new Response(JSON.stringify({ inserted: 0, reason: "not scheduled today" }), {
      headers: { "content-type": "application/json" },
    });
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
  const body = buildSummaryBody(totalIncome, totalExpense, userCount);

  const rows = eligibleAdmins.map((admin) => ({
    user_id: admin.id,
    type: "transaction_summary",
    title: "Podsumowanie tygodnia",
    body,
    data: {
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      userCount,
      totalIncome,
      totalExpense,
      perUser: totals,
      schedule: forced ? "manual" : isMondayInWarsaw(now) ? "monday" : "after_import_reminder",
    },
  }));

  const { error: iErr } = await supabase.from("notifications").insert(rows);
  if (iErr) {
    return new Response(`Insert failed: ${iErr.message}`, { status: 500 });
  }

  return new Response(
    JSON.stringify({
      inserted: rows.length,
      userCount,
      totalIncome,
      totalExpense,
      forced,
    }),
    { headers: { "content-type": "application/json" } },
  );
});
