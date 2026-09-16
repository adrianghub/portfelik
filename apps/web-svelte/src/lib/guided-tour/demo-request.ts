export interface DemoRequestState {
  nonce: number;
  userId: string | null;
  busy: boolean;
}

export function requestDemo(state: DemoRequestState, userId: string | null): DemoRequestState {
  if (state.busy || !userId) return state;
  return { nonce: state.nonce + 1, userId, busy: true };
}

export function consumeDemoRequest(
  state: DemoRequestState,
  currentUserId: string | null
): { state: DemoRequestState; shouldSeed: boolean } {
  if (state.nonce === 0) return { state, shouldSeed: false };
  const shouldSeed = Boolean(currentUserId && state.userId === currentUserId);
  return {
    state: { nonce: 0, userId: null, busy: shouldSeed },
    shouldSeed,
  };
}

export function finishDemoRequest(_state: DemoRequestState): DemoRequestState {
  return { nonce: 0, userId: null, busy: false };
}
