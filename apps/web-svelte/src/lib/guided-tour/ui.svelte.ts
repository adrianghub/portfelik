/** Reactive tour UI flags — updated by GuidedTourHost. */
export const guidedTourUi = $state({
  running: false,
  hideFirstPeriodHint: false,
  currentSceneId: null as string | null,
  /** Bumped to reset tour state and reopen the welcome dialog. */
  restartNonce: 0,
  /** Bumped to seed demo (if needed) and start the guided tour. */
  demoNonce: 0,
});

export function requestGuidedTourRestart(): void {
  guidedTourUi.restartNonce += 1;
}

export function requestDemoSeedAndTour(): void {
  guidedTourUi.demoNonce += 1;
}

export function isGuidedTourScene(sceneId: string): boolean {
  return guidedTourUi.running && guidedTourUi.currentSceneId === sceneId;
}
