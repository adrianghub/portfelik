import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session, User } from "@supabase/supabase-js";

const storage = vi.hoisted(() => ({ flush: vi.fn() }));
vi.mock("$lib/auth/device-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("$lib/auth/device-storage")>()),
  flushDeviceAuthStorage: storage.flush,
}));

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
  DEMO_BINDING_KEY,
  PENDING_ACCOUNT_SWITCH_KEY,
  REAL_SESSION_STORAGE_KEY,
  parkInactiveSession,
  peekPendingAccountSwitch,
  readParkedSession,
} from "../../src/lib/demo/identity-session";
import {
  bootstrapPendingAccountSwitch,
  requestAccountSwitch,
  requestAccountEntry,
  closeDemo,
  openDemoAccount,
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
    key: (index: number) => Array.from(store.keys())[index] ?? null,
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
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    installMemoryLocalStorage();
    setSession.mockReset();
    getSession.mockReset();
    verifyOtp.mockReset();
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
    assign.mockReset();
    storage.flush.mockReset().mockResolvedValue(undefined);
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

  it("reuses a parked demo instead of entering new provisioning", async () => {
    parkInactiveSession(sessionFor("demo", "demo-1"));
    getSession.mockResolvedValue({ data: { session: sessionFor("real", "real-1") } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await requestAccountEntry("demo")).ok).toBe(true);
    expect(assign).toHaveBeenCalledWith("/dashboard");
    expect(peekPendingAccountSwitch()?.kind).toBe("demo");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("closes and resumes the same demo without revoking it or provisioning another", async () => {
    const demo = sessionFor("demo", "demo-1");
    getSession.mockResolvedValue({ data: { session: demo } });
    parkInactiveSession(sessionFor("real", "real-1"));
    localStorage.setItem("sb-staging-auth-token", JSON.stringify(demo));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await closeDemo();
    expect(assign).toHaveBeenLastCalledWith("/login");
    expect(localStorage.getItem("sb-staging-auth-token")).toBeNull();
    expect(readParkedSession("demo")?.user.id).toBe("demo-1");
    expect(readParkedSession("real")).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
    getSession.mockResolvedValue({ data: { session: null } });
    expect((await openDemoAccount()).ok).toBe(true);
    expect(peekPendingAccountSwitch()?.refresh_token).toBe("demo-refresh");
    expect(assign).toHaveBeenLastCalledWith("/dashboard");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not provision when an existing binding lost its credential", async () => {
    localStorage.setItem(DEMO_BINDING_KEY, "demo-1");
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(await openDemoAccount()).toEqual({ ok: false, error: "demo_session_failed" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not provision after a bound demo refresh is rejected", async () => {
    parkInactiveSession(sessionFor("demo", "demo-1"));
    getSession.mockResolvedValue({ data: { session: null } });
    setSession.mockResolvedValue({ data: { session: null }, error: { message: "revoked" } });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    await openDemoAccount();
    expect(await bootstrapPendingAccountSwitch()).toMatchObject({ applied: false });
    expect(await openDemoAccount()).toEqual({ ok: false, error: "demo_session_failed" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a refreshed identity that differs from the bound demo", async () => {
    parkInactiveSession(sessionFor("demo", "demo-1"));
    getSession.mockResolvedValue({ data: { session: null } });
    await requestAccountSwitch("demo");
    setSession.mockResolvedValue({
      data: { session: sessionFor("demo", "other-demo") },
      error: null,
    });
    expect(await bootstrapPendingAccountSwitch()).toMatchObject({ applied: false });
    expect(localStorage.getItem(DEMO_BINDING_KEY)).toBe("demo-1");
    expect(readParkedSession("demo")).toBeNull();
  });

  it("binds a newly provisioned identity even when OTP verification fails", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tokenHash: "one-time-test-token",
          userId: "demo-1",
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "expired" } });
    expect(await openDemoAccount()).toEqual({ ok: false, error: "demo_session_failed" });
    expect(await openDemoAccount()).toEqual({ ok: false, error: "demo_session_failed" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("waits for durable native binding storage before redeeming the OTP", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            tokenHash: "one-time-test-token",
            userId: "demo-1",
          }),
          { status: 200 }
        )
      )
    );
    verifyOtp.mockResolvedValue({ data: { session: sessionFor("demo", "demo-1") }, error: null });
    let completeWrite!: () => void;
    storage.flush.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        completeWrite = resolve;
      })
    );

    const opening = openDemoAccount({ reinit: false });
    await vi.waitFor(() => expect(storage.flush).toHaveBeenCalledOnce());
    expect(localStorage.getItem(DEMO_BINDING_KEY)).toBe("demo-1");
    expect(verifyOtp).not.toHaveBeenCalled();
    completeWrite();
    await expect(opening).resolves.toMatchObject({ ok: true, kind: "demo" });
    expect(verifyOtp).toHaveBeenCalledOnce();
  });

  it("does not confirm or provision another identity when the native binding write fails", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          tokenHash: "one-time-test-token",
          userId: "demo-1",
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);
    storage.flush.mockRejectedValueOnce(new Error("auth_vault_write_failed"));

    await expect(openDemoAccount({ reinit: false })).resolves.toEqual({
      ok: false,
      error: "demo_session_failed",
    });
    await expect(openDemoAccount({ reinit: false })).resolves.toEqual({
      ok: false,
      error: "demo_session_failed",
    });
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it("parks the real session and enters Turnstile when no demo session exists", async () => {
    getSession.mockResolvedValue({ data: { session: sessionFor("real", "real-1") } });
    expect((await requestAccountEntry("demo")).ok).toBe(true);
    expect(assign).toHaveBeenCalledWith("/login?account=demo");
    expect(readParkedSession("real")?.user.id).toBe("real-1");
    expect(peekPendingAccountSwitch()).toBeNull();
    expect(setSession).not.toHaveBeenCalled();
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
