import { supabase } from "$lib/supabase";
import type { GroupMemberRole, Plan, PlanBucket, PlanKind } from "$lib/types";

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Add N calendar months to a local YYYY-MM-DD anchor. */
export function addCalendarMonths(anchor: string, months: number): string {
  const d = parseLocalDate(anchor);
  d.setMonth(d.getMonth() + months);
  return formatLocalDate(d);
}

/** Whole calendar months from anchor until endDate (inverse of addCalendarMonths). */
export function calendarMonthsUntil(endDate: string, anchor = todayIso()): number {
  const end = parseLocalDate(endDate);
  const start = parseLocalDate(anchor);
  if (end < start) return 0;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(1, months);
}

/** Save-goal deadline slider anchor: plan start when upcoming, else today. */
export function savePlanDeadlineAnchor(
  plan: Pick<Plan, "start_date" | "end_date">,
  today = todayIso()
): string {
  return derivePlanBucket(plan, today) === "upcoming" ? plan.start_date : today;
}

/** Months shown on the save-goal deadline slider (start→end or today→end). */
export function savePlanSliderMonths(
  plan: Pick<Plan, "start_date" | "end_date">,
  today = todayIso()
): number {
  return calendarMonthsUntil(plan.end_date, savePlanDeadlineAnchor(plan, today));
}

export function defaultDebtPlanEndDate(today = todayIso()): string {
  return addCalendarMonths(today, 12);
}

export function derivePlanBucket(
  plan: Pick<Plan, "start_date" | "end_date">,
  today = todayIso()
): PlanBucket {
  if (plan.start_date > today) return "upcoming";
  if (plan.end_date < today) return "finished";
  return "active";
}

/**
 * A plan is "live" when its lifecycle status is active. Refinanced/closed plans
 * are archived: they must drop out of active debt aggregates (net worth, monthly
 * obligations) and the hub's active lists so a refinanced loan never double-counts
 * with its replacement. Date bucket (`derivePlanBucket`) is a separate axis.
 */
export function isLivePlan(plan: Pick<Plan, "status">): boolean {
  return plan.status === "active";
}

export interface PlanInput {
  name: string;
  kind?: PlanKind;
  group_id?: string | null;
  category_id?: string | null;
  budget_amount?: number | null;
  target_amount?: number | null;
  start_date: string;
  end_date: string;
}

type NormalizedPlanInput = Omit<PlanInput, "kind"> & { kind: PlanKind };

function normalizePlanInput(input: PlanInput): NormalizedPlanInput {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  if (!input.start_date || !input.end_date) throw new Error("date_required");
  if (input.end_date < input.start_date) throw new Error("date_order");
  const kind = input.kind ?? "save";
  const target =
    input.target_amount != null && !Number.isNaN(input.target_amount)
      ? Math.abs(input.target_amount)
      : null;
  if (kind === "save" && (!target || target <= 0)) throw new Error("target_required");
  return {
    name,
    kind,
    group_id: input.group_id ?? null,
    category_id: input.category_id ?? null,
    budget_amount: null,
    target_amount: kind === "save" ? target : target && target > 0 ? target : null,
    start_date: input.start_date,
    end_date: input.end_date,
  };
}

export async function fetchPlans(): Promise<Plan[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .order("start_date", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Plan[];
}

export async function fetchPlanById(id: string): Promise<Plan> {
  const { data, error } = await supabase.from("plans").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Plan;
}

export async function createPlan(input: PlanInput): Promise<Plan> {
  const normalized = normalizePlanInput(input);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data, error } = await supabase
    .from("plans")
    .insert({ ...normalized, user_id: user.id })
    .select()
    .single();
  if (error) throw error;
  return data as Plan;
}

export async function updatePlan(id: string, input: PlanInput): Promise<Plan> {
  const normalized = normalizePlanInput(input);
  const { data, error } = await supabase
    .from("plans")
    .update(normalized)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Plan;
}

export async function deletePlan(id: string): Promise<void> {
  const { error } = await supabase.from("plans").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchPlansForExport(): Promise<unknown[]> {
  const { data, error } = await supabase
    .from("plans")
    .select("*, plan_transaction_links(id, transaction_id, created_by, created_at)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export function monthsBetween(startDate: string, endDate: string): number {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(1, months);
}

/** @deprecated Use calendarMonthsUntil - kept as alias for callers. */
export function monthsRemaining(endDate: string, today = todayIso()): number {
  return calendarMonthsUntil(endDate, today);
}

export function canManagePlan(
  plan: Pick<Plan, "user_id" | "group_id">,
  currentUserId: string,
  groupRoles: Map<string, GroupMemberRole>
): boolean {
  if (plan.user_id === currentUserId) return true;
  if (!plan.group_id) return false;
  const role = groupRoles.get(plan.group_id);
  return role === "owner" || role === "co_owner";
}
