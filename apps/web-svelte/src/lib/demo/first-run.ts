/**
 * First-run and interactive demo contract.
 *
 * The eight-scene tour in `onboarding.ts` stays until Kokpit and Transakcje
 * expose the targets below. This module does not seed data and does not
 * change tour progress.
 */

export const FIRST_RUN_COPY = {
  title: "Zobacz, na co możesz sobie pozwolić.",
  body: "JakStoimy łączy codzienne wydatki z planami na przyszłość. Prywatne finanse pozostają prywatne, a wspólne możecie prowadzić razem.",
  tryDemo: "Wypróbuj demo",
  addOwn: "Dodaj swoje dane",
  demoHint: "Gotowe przykładowe dane, bez zobowiązań.",
  ownHint: "Import wyciągu lub pierwsza transakcja.",
  cockpitHint: "Jedno miejsce, do którego wracasz na co dzień.",
} as const;

export const DEMO_STATUS_COPY = {
  title: "Tryb demonstracyjny",
  body: "Pracujesz na przykładowych danych.",
} as const;

export const DEMO_STATUS_ACTIONS = [
  { id: "clear", label: "Usuń dane przykładowe" },
  { id: "restart", label: "Uruchom przewodnik ponownie" },
  { id: "settings", label: "Ustawienia demo" },
] as const;

export type DemoStatusActionId = (typeof DEMO_STATUS_ACTIONS)[number]["id"];

export type DemoTaskId = "cockpit" | "transactions" | "plans";

export interface DemoTask {
  id: DemoTaskId;
  title: string;
  body: string;
  route: "/dashboard" | "/transactions" | "/plans";
  /** `data-tour-id` values. Empty spotlight when none of them are on screen. */
  targets: readonly string[];
}

export const DEMO_TASKS: readonly DemoTask[] = [
  {
    id: "cockpit",
    title: "Ile zostanie na koniec miesiąca?",
    body: "Zmień miesiąc i sprawdź, jak zmienia się prognoza.",
    route: "/dashboard",
    targets: ["demo-month-filter", "demo-balance", "demo-expenses", "demo-forecast"],
  },
  {
    id: "transactions",
    title: "Co masz jeszcze do opłacenia?",
    body: "Otwórz nadchodzącą płatność. Możesz sprawdzić jej szczegóły i sposób rozliczenia.",
    route: "/transactions",
    targets: ["demo-upcoming-payment"],
  },
  {
    id: "plans",
    title: "Ile jeszcze potrzebujesz na wyjazd?",
    body: "Otwórz plan i zobacz, co jest już opłacone, a co dopiero przed Tobą.",
    route: "/plans",
    targets: ["demo-spend-plan"],
  },
];

/** Opening a highlighted row explains it. It does not mark the row paid. */
export const DEMO_TASK_MUTATES_LEDGER = false;

export interface DemoGuideProgress {
  dismissed: boolean;
  completed: boolean;
  finishedTaskIds: readonly DemoTaskId[];
}

export function initialDemoGuideProgress(): DemoGuideProgress {
  return { dismissed: false, completed: false, finishedTaskIds: [] };
}

export function shouldShowFirstRun(input: {
  ownTransactionCount: number;
  ownPlanCount: number;
  demoActive: boolean;
  progress: DemoGuideProgress;
}): boolean {
  if (input.ownTransactionCount > 0 || input.ownPlanCount > 0) return false;
  if (input.demoActive) return false;
  if (input.progress.dismissed || input.progress.completed) return false;
  return true;
}

export function skipDemoGuide(progress: DemoGuideProgress): DemoGuideProgress {
  return { ...progress, dismissed: true };
}

export function restartDemoGuide(): DemoGuideProgress {
  return initialDemoGuideProgress();
}

export function advanceDemoTask(
  progress: DemoGuideProgress,
  taskId: DemoTaskId
): DemoGuideProgress {
  const finishedTaskIds = progress.finishedTaskIds.includes(taskId)
    ? progress.finishedTaskIds
    : [...progress.finishedTaskIds, taskId];
  const completed = DEMO_TASKS.every((task) => finishedTaskIds.includes(task.id));
  return { ...progress, finishedTaskIds, completed };
}

export function nextDemoTask(progress: DemoGuideProgress): DemoTask | null {
  return DEMO_TASKS.find((task) => !progress.finishedTaskIds.includes(task.id)) ?? null;
}

export function demoTaskProgressLabel(index: number, total = DEMO_TASKS.length): string {
  return `${index} z ${total}`;
}

export function demoTaskPrimaryLabel(taskId: DemoTaskId): "Dalej" | "Zakończ" {
  return taskId === "plans" ? "Zakończ" : "Dalej";
}

/** Phone and a zoomed desktop use the bottom sheet. Wider screens keep the tip beside the target. */
export function demoTipPlacement(viewportWidth: number): "beside" | "bottom" {
  return viewportWidth < 768 ? "bottom" : "beside";
}

export function demoTaskSpotlight(
  task: DemoTask,
  presentTargets: ReadonlySet<string>
): readonly string[] {
  return task.targets.filter((target) => presentTargets.has(target));
}

export interface DemoSpendPlanSnapshot {
  itemCount: number;
  paidAmount: number;
  remainder: number;
}

export interface DemoDatasetSnapshot {
  openingBalance: number | null;
  /**
   * True only when clearing demo can remove that anchor without deleting a
   * user's anchor. `cash_positions` has one private row and no demo flag, and
   * `clear_demo_data` does not touch it, so this stays false for now.
   */
  clearCanRestoreOpeningBalance: boolean;
  incomes: number;
  expenses: number;
  upcomingExpenses: number;
  distinctPaidMonths: number;
  spendPlans: readonly DemoSpendPlanSnapshot[];
}

export function snapshotFromTransactionSeeds(
  seeds: readonly {
    type: "income" | "expense";
    status?: "paid" | "upcoming";
    date: string;
  }[],
  extras: Pick<
    DemoDatasetSnapshot,
    "openingBalance" | "clearCanRestoreOpeningBalance" | "spendPlans"
  >
): DemoDatasetSnapshot {
  const paid = seeds.filter((seed) => seed.status !== "upcoming");
  return {
    ...extras,
    incomes: seeds.filter((seed) => seed.type === "income").length,
    expenses: seeds.filter((seed) => seed.type === "expense" && seed.status !== "upcoming").length,
    upcomingExpenses: seeds.filter((seed) => seed.type === "expense" && seed.status === "upcoming")
      .length,
    distinctPaidMonths: new Set(paid.map((seed) => seed.date.slice(0, 7))).size,
  };
}

/** Gap codes for the three tasks. An empty list means the showcase can run. */
export function demoDatasetGaps(dataset: DemoDatasetSnapshot): string[] {
  const gaps: string[] = [];
  const openingReady =
    dataset.openingBalance != null &&
    dataset.openingBalance > 0 &&
    dataset.clearCanRestoreOpeningBalance;
  if (!openingReady) gaps.push("opening-balance");
  if (dataset.incomes < 1) gaps.push("income");
  if (dataset.expenses < 1) gaps.push("expense");
  if (dataset.upcomingExpenses < 1) gaps.push("upcoming-payment");
  const partialSpend = dataset.spendPlans.some(
    (plan) => plan.itemCount >= 2 && plan.paidAmount > 0 && plan.remainder > 0
  );
  if (!partialSpend) gaps.push("spend-plan");
  if (!openingReady || dataset.distinctPaidMonths < 2 || dataset.upcomingExpenses < 1) {
    gaps.push("forecast");
  }
  return gaps;
}

/**
 * Demo seed may write a private opening balance only when the user has none
 * and clearing demo can put that row back. Otherwise the single anchor row
 * would become the user's balance.
 */
export function demoOpeningBalanceDecision(input: {
  hasPrivateAnchor: boolean;
  clearCanRestoreOpeningBalance: boolean;
}): "seed" | "skip" {
  if (input.hasPrivateAnchor || !input.clearCanRestoreOpeningBalance) return "skip";
  return "seed";
}

/** Rows `clear_demo_data` may delete. A user's own row stays. */
export function isClearedWithDemo(row: {
  isDemo: boolean;
  recurringTemplateIsDemo?: boolean;
}): boolean {
  return row.isDemo || row.recurringTemplateIsDemo === true;
}
