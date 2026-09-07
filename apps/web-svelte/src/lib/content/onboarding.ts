/**
 * Onboarding manifest — single place to adjust tour order, demo panel sections, and
 * which Paraglide keys power each dialog.
 *
 * Copy text: edit matching keys in `messages/pl.json` (`tour_*`, `demo_*`).
 * Structure (order, routes, spotlight targets, which buttons show): edit here.
 */
import * as m from "$lib/paraglide/messages";

export type TourChapterId = "dashboard" | "transactions" | "plans" | "settings";

export interface OnboardingSceneManifest {
  id: string;
  chapter: TourChapterId;
  /** Pathname + optional search, e.g. `/settings?tab=profile` */
  route: string;
  /** `data-tour-id` on the highlighted element */
  target: string;
}

/** Chapter lights order in the tour chrome. */
export const ONBOARDING_CHAPTER_ORDER: TourChapterId[] = [
  "dashboard",
  "transactions",
  "plans",
  "settings",
];

/** Tour scenes in walk order. Reorder, add, or remove entries here. */
export const ONBOARDING_SCENES: OnboardingSceneManifest[] = [
  { id: "1.1", chapter: "dashboard", route: "/dashboard", target: "tour-balance-ring" },
  { id: "1.2", chapter: "dashboard", route: "/dashboard", target: "tour-dashboard-actions" },
  { id: "1.3", chapter: "dashboard", route: "/dashboard", target: "tour-spending-insight" },
  { id: "2.1", chapter: "transactions", route: "/transactions", target: "tour-transaction-table" },
  { id: "2.3", chapter: "transactions", route: "/transactions", target: "tour-transaction-import" },
  { id: "3.1", chapter: "plans", route: "/plans", target: "tour-net-worth" },
  { id: "3.2", chapter: "plans", route: "/plans", target: "tour-plan-save" },
  { id: "4.3", chapter: "settings", route: "/settings", target: "tour-settings-finance" },
];

export type DemoWalkthroughActionId = "clear" | "load" | "load_and_tour" | "restart_tour";

export type DemoWalkthroughActionWhen = "demo_active" | "no_demo" | "always";

export interface DemoWalkthroughActionManifest {
  id: DemoWalkthroughActionId;
  when: DemoWalkthroughActionWhen;
  variant?: "default" | "accent";
}

/** Settings → Profil panel actions (order + visibility). */
export const DEMO_WALKTHROUGH_ACTIONS: DemoWalkthroughActionManifest[] = [
  { id: "clear", when: "demo_active" },
  { id: "load", when: "no_demo" },
  { id: "load_and_tour", when: "no_demo", variant: "accent" },
  { id: "restart_tour", when: "always" },
];

export type DemoBannerActionId = "restart_tour" | "clear" | "import" | "settings";

/** Dashboard demo banner actions (left-to-right order). */
export const DEMO_BANNER_ACTIONS: DemoBannerActionId[] = [
  "restart_tour",
  "clear",
  "import",
  "settings",
];

const ONBOARDING_SCENE_COPY: Record<string, () => string> = {
  "1.1": m.tour_scene_1_1,
  "1.2": m.tour_scene_1_2,
  "1.3": m.tour_scene_1_3,
  "2.1": m.tour_scene_2_1,
  "2.3": m.tour_scene_2_3,
  "3.1": m.tour_scene_3_1,
  "3.2": m.tour_scene_3_2,
  "4.3": m.tour_scene_4_3,
};

const ONBOARDING_CHAPTER_COPY: Record<TourChapterId, () => string> = {
  dashboard: m.tour_chapter_dashboard,
  transactions: m.tour_chapter_transactions,
  plans: m.tour_chapter_plans,
  settings: m.tour_chapter_settings,
};

export function tourSceneBody(sceneId: string): string {
  return ONBOARDING_SCENE_COPY[sceneId]?.() ?? "";
}

export function tourChapterLabel(chapter: TourChapterId): string {
  return ONBOARDING_CHAPTER_COPY[chapter]();
}

export function onboardingWelcomeCopy() {
  return {
    title: m.tour_welcome_title(),
    body: m.tour_welcome_body(),
    demo: m.tour_welcome_demo(),
    skip: m.tour_welcome_import(),
    points: [
      m.tour_welcome_point_control(),
      m.tour_welcome_point_plans(),
      m.tour_welcome_point_calm(),
    ],
  };
}

export function onboardingExitCopy() {
  return {
    body: m.tour_exit_body(),
    import: m.tour_exit_import(),
    keepDemo: m.tour_exit_keep_demo(),
  };
}

export function onboardingChromeCopy() {
  return {
    chapterLabel: m.tour_chapter_label(),
    back: m.tour_back(),
    skip: m.tour_skip(),
    next: m.tour_next(),
    finish: m.tour_finish(),
  };
}

export function demoWalkthroughPanelCopy() {
  return {
    title: m.demo_walkthrough_title(),
    body: m.demo_walkthrough_body(),
    statusActive: m.demo_status_active(),
    statusNone: m.demo_status_none(),
  };
}

export function demoBannerCopy() {
  return {
    title: m.demo_banner_title(),
    body: m.demo_banner_body(),
  };
}

export function demoWalkthroughActionLabel(id: DemoWalkthroughActionId): string {
  switch (id) {
    case "clear":
      return m.demo_settings_clear();
    case "load":
      return m.demo_settings_load();
    case "load_and_tour":
      return m.demo_walkthrough_load_and_tour();
    case "restart_tour":
      return m.demo_walkthrough_restart();
  }
}

export function demoBannerActionLabel(id: DemoBannerActionId): string {
  switch (id) {
    case "restart_tour":
      return m.demo_banner_restart_tour();
    case "clear":
      return m.demo_banner_clear();
    case "import":
      return m.demo_banner_import();
    case "settings":
      return m.demo_banner_settings();
  }
}

export function demoBannerActionHref(id: DemoBannerActionId): string | undefined {
  switch (id) {
    case "import":
      return "/import";
    case "settings":
      return "/settings?tab=profile";
    default:
      return undefined;
  }
}

export function demoWalkthroughActionsVisible(
  ctx: { demoActive: boolean },
  actions: DemoWalkthroughActionManifest[] = DEMO_WALKTHROUGH_ACTIONS
): DemoWalkthroughActionManifest[] {
  return actions.filter((action) => {
    if (action.when === "always") return true;
    if (action.when === "demo_active") return ctx.demoActive;
    return !ctx.demoActive;
  });
}

/** Paraglide key for a scene body (`tour_scene_1_1` for scene `1.1`). */
export function tourSceneMessageKey(sceneId: string): string {
  return `tour_scene_${sceneId.replace(".", "_")}`;
}

export function validateOnboardingManifest(): string[] {
  const errors: string[] = [];
  const sceneIds = new Set<string>();

  for (const scene of ONBOARDING_SCENES) {
    if (sceneIds.has(scene.id)) {
      errors.push(`duplicate scene id: ${scene.id}`);
    }
    sceneIds.add(scene.id);

    if (!ONBOARDING_CHAPTER_ORDER.includes(scene.chapter)) {
      errors.push(`scene ${scene.id} references unknown chapter ${scene.chapter}`);
    }
    if (!ONBOARDING_SCENE_COPY[scene.id]) {
      errors.push(`scene ${scene.id} missing copy mapping in ONBOARDING_SCENE_COPY`);
    }
  }

  for (const chapter of ONBOARDING_CHAPTER_ORDER) {
    if (!ONBOARDING_CHAPTER_COPY[chapter]) {
      errors.push(`chapter ${chapter} missing copy mapping`);
    }
  }

  const chaptersWithScenes = new Set(ONBOARDING_SCENES.map((s) => s.chapter));
  for (const chapter of ONBOARDING_CHAPTER_ORDER) {
    if (!chaptersWithScenes.has(chapter)) {
      errors.push(`chapter ${chapter} has no scenes`);
    }
  }

  return errors;
}
