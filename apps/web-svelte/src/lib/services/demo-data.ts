import { fetchCategories } from "$lib/services/categories";
import { DEMO_PREFIX } from "$lib/services/demo-data-guards";
import { upsertPlanDebtTerms } from "$lib/services/plan-debt";
import { addCalendarMonths, createPlan, deletePlan, todayIso } from "$lib/services/plans";
import { createTransaction, deleteTransactions } from "$lib/services/transactions";
import { supabase } from "$lib/supabase";
import type { Plan } from "$lib/types";

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

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function seedDemoData(): Promise<{ inserted: number }> {
  const categories = await fetchCategories();
  const expenseCat = categories.find((c) => c.type === "expense");
  const incomeCat = categories.find((c) => c.type === "income");
  if (!expenseCat || !incomeCat) throw new Error("demo_categories_missing");

  const today = todayIso();
  let inserted = 0;

  const txSeeds: {
    daysAgo: number;
    amount: number;
    type: "expense" | "income";
    catId: string;
    label: string;
    status?: "paid" | "upcoming";
  }[] = [
    { daysAgo: 62, amount: 6200, type: "income", catId: incomeCat.id, label: "Wynagrodzenie" },
    { daysAgo: 58, amount: 420, type: "expense", catId: expenseCat.id, label: "Zakupy spożywcze" },
    { daysAgo: 45, amount: 6100, type: "income", catId: incomeCat.id, label: "Wynagrodzenie" },
    { daysAgo: 41, amount: 89, type: "expense", catId: expenseCat.id, label: "Paliwo" },
    { daysAgo: 35, amount: 156, type: "expense", catId: expenseCat.id, label: "Restauracja" },
    { daysAgo: 28, amount: 6050, type: "income", catId: incomeCat.id, label: "Wynagrodzenie" },
    { daysAgo: 22, amount: 240, type: "expense", catId: expenseCat.id, label: "Rachunek za prąd" },
    { daysAgo: 18, amount: 72, type: "expense", catId: expenseCat.id, label: "Apteka" },
    { daysAgo: 14, amount: 5980, type: "income", catId: incomeCat.id, label: "Wynagrodzenie" },
    { daysAgo: 10, amount: 310, type: "expense", catId: expenseCat.id, label: "Supermarket" },
    { daysAgo: 7, amount: 45, type: "expense", catId: expenseCat.id, label: "Kawa na mieście" },
    { daysAgo: 3, amount: 180, type: "expense", catId: expenseCat.id, label: "Siłownia" },
    {
      daysAgo: -5,
      amount: 220,
      type: "expense",
      catId: expenseCat.id,
      label: "Abonament telefonu",
      status: "upcoming",
    },
    {
      daysAgo: -12,
      amount: 2500,
      type: "expense",
      catId: expenseCat.id,
      label: "Czynsz",
      status: "upcoming",
    },
  ];

  for (const seed of txSeeds) {
    const date = seed.daysAgo >= 0 ? isoDaysAgo(seed.daysAgo) : isoDaysFromNow(-seed.daysAgo);
    await createTransaction({
      amount: seed.amount,
      type: seed.type,
      description: demoLabel(seed.label),
      date,
      category_id: seed.type === "income" ? incomeCat.id : expenseCat.id,
      status: seed.status ?? "paid",
    });
    inserted += 1;
  }

  await createTransaction({
    amount: 49,
    type: "expense",
    description: demoLabel("Subskrypcja streaming (cykliczna)"),
    date: isoDaysAgo(30),
    category_id: expenseCat.id,
    status: "paid",
    is_recurring: true,
    recurrence_frequency: "monthly",
    recurrence_interval: 1,
    recurring_day: 15,
  });
  inserted += 1;

  await createPlan({
    name: demoLabel("Wakacje nad morzem"),
    kind: "save",
    target_amount: 8000,
    start_date: isoDaysAgo(60),
    end_date: addCalendarMonths(today, 8),
    category_id: incomeCat.id,
  });
  inserted += 1;

  const debtPlan = await createPlan({
    name: demoLabel("Kredyt samochodowy"),
    kind: "debt",
    start_date: isoDaysAgo(180),
    end_date: addCalendarMonths(today, 24),
  });
  await upsertPlanDebtTerms(debtPlan.id, {
    original_amount: 42000,
    current_balance: 38500,
    annual_rate: 7.5,
    monthly_payment: 980,
    first_payment_date: isoDaysAgo(180),
  });
  inserted += 1;

  return { inserted };
}

async function fetchDemoTransactionIds(): Promise<string[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("id, description")
    .like("description", `${DEMO_PREFIX}%`);
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

async function fetchDemoPlans(): Promise<Plan[]> {
  const { data, error } = await supabase.from("plans").select("*").like("name", `${DEMO_PREFIX}%`);
  if (error) throw error;
  return (data ?? []) as Plan[];
}

export async function clearDemoData(): Promise<{ deleted: number }> {
  let deleted = 0;

  for (const plan of await fetchDemoPlans()) {
    await deletePlan(plan.id);
    deleted += 1;
  }

  const txIds = await fetchDemoTransactionIds();
  if (txIds.length > 0) {
    await deleteTransactions(txIds);
    deleted += txIds.length;
  }

  return { deleted };
}
