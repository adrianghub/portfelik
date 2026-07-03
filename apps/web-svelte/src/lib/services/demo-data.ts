import { fetchCategories } from "$lib/services/categories";
import { DEMO_PREFIX } from "$lib/services/demo-data-guards";
import { upsertPlanDebtTerms } from "$lib/services/plan-debt";
import { addCalendarMonths, createPlan, deletePlan, todayIso } from "$lib/services/plans";
import { createTransaction, deleteTransactions } from "$lib/services/transactions";
import { supabase } from "$lib/supabase";
import type { Category, Plan } from "$lib/types";

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

export async function seedDemoData(): Promise<{ inserted: number }> {
  const categories = await fetchCategories();
  const income = {
    salary: pickCategory(categories, "income", ["Wynagrodzenie"]),
    freelance: pickCategory(categories, "income", ["Freelance", "Inne przychody"]),
    goalDeposit: pickCategory(categories, "income", ["Wpłata na cel", "Wynagrodzenie"]),
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

  const txSeeds: {
    daysAgo: number;
    amount: number;
    type: "expense" | "income";
    catId: string;
    label: string;
    status?: "paid" | "upcoming";
  }[] = [
    { daysAgo: 92, amount: 6150, type: "income", catId: income.salary, label: "Wynagrodzenie" },
    {
      daysAgo: 88,
      amount: 380,
      type: "expense",
      catId: expense.groceries,
      label: "Zakupy spożywcze",
    },
    { daysAgo: 86, amount: 95, type: "expense", catId: expense.transport, label: "Paliwo" },
    { daysAgo: 84, amount: 129, type: "expense", catId: expense.dining, label: "Restauracja" },
    {
      daysAgo: 82,
      amount: 210,
      type: "expense",
      catId: expense.housing,
      label: "Rachunek za prąd",
    },
    { daysAgo: 78, amount: 6080, type: "income", catId: income.salary, label: "Wynagrodzenie" },
    { daysAgo: 74, amount: 62, type: "expense", catId: expense.health, label: "Apteka" },
    {
      daysAgo: 70,
      amount: 49,
      type: "expense",
      catId: expense.subs,
      label: "Subskrypcja streaming",
    },
    {
      daysAgo: 65,
      amount: 1200,
      type: "expense",
      catId: expense.insurance,
      label: "Ubezpieczenie OC",
    },
    { daysAgo: 62, amount: 6200, type: "income", catId: income.salary, label: "Wynagrodzenie" },
    {
      daysAgo: 58,
      amount: 420,
      type: "expense",
      catId: expense.groceries,
      label: "Zakupy spożywcze",
    },
    { daysAgo: 55, amount: 180, type: "expense", catId: expense.fun, label: "Kino" },
    { daysAgo: 52, amount: 350, type: "expense", catId: expense.electronics, label: "Słuchawki" },
    {
      daysAgo: 48,
      amount: 850,
      type: "income",
      catId: income.freelance,
      label: "Projekt na zlecenie",
    },
    { daysAgo: 45, amount: 6100, type: "income", catId: income.salary, label: "Wynagrodzenie" },
    { daysAgo: 41, amount: 89, type: "expense", catId: expense.transport, label: "Paliwo" },
    { daysAgo: 38, amount: 156, type: "expense", catId: expense.dining, label: "Restauracja" },
    { daysAgo: 35, amount: 2400, type: "expense", catId: expense.housing, label: "Czynsz" },
    {
      daysAgo: 32,
      amount: 500,
      type: "expense",
      catId: expense.travel,
      label: "Rezerwacja noclegu",
    },
    { daysAgo: 28, amount: 6050, type: "income", catId: income.salary, label: "Wynagrodzenie" },
    {
      daysAgo: 25,
      amount: 400,
      type: "income",
      catId: income.goalDeposit,
      label: "Wpłata na wakacje",
    },
    {
      daysAgo: 22,
      amount: 240,
      type: "expense",
      catId: expense.housing,
      label: "Rachunek za prąd",
    },
    { daysAgo: 18, amount: 72, type: "expense", catId: expense.health, label: "Apteka" },
    { daysAgo: 14, amount: 5980, type: "income", catId: income.salary, label: "Wynagrodzenie" },
    { daysAgo: 10, amount: 310, type: "expense", catId: expense.groceries, label: "Supermarket" },
    { daysAgo: 7, amount: 45, type: "expense", catId: expense.dining, label: "Kawa na mieście" },
    {
      daysAgo: 5,
      amount: 980,
      type: "expense",
      catId: expense.goals,
      label: "Rata kredytu samochodowego",
    },
    { daysAgo: 3, amount: 180, type: "expense", catId: expense.sport, label: "Siłownia" },
    {
      daysAgo: -5,
      amount: 220,
      type: "expense",
      catId: expense.subs,
      label: "Abonament telefonu",
      status: "upcoming",
    },
    {
      daysAgo: -12,
      amount: 2500,
      type: "expense",
      catId: expense.housing,
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
      category_id: seed.catId,
      status: seed.status ?? "paid",
    });
    inserted += 1;
  }

  await createTransaction({
    amount: 49,
    type: "expense",
    description: demoLabel("Subskrypcja streaming (cykliczna)"),
    date: isoDaysAgo(30),
    category_id: expense.subs,
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
    category_id: income.goalDeposit,
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
