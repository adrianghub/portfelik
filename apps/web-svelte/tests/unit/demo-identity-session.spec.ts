import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEMO_SESSION_STORAGE_KEY,
  REAL_SESSION_STORAGE_KEY,
  accountKindForUser,
  clearPartitionedSession,
  isDemoAccountUser,
  persistPartitionedSession,
  readPartitionedSession,
} from "../../src/lib/demo/identity-session";
import {
  dismissHint,
  emptyHintState,
  pickActiveHint,
} from "../../src/lib/demo/hints";
import type { Session, User } from "@supabase/supabase-js";

function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: () => null,
    get length() {
      return store.size;
    },
  } satisfies Storage);
}

function user(kind: "demo" | "real", id = "u1"): User {
  return {
    id,
    app_metadata: { account_kind: kind },
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

function sessionFor(kind: "demo" | "real"): Session {
  return {
    access_token: `${kind}-access`,
    refresh_token: `${kind}-refresh`,
    token_type: "bearer",
    expires_in: 3600,
    user: user(kind),
  } as Session;
}

describe("demo identity session partition", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("detects demo vs real from app_metadata", () => {
    expect(isDemoAccountUser(user("demo"))).toBe(true);
    expect(isDemoAccountUser(user("real"))).toBe(false);
    expect(accountKindForUser(user("demo"))).toBe("demo");
  });

  it("stores demo and real sessions separately", () => {
    persistPartitionedSession(sessionFor("real"));
    persistPartitionedSession(sessionFor("demo"));
    expect(readPartitionedSession("real")?.access_token).toBe("real-access");
    expect(readPartitionedSession("demo")?.access_token).toBe("demo-access");
    expect(localStorage.getItem(REAL_SESSION_STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(DEMO_SESSION_STORAGE_KEY)).toBeTruthy();
    clearPartitionedSession("demo");
    expect(readPartitionedSession("demo")).toBeNull();
    expect(readPartitionedSession("real")?.access_token).toBe("real-access");
  });
});

describe("demo hints", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });

  it("shows at most the import hint on an empty demo ledger", () => {
    expect(
      pickActiveHint({
        userId: "d1",
        isDemo: true,
        ledgerEmpty: true,
        hasCommittedImport: false,
        onForecastSurface: false,
      })
    ).toBe("import_csv");
  });

  it("does not show hints for real accounts", () => {
    expect(
      pickActiveHint({
        userId: "r1",
        isDemo: false,
        ledgerEmpty: true,
        hasCommittedImport: false,
        onForecastSurface: false,
      })
    ).toBeNull();
  });

  it("hides a dismissed hint", () => {
    dismissHint("d1", "import_csv");
    expect(
      pickActiveHint({
        userId: "d1",
        isDemo: true,
        ledgerEmpty: true,
        hasCommittedImport: false,
        onForecastSurface: false,
      })
    ).toBeNull();
    expect(emptyHintState().import_csv.dismissed).toBe(false);
  });
});
