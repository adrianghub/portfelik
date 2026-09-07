import { fetchCategories } from "$lib/services/categories";
import { DEMO_PREFIX } from "$lib/services/demo-data-guards";
import { buildDemoTransactionSeeds } from "$lib/services/demo-scenario";
import { saveDebtPlan } from "$lib/services/plan-debt";
import { linkPlanTransaction } from "$lib/services/plan-settlement";
import { addCalendarMonths, createPlan, todayIso } from "$lib/services/plans";
import { createTransaction } from "$lib/services/transactions";
import { supabase } from "$lib/supabase";
import type { Category } from "$lib/types";

export {
  canSeedDemo,
  DEMO_PREFIX,
  hasDemoData,
  isDemoDescription,
  isDemoPlanName,
} from "$lib/services/demo-data-guards";

function demoLabel(label: string): string {
  return `${DEMO_PREFIX} ${label}`;
}

export interface DemoProbe {
  transactions: { description: string; is_demo: boolean }[];
  netWorthItems: { label: string; is_demo: boolean }[];
}

/**
 * Shared demo-presence probe: one cheap tagged-row select per demo-owned table
 * (plans ride on the regular plans query). Every `demoActive` check uses this
 * same shape under the `["transactions", "demo-probe"]` key, so the cache stays
 * consistent across dashboard, tour host, and walkthrough panel.
 */
export async function fetchDemoProbe(): Promise<DemoProbe> {
  const [txs, items] = await Promise.all([
    supabase.from("transactions").select("id, description, is_demo").eq("is_demo", true).limit(5),
    supabase.from("net_worth_items").select("id, label, is_demo").eq("is_demo", true).limit(5),
  ]);
  if (txs.error) throw txs.error;
  if (items.error) throw items.error;
  return { transactions: txs.data ?? [], netWorthItems: items.data ?? [] };
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function pickCategory(
  categories: Category[],
  type: Category["type"],
  preferred: string[],
  fallback?: string
): string {
  for (const name of preferred) {
    const hit = categories.find((c) => c.type === type && c.name === name);
    if (hit) return hit.id;
  }
  const any = categories.find((c) => c.type === type && c.name === fallback);
  if (any) return any.id;
  const first = categories.find((c) => c.type === type);
  if (!first) throw new Error("demo_categories_missing");
  return first.id;
}

export async function clearDemoData(): Promise<{ deleted: number }> {
  const { data, error } = await supabase.rpc("clear_demo_data");
  if (error) throw error;
  const deleted = Number((data as { deleted?: number } | null)?.deleted ?? 0);
  return { deleted };
}

export async function seedDemoData(): Promise<{ inserted: number }> {
  // Idempotent reseed: clear any partial or previous showcase rows first.
  await clearDemoData();

  const categories = await fetchCategories();
  const income = {
    salary: pickCategory(categories, "income", ["Wynagrodzenie"]),
    freelance: pickCategory(categories, "income", ["Freelance", "Inne przychody"]),
  };
  const expense = {
    groceries: pickCategory(categories, "expense", ["Jedzenie i zakupy", "Inne wydatki"]),
    transport: pickCategory(categories, "expense", ["Transport", "Inne wydatki"]),
    dining: pickCategory(categories, "expense", ["Restauracje", "Jedzenie i zakupy"]),
    housing: pickCategory(categories, "expense", ["Mieszkanie", "Inne wydatki"]),
    health: pickCategory(categories, "expense", ["Zdrowie", "Inne wydatki"]),
    sport: pickCategory(categories, "expense", ["Sport i rekreacja", "Inne wydatki"]),
    subs: pickCategory(categories, "expense", ["Subskrypcje", "Inne wydatki"]),
    fun: pickCategory(categories, "expense", ["Rozrywka", "Inne wydatki"]),
    travel: pickCategory(categories, "expense", ["Podróże", "Inne wydatki"]),
    insurance: pickCategory(categories, "expense", ["Ubezpieczenia", "Inne wydatki"]),
    electronics: pickCategory(categories, "expense", ["Elektronica", "Inne wydatki"]),
    goals: pickCategory(categories, "expense", ["Cele", "Inne wydatki"]),
  };

  const today = todayIso();
  let inserted = 0;

  const categoryIds = { ...income, ...expense };
  const goalContributionIds = new Map<string, string>();
  for (const seed of buildDemoTransactionSeeds()) {
    const transaction = await createTransaction({
      amount: seed.amount,
      type: seed.type,
      description: seed.label,
      date: seed.date,
      category_id: categoryIds[seed.category],
      status: seed.status ?? "paid",
      is_demo: true,
      is_recurring: seed.recurring ?? false,
      recurrence_frequency: seed.recurring ? "monthly" : undefined,
      recurrence_interval: seed.recurring ? 1 : undefined,
      recurring_day: seed.recurring ? Number(seed.date.slice(-2)) : undefined,
    });
    if (seed.category === "goals") goalContributionIds.set(seed.label, transaction.id);
    inserted += 1;
  }

  const savePlan = await createPlan({
    name: "Portugalia bez kredytu",
    kind: "save",
    target_amount: 9000,
    start_date: isoDaysAgo(60),
    end_date: addCalendarMonths(today, 9),
    category_id: expense.goals,
    is_demo: true,
  });
  const holidayContributionId = goalContributionIds.get("Odkładam na Portugalię");
  if (holidayContributionId) {
    await linkPlanTransaction(savePlan.id, holidayContributionId, { planKind: "save" });
  }
  inserted += 1;

  const sofaPlan = await createPlan({
    name: "Kanapa do salonu",
    kind: "save",
    target_amount: 6000,
    start_date: isoDaysAgo(30),
    end_date: addCalendarMonths(today, 5),
    category_id: expense.goals,
    is_demo: true,
  });
  const sofaContributionId = goalContributionIds.get("Odkładam na kanapę");
  if (sofaContributionId) {
    await linkPlanTransaction(sofaPlan.id, sofaContributionId, { planKind: "save" });
  }
  inserted += 1;

  const debtPlan = await saveDebtPlan({
    name: demoLabel("Kredyt samochodowy"),
    start_date: isoDaysAgo(180),
    end_date: addCalendarMonths(today, 24),
    original_amount: 42000,
    current_balance: 38500,
    annual_rate: 7.5,
    monthly_payment: 980,
    first_payment_date: isoDaysAgo(180),
  });
  const { error: debtTagError } = await supabase
    .from("plans")
    .update({ name: "Kredyt samochodowy", is_demo: true })
    .eq("id", debtPlan.plan.id);
  if (debtTagError) throw debtTagError;
  inserted += 1;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");
  const { error: netWorthError } = await supabase.from("net_worth_items").insert([
    {
      user_id: user.id,
      label: "Samochód (wartość rynkowa)",
      amount: 61000,
      currency: "PLN",
      position: 90,
      is_demo: true,
    },
    {
      user_id: user.id,
      label: "Poduszka finansowa",
      amount: 24500,
      currency: "PLN",
      position: 91,
      is_demo: true,
    },
  ]);
  if (netWorthError) throw netWorthError;
  inserted += 2;

  return { inserted };
}
