import { session } from "$lib/auth/session.svelte";
import {
  consumeDemoRequest,
  finishDemoRequest,
  requestDemo,
  type DemoRequestState,
} from "$lib/guided-tour/demo-request";

/** Reactive tour UI flags — updated by GuidedTourHost. */
export const guidedTourUi = $state({
  running: false,
  hideFirstPeriodHint: false,
  currentSceneId: null as string | null,
  /** Bumped to reset tour state and reopen the welcome dialog. */
  restartNonce: 0,
  /** Bumped to seed demo (if needed) and start the guided tour. */
  demoNonce: 0,
  demoRequestUserId: null as string | null,
  demoBusy: false,
});

function demoState(): DemoRequestState {
  return {
    nonce: guidedTourUi.demoNonce,
    userId: guidedTourUi.demoRequestUserId,
    busy: guidedTourUi.demoBusy,
  };
}

function applyDemoState(next: DemoRequestState): void {
  guidedTourUi.demoNonce = next.nonce;
  guidedTourUi.demoRequestUserId = next.userId;
  guidedTourUi.demoBusy = next.busy;
}

export function requestGuidedTourRestart(): void {
  guidedTourUi.restartNonce += 1;
}

export function takeGuidedTourRestart(): boolean {
  if (guidedTourUi.restartNonce === 0) return false;
  guidedTourUi.restartNonce = 0;
  return true;
}

export function requestDemoSeedAndTour(): void {
  applyDemoState(requestDemo(demoState(), session.userId));
}

export function takeDemoSeedRequest(currentUserId: string | null): boolean {
  const result = consumeDemoRequest(demoState(), currentUserId);
  applyDemoState(result.state);
  return result.shouldSeed;
}

export function finishDemoSeedRequest(): void {
  applyDemoState(finishDemoRequest(demoState()));
}

export function isGuidedTourScene(sceneId: string): boolean {
  return guidedTourUi.running && guidedTourUi.currentSceneId === sceneId;
}
