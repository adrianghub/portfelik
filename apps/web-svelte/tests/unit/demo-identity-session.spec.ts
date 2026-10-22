import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_ACCOUNT_KIND_KEY,
  DEMO_BINDING_KEY,
  DEMO_SESSION_STORAGE_KEY,
  PENDING_ACCOUNT_SWITCH_KEY,
  REAL_SESSION_STORAGE_KEY,
  accountKindForUser,
  clearAllIdentitySessionState,
  clearPendingAccountSwitch,
  consumePendingAccountSwitch,
  hasParkedSession,
  forgetDemoAccess,
  hasDemoBinding,
  isDemoAccountUser,
  parkInactiveSession,
  peekPendingAccountSwitch,
  readParkedSession,
  writePendingAccountSwitch,
} from "../../src/lib/demo/identity-session";
import { dismissHint, emptyHintState, pickActiveHint } from "../../src/lib/demo/hints";
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
    app_metadata: kind === "demo" ? { account_kind: "demo" } : { provider: "email" },
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

  it("parks only inactive identities in separate keys", () => {
    parkInactiveSession(sessionFor("real"));
    parkInactiveSession(sessionFor("demo"));
    expect(readParkedSession("real")?.access_token).toBe("real-access");
    expect(readParkedSession("demo")?.access_token).toBe("demo-access");
    expect(localStorage.getItem(REAL_SESSION_STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(DEMO_SESSION_STORAGE_KEY)).toBeTruthy();
  });

  it("pending switch is one-shot and cleared on consume", () => {
    writePendingAccountSwitch({
      kind: "real",
      access_token: "a",
      refresh_token: "r",
    });
    expect(peekPendingAccountSwitch()?.kind).toBe("real");
    expect(consumePendingAccountSwitch()?.refresh_token).toBe("r");
    expect(peekPendingAccountSwitch()).toBeNull();
    expect(localStorage.getItem(PENDING_ACCOUNT_SWITCH_KEY)).toBeNull();
  });

  it("clearAllIdentitySessionState drops parked sessions and pending switch", () => {
    parkInactiveSession(sessionFor("demo"));
    parkInactiveSession(sessionFor("real"));
    writePendingAccountSwitch({
      kind: "demo",
      access_token: "a",
      refresh_token: "r",
    });
    localStorage.setItem(ACTIVE_ACCOUNT_KIND_KEY, "demo");
    clearAllIdentitySessionState();
    expect(hasParkedSession("demo")).toBe(false);
    expect(hasParkedSession("real")).toBe(false);
    expect(peekPendingAccountSwitch()).toBeNull();
    expect(localStorage.getItem(ACTIVE_ACCOUNT_KIND_KEY)).toBeNull();
  });

  it("clearPending alone does not wipe parked identities", () => {
    parkInactiveSession(sessionFor("real"));
    writePendingAccountSwitch({
      kind: "real",
      access_token: "a",
      refresh_token: "r",
    });
    clearPendingAccountSwitch();
    expect(hasParkedSession("real")).toBe(true);
  });

  it("real logout preserves only the separate demo, while revocation retains its identity marker", () => {
    parkInactiveSession(sessionFor("demo"));
    parkInactiveSession(sessionFor("real"));
    clearAllIdentitySessionState({ preserveDemo: true });
    expect(hasParkedSession("demo")).toBe(true);
    expect(hasParkedSession("real")).toBe(false);
    clearAllIdentitySessionState();
    expect(hasParkedSession("demo")).toBe(false);
    expect(localStorage.getItem(DEMO_BINDING_KEY)).toBe("u1");
  });

  it("explicitly forgetting demo removes its binding and pending restore, preserving real credentials", () => {
    parkInactiveSession(sessionFor("demo"));
    parkInactiveSession(sessionFor("real"));
    writePendingAccountSwitch({ kind: "demo", access_token: "d", refresh_token: "r" });
    forgetDemoAccess();
    expect(hasDemoBinding()).toBe(false);
    expect(readParkedSession("demo")).toBeNull();
    expect(peekPendingAccountSwitch()).toBeNull();
    expect(readParkedSession("real")?.refresh_token).toBe("real-refresh");
  });

  it("forgetting demo does not cancel a pending real-account switch", () => {
    parkInactiveSession(sessionFor("demo"));
    writePendingAccountSwitch({ kind: "real", access_token: "a", refresh_token: "r" });
    forgetDemoAccess();
    expect(hasDemoBinding()).toBe(false);
    expect(peekPendingAccountSwitch()?.kind).toBe("real");
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
