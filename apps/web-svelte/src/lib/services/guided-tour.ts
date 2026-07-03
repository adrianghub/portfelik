import type { ProfileSettings } from "$lib/types";
import {
  ONBOARDING_CHAPTER_ORDER,
  ONBOARDING_SCENES,
  type TourChapterId,
} from "$lib/content/onboarding";

export type { TourChapterId };

export type GuidedTourPath = "demo" | "import";

export interface GuidedTourProgress {
  dismissed?: boolean;
  completedSceneIds?: string[];
  path?: GuidedTourPath;
  completedAt?: string;
}

export interface GuidedTourScene {
  id: string;
  chapter: TourChapterId;
  /** Pathname + optional search, e.g. `/settings?tab=profile` */
  route: string;
  /** `data-tour-id` on the highlighted element */
  target: string;
}

export const TOUR_CHAPTERS: TourChapterId[] = ONBOARDING_CHAPTER_ORDER;

export const TOUR_SCENES: GuidedTourScene[] = ONBOARDING_SCENES;

const LS_MIRROR = "guided-tour-progress";

export function readGuidedTourProgress(settings: ProfileSettings | undefined): GuidedTourProgress {
  // Profile is source of truth once loaded. Stale localStorage must not block welcome
  // after `supabase db reset` or a new device session.
  if (settings === undefined) {
    return readGuidedTourProgressLocal();
  }
  const raw = settings.guidedTour;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as GuidedTourProgress;
  }
  return {};
}

export function readGuidedTourProgressLocal(): GuidedTourProgress {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_MIRROR);
    if (!raw) return {};
    return JSON.parse(raw) as GuidedTourProgress;
  } catch {
    return {};
  }
}

export function writeGuidedTourProgressLocal(progress: GuidedTourProgress): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(LS_MIRROR, JSON.stringify(progress));
  } catch {
    // private mode etc.
  }
}

export function mergeGuidedTourProgress(
  current: GuidedTourProgress,
  patch: Partial<GuidedTourProgress>
): GuidedTourProgress {
  const completedSceneIds = patch.completedSceneIds
    ? [...new Set([...(current.completedSceneIds ?? []), ...patch.completedSceneIds])]
    : current.completedSceneIds;
  return {
    ...current,
    ...patch,
    completedSceneIds,
  };
}

export function isGuidedTourComplete(progress: GuidedTourProgress): boolean {
  if (progress.dismissed || progress.completedAt) return true;
  const done = new Set(progress.completedSceneIds ?? []);
  return TOUR_SCENES.every((scene) => done.has(scene.id));
}

export type GuidedTourStatus = "not_started" | "in_progress" | "completed" | "dismissed";

export function guidedTourStatus(settings: ProfileSettings | undefined): GuidedTourStatus {
  const tour = readGuidedTourProgress(settings);
  if (tour.dismissed && !tour.completedAt) return "dismissed";
  if (isGuidedTourComplete(tour)) return "completed";
  if ((tour.completedSceneIds?.length ?? 0) > 0) return "in_progress";
  return "not_started";
}

export function shouldOfferWelcomeTour(settings: ProfileSettings | undefined): boolean {
  const tour = readGuidedTourProgress(settings);
  if (tour.dismissed || isGuidedTourComplete(tour)) return false;
  if ((tour.completedSceneIds?.length ?? 0) > 0) return false;
  return true;
}

export function shouldResumeGuidedTour(settings: ProfileSettings | undefined): boolean {
  const tour = readGuidedTourProgress(settings);
  if (tour.dismissed || isGuidedTourComplete(tour)) return false;
  return (tour.completedSceneIds?.length ?? 0) > 0;
}

export function firstIncompleteSceneIndex(progress: GuidedTourProgress): number {
  const done = new Set(progress.completedSceneIds ?? []);
  const idx = TOUR_SCENES.findIndex((scene) => !done.has(scene.id));
  return idx === -1 ? TOUR_SCENES.length - 1 : idx;
}

export function sceneAt(index: number): GuidedTourScene | null {
  if (index < 0 || index >= TOUR_SCENES.length) return null;
  return TOUR_SCENES[index]!;
}

export function chapterIndex(chapter: TourChapterId): number {
  return TOUR_CHAPTERS.indexOf(chapter);
}

export function sceneBodyKey(sceneId: string): string {
  return `tour_scene_${sceneId.replace(".", "_")}`;
}

export function sceneRouteParts(route: string): { pathname: string; search: string } {
  const q = route.indexOf("?");
  if (q === -1) return { pathname: route, search: "" };
  return { pathname: route.slice(0, q), search: route.slice(q) };
}

export function routesMatch(
  currentPath: string,
  currentSearch: string,
  sceneRoute: string
): boolean {
  const { pathname, search } = sceneRouteParts(sceneRoute);
  if (currentPath !== pathname) return false;
  if (!search) return true;
  const expected = new URLSearchParams(search);
  const actual = new URLSearchParams(
    currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch
  );
  for (const [key, value] of expected.entries()) {
    if (actual.get(key) !== value) return false;
  }
  return true;
}

export function dismissGuidedTour(progress: GuidedTourProgress): GuidedTourProgress {
  return { ...progress, dismissed: true };
}

export function completeGuidedTour(progress: GuidedTourProgress): GuidedTourProgress {
  return {
    ...progress,
    completedAt: new Date().toISOString(),
    completedSceneIds: TOUR_SCENES.map((s) => s.id),
  };
}

export function advanceGuidedTour(
  progress: GuidedTourProgress,
  sceneId: string
): GuidedTourProgress {
  return mergeGuidedTourProgress(progress, {
    completedSceneIds: [sceneId],
  });
}
