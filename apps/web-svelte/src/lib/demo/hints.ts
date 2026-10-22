/**
 * At most three optional Demo 2.0 hints. Never block navigation or force routes.
 * Persist only dismissed/seen flags per demo identity.
 */

export type DemoHintId = "import_csv" | "open_analyses" | "confirm_balance";

export const DEMO_HINT_IDS: readonly DemoHintId[] = [
  "import_csv",
  "open_analyses",
  "confirm_balance",
] as const;

const storageKey = (userId: string) => `jakstoimy.demo.hints.v1:${userId}`;

export type DemoHintState = Record<DemoHintId, { seen: boolean; dismissed: boolean }>;

export function emptyHintState(): DemoHintState {
  return {
    import_csv: { seen: false, dismissed: false },
    open_analyses: { seen: false, dismissed: false },
    confirm_balance: { seen: false, dismissed: false },
  };
}

export function loadHintState(userId: string): DemoHintState {
  if (typeof localStorage === "undefined") return emptyHintState();
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return emptyHintState();
    return { ...emptyHintState(), ...(JSON.parse(raw) as DemoHintState) };
  } catch {
    return emptyHintState();
  }
}

export function saveHintState(userId: string, state: DemoHintState): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(storageKey(userId), JSON.stringify(state));
}

export function dismissHint(userId: string, id: DemoHintId): DemoHintState {
  const state = loadHintState(userId);
  state[id] = { seen: true, dismissed: true };
  saveHintState(userId, state);
  return state;
}

export function markHintSeen(userId: string, id: DemoHintId): DemoHintState {
  const state = loadHintState(userId);
  state[id] = { ...state[id], seen: true };
  saveHintState(userId, state);
  return state;
}

/** Which single hint (if any) to show for the current surface. */
export function pickActiveHint(input: {
  userId: string;
  isDemo: boolean;
  hasCommittedImport: boolean;
  onForecastSurface: boolean;
  ledgerEmpty: boolean;
}): DemoHintId | null {
  if (!input.isDemo) return null;
  const state = loadHintState(input.userId);
  if (input.ledgerEmpty && !state.import_csv.dismissed) return "import_csv";
  if (input.hasCommittedImport && !state.open_analyses.dismissed) return "open_analyses";
  if (input.onForecastSurface && !state.confirm_balance.dismissed) {
    return "confirm_balance";
  }
  return null;
}
