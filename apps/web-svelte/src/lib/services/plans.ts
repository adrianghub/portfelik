import { supabase } from "$lib/supabase";
import type { Plan, PlanBucket, PlanKind } from "$lib/types";

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function derivePlanBucket(
  plan: Pick<Plan, "start_date" | "end_date">,
  today = todayIso()
): PlanBucket {
  if (plan.start_date > today) return "upcoming";
  if (plan.end_date < today) return "finished";
  return "active";
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

function normalizePlanInput(input: PlanInput): PlanInput {
  const name = input.name.trim();
  if (!name) throw new Error("name_required");
  if (!input.start_date || !input.end_date) throw new Error("date_required");
  if (input.end_date < input.start_date) throw new Error("date_order");
  const kind = input.kind ?? "spend";
  const budget =
    input.budget_amount != null && !Number.isNaN(input.budget_amount)
      ? Math.abs(input.budget_amount)
      : null;
  const target =
    input.target_amount != null && !Number.isNaN(input.target_amount)
      ? Math.abs(input.target_amount)
      : null;
  if (kind === "save" && (!target || target <= 0)) throw new Error("target_required");
  if (kind === "spend" && budget != null && budget <= 0) throw new Error("budget_invalid");
  return {
    name,
    kind,
    group_id: input.group_id ?? null,
    category_id: input.category_id ?? null,
    budget_amount: kind === "spend" ? (budget && budget > 0 ? budget : null) : null,
    target_amount:
      kind === "save" ? target : kind === "debt" ? (target && target > 0 ? target : null) : null,
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
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.max(
    1,
    (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1
  );
}

export function monthsRemaining(endDate: string, today = todayIso()): number {
  const end = new Date(endDate);
  const now = new Date(today);
  if (end < now) return 0;
  return Math.max(
    1,
    (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth()) + 1
  );
}
