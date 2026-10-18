import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";

const setSession = vi.fn();
const getSession = vi.fn();
const verifyOtp = vi.fn();
const signOut = vi.fn();
const assign = vi.fn();

vi.mock("$lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => getSession(...args),
      setSession: (...args: unknown[]) => setSession(...args),
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
      signOut: (...args: unknown[]) => signOut(...args),
    },
  },
}));

vi.mock("$env/static/public", () => ({
  PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  PUBLIC_SUPABASE_ANON_KEY: "anon-key",
}));

import {
  DEMO_SESSION_STORAGE_KEY,
  PENDING_ACCOUNT_SWITCH_KEY,
  REAL_SESSION_STORAGE_KEY,
  parkInactiveSession,
  peekPendingAccountSwitch,
  readParkedSession,
} from "../../src/lib/demo/identity-session";
import {
  bootstrapPendingAccountSwitch,
  requestAccountSwitch,
} from "../../src/lib/services/open-demo-account";

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

function user(kind: "demo" | "real", id: string): User {
  return {
    id,
    app_metadata: kind === "demo" ? { account_kind: "demo" } : { provider: "email" },
    user_metadata: {},
    aud: "authenticated",
    created_at: "",
  } as User;
}

function sessionFor(kind: "demo" | "real", id: string): Session {
  return {
    access_token: `${kind}-access`,
    refresh_token: `${kind}-refresh`,
    token_type: "bearer",
    expires_in: 3600,
    user: user(kind, id),
  } as Session;
}

describe("account switch hard reinit", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    setSession.mockReset();
    getSession.mockReset();
    verifyOtp.mockReset();
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
    assign.mockReset();
    vi.stubGlobal("window", { location: { assign } });
  });

  it("queues pending switch, parks current, clears GoTrue storage, and hard-navigates", async () => {
    parkInactiveSession(sessionFor("real", "real-1"));
    getSession.mockResolvedValue({ data: { session: sessionFor("demo", "demo-1") } });
    localStorage.setItem(
      "sb-emqzcygfwcvbmhxhfkcc-auth-token",
      JSON.stringify(sessionFor("demo", "demo-1"))
    );

    const result = await requestAccountSwitch("real");

    expect(result.ok).toBe(true);
    expect(setSession).not.toHaveBeenCalled();
    expect(peekPendingAccountSwitch()).toEqual({
      kind: "real",
      access_token: "real-access",
      refresh_token: "real-refresh",
    });
    expect(readParkedSession("demo")?.access_token).toBe("demo-access");
    expect(localStorage.getItem("sb-emqzcygfwcvbmhxhfkcc-auth-token")).toBeNull();
    expect(localStorage.getItem("jakstoimy.auth.reinit.v1")).toBe("1");
    expect(assign).toHaveBeenCalledWith("/dashboard");
  });

  it("bootstrap applies pending session then drops active credential copies", async () => {
    parkInactiveSession(sessionFor("real", "real-1"));
    localStorage.setItem(
      PENDING_ACCOUNT_SWITCH_KEY,
      JSON.stringify({
        kind: "real",
        access_token: "real-access",
        refresh_token: "real-refresh",
      })
    );
    const next = sessionFor("real", "real-1");
    setSession.mockResolvedValue({ data: { session: next }, error: null });

    const result = await bootstrapPendingAccountSwitch();

    expect(result).toMatchObject({ applied: true, kind: "real" });
    expect(setSession).toHaveBeenCalledWith({
      access_token: "real-access",
      refresh_token: "real-refresh",
    });
    expect(localStorage.getItem(PENDING_ACCOUNT_SWITCH_KEY)).toBeNull();
    expect(localStorage.getItem(REAL_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("failed setSession invalidates the parked target and pending payload", async () => {
    parkInactiveSession(sessionFor("demo", "demo-1"));
    localStorage.setItem(
      PENDING_ACCOUNT_SWITCH_KEY,
      JSON.stringify({
        kind: "demo",
        access_token: "demo-access",
        refresh_token: "expired",
      })
    );
    setSession.mockResolvedValue({ data: { session: null }, error: { message: "invalid" } });

    const result = await bootstrapPendingAccountSwitch();

    expect(result).toMatchObject({ applied: false, error: "demo_session_failed", kind: "demo" });
    expect(localStorage.getItem(PENDING_ACCOUNT_SWITCH_KEY)).toBeNull();
    expect(localStorage.getItem(DEMO_SESSION_STORAGE_KEY)).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });
});
