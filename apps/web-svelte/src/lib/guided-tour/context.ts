import { getContext, setContext } from "svelte";

export const GUIDED_TOUR_CONTEXT_KEY = Symbol("guided-tour");

export interface GuidedTourContextValue {
  readonly running: boolean;
  readonly currentSceneId: string | null;
  hideFirstPeriodHint: boolean;
  isSceneActive: (sceneId: string) => boolean;
}

export function setGuidedTourContext(value: GuidedTourContextValue): void {
  setContext(GUIDED_TOUR_CONTEXT_KEY, value);
}

export function useGuidedTour(): GuidedTourContextValue | null {
  return getContext<GuidedTourContextValue | undefined>(GUIDED_TOUR_CONTEXT_KEY) ?? null;
}
