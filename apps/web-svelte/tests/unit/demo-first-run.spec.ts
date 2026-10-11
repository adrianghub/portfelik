import { describe, expect, it } from "vitest";
import { ONBOARDING_SCENES } from "$lib/content/onboarding";
import {
  DEMO_STATUS_ACTIONS,
  DEMO_STATUS_COPY,
  DEMO_TASK_MUTATES_LEDGER,
  DEMO_TASKS,
  FIRST_RUN_COPY,
  advanceDemoTask,
  demoDatasetGaps,
  demoOpeningBalanceDecision,
  demoTaskPrimaryLabel,
  demoTaskProgressLabel,
  demoTaskSpotlight,
  demoTipPlacement,
  initialDemoGuideProgress,
  isClearedWithDemo,
  nextDemoTask,
  restartDemoGuide,
  shouldShowFirstRun,
  skipDemoGuide,
  snapshotFromTransactionSeeds,
} from "$lib/demo/first-run";
import { buildDemoTransactionSeeds } from "$lib/services/demo-scenario";

describe("first-run copy", () => {
  it("uses the approved introduction", () => {
    expect(FIRST_RUN_COPY).toEqual({
      title: "Zobacz, na co możesz sobie pozwolić.",
      body: "JakStoimy łączy codzienne wydatki z planami na przyszłość. Prywatne finanse pozostają prywatne, a wspólne możecie prowadzić razem.",
      tryDemo: "Wypróbuj demo",
      addOwn: "Dodaj swoje dane",
      demoHint: "Gotowe przykładowe dane, bez zobowiązań.",
      ownHint: "Import wyciągu lub pierwsza transakcja.",
      cockpitHint: "Jedno miejsce, do którego wracasz na co dzień.",
    });
  });

  it("uses three tasks and a compact demo status", () => {
    expect(DEMO_TASKS.map((task) => task.title)).toEqual([
      "Ile zostanie na koniec miesiąca?",
      "Co masz jeszcze do opłacenia?",
      "Ile jeszcze potrzebujesz na wyjazd?",
    ]);
    expect(DEMO_TASKS.map((task) => task.body)).toEqual([
      "Zmień miesiąc i sprawdź, jak zmienia się prognoza.",
      "Otwórz nadchodzącą płatność. Możesz sprawdzić jej szczegóły i sposób rozliczenia.",
      "Otwórz plan i zobacz, co jest już opłacone, a co dopiero przed Tobą.",
    ]);
    expect(DEMO_STATUS_COPY).toEqual({
      title: "Tryb demonstracyjny",
      body: "Pracujesz na przykładowych danych.",
    });
    expect(DEMO_STATUS_ACTIONS.map((action) => action.id)).toEqual([
      "clear",
      "restart",
      "settings",
    ]);
    expect(DEMO_STATUS_ACTIONS.map((action) => action.label).join(" ")).not.toMatch(/import/i);
  });

  it("keeps the new targets off the current eight-scene tour", () => {
    const retired = new Set(ONBOARDING_SCENES.map((scene) => scene.target));
    const targets = DEMO_TASKS.flatMap((task) => task.targets);
    expect(targets.every((target) => !retired.has(target))).toBe(true);
    expect(retired.has("tour-balance-ring")).toBe(true);
    expect(retired.has("tour-transaction-import")).toBe(true);
  });

  it("labels progress as words and keeps the last step as finish", () => {
    expect(demoTaskProgressLabel(2)).toBe("2 z 3");
    expect(demoTaskProgressLabel(2)).not.toContain("/");
    expect(demoTaskPrimaryLabel("cockpit")).toBe("Dalej");
    expect(demoTaskPrimaryLabel("plans")).toBe("Zakończ");
    expect(DEMO_TASK_MUTATES_LEDGER).toBe(false);
  });
});

describe("first-run flow", () => {
  const empty = initialDemoGuideProgress();

  it("shows the introduction only before any data or choice", () => {
    expect(
      shouldShowFirstRun({
        ownTransactionCount: 0,
        ownPlanCount: 0,
        demoActive: false,
        progress: empty,
      })
    ).toBe(true);
  });

  it("stays hidden once the user has their own data, a demo, or a recorded choice", () => {
    expect(
      shouldShowFirstRun({
        ownTransactionCount: 1,
        ownPlanCount: 0,
        demoActive: false,
        progress: empty,
      })
    ).toBe(false);
    expect(
      shouldShowFirstRun({
        ownTransactionCount: 0,
        ownPlanCount: 1,
        demoActive: false,
        progress: empty,
      })
    ).toBe(false);
    expect(
      shouldShowFirstRun({
        ownTransactionCount: 0,
        ownPlanCount: 0,
        demoActive: true,
        progress: empty,
      })
    ).toBe(false);
    expect(
      shouldShowFirstRun({
        ownTransactionCount: 0,
        ownPlanCount: 0,
        demoActive: false,
        progress: skipDemoGuide(empty),
      })
    ).toBe(false);
  });

  it("lets a skipped guide be started again without deleting the choice history itself", () => {
    const skipped = skipDemoGuide(advanceDemoTask(empty, "cockpit"));
    expect(skipped.dismissed).toBe(true);
    expect(skipped.finishedTaskIds).toEqual(["cockpit"]);
    expect(restartDemoGuide()).toEqual(empty);
  });

  it("advances a skipped or finished task without requiring the click", () => {
    const afterSkip = advanceDemoTask(empty, "cockpit");
    expect(nextDemoTask(afterSkip)?.id).toBe("transactions");
    const done = advanceDemoTask(advanceDemoTask(afterSkip, "transactions"), "plans");
    expect(done.completed).toBe(true);
    expect(nextDemoTask(done)).toBeNull();
    expect(done.dismissed).toBe(false);
  });

  it("uses a bottom tip on a narrow or zoomed viewport and drops a missing spotlight", () => {
    expect(demoTipPlacement(320)).toBe("bottom");
    expect(demoTipPlacement(640)).toBe("bottom");
    expect(demoTipPlacement(1024)).toBe("beside");
    const cockpit = DEMO_TASKS[0]!;
    expect(demoTaskSpotlight(cockpit, new Set(["demo-month-filter"]))).toEqual([
      "demo-month-filter",
    ]);
    expect(demoTaskSpotlight(cockpit, new Set(["tour-balance-ring"]))).toEqual([]);
  });
});

describe("demo dataset contract", () => {
  it("records that the current showcase cannot run the three tasks", () => {
    const current = snapshotFromTransactionSeeds(buildDemoTransactionSeeds(new Date(2026, 9, 11)), {
      openingBalance: null,
      clearCanRestoreOpeningBalance: false,
      spendPlans: [],
    });
    expect(demoDatasetGaps(current)).toEqual(["opening-balance", "spend-plan", "forecast"]);
    expect(current.incomes).toBeGreaterThan(0);
    expect(current.expenses).toBeGreaterThan(0);
    expect(current.upcomingExpenses).toBeGreaterThan(0);
  });

  it("accepts a showcase with an anchor, history, an upcoming payment, and a partial trip", () => {
    const ready = snapshotFromTransactionSeeds(buildDemoTransactionSeeds(new Date(2026, 9, 11)), {
      openingBalance: 8_400,
      clearCanRestoreOpeningBalance: true,
      spendPlans: [{ itemCount: 2, paidAmount: 1_000, remainder: 3_000 }],
    });
    expect(demoDatasetGaps(ready)).toEqual([]);
  });

  it("rejects a fully paid trip and an anchor that clearing cannot restore", () => {
    const paidOff = snapshotFromTransactionSeeds([], {
      openingBalance: 8_400,
      clearCanRestoreOpeningBalance: true,
      spendPlans: [{ itemCount: 2, paidAmount: 4_000, remainder: 0 }],
    });
    expect(demoDatasetGaps(paidOff)).toContain("spend-plan");
    expect(
      demoOpeningBalanceDecision({
        hasPrivateAnchor: false,
        clearCanRestoreOpeningBalance: false,
      })
    ).toBe("skip");
    expect(
      demoOpeningBalanceDecision({
        hasPrivateAnchor: true,
        clearCanRestoreOpeningBalance: true,
      })
    ).toBe("skip");
    expect(
      demoOpeningBalanceDecision({
        hasPrivateAnchor: false,
        clearCanRestoreOpeningBalance: true,
      })
    ).toBe("seed");
  });

  it("clears tagged demo rows and demo occurrences, and leaves the user's rows", () => {
    expect(isClearedWithDemo({ isDemo: true })).toBe(true);
    expect(isClearedWithDemo({ isDemo: false, recurringTemplateIsDemo: true })).toBe(true);
    expect(isClearedWithDemo({ isDemo: false })).toBe(false);
    expect(isClearedWithDemo({ isDemo: false, recurringTemplateIsDemo: false })).toBe(false);
  });
});
