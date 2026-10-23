import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_URL } from "$env/static/public";
import { supabase } from "$lib/supabase";
import { flushDeviceAuthStorage } from "$lib/auth/device-storage";
import {
  accountKindForUser,
  beginAccountSwitchReinit,
  clearGoTrueClientStorage,
  clearParkedSession,
  clearPendingAccountSwitch,
  endAccountSwitchReinit,
  hasParkedSession,
  hasDemoBinding,
  rememberDemoIdentity,
  parkInactiveSession,
  peekPendingAccountSwitch,
  readParkedSession,
  setStoredActiveKind,
  writePendingAccountSwitch,
  type AccountKind,
} from "$lib/demo/identity-session";
import type { Session } from "@supabase/supabase-js";

export type OpenDemoAccountResult =
  | { ok: true; session: Session; kind: AccountKind }
  | { ok: true; switching: true; kind: AccountKind }
  | { ok: false; error: string };

function provisionUrl(): string {
  const base = PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  return `${base}/functions/v1/open-demo-account`;
}

async function hardReinit(path = "/dashboard"): Promise<void> {
  await flushDeviceAuthStorage();
  if (typeof window === "undefined") return;
  window.location.assign(path);
}

/**
 * Opens a dedicated demo Auth identity via Edge (local/staging when enabled).
 * Does not accept caller email/userId. Never logs tokenHash.
 * Parks a real session (if any) then hard-reinits so no prior Query cache survives.
 */
export async function openDemoAccount(input?: {
  turnstileToken?: string;
  /** When false, caller navigates (tests). Default: hard reinit. */
  reinit?: boolean;
}): Promise<OpenDemoAccountResult> {
  // Serialize clicks/tabs so a second caller observes the first identity binding.
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request("jakstoimy.demo.entry", () => openOrResumeDemo(input));
  }
  return openOrResumeDemo(input);
}

async function openOrResumeDemo(input?: {
  turnstileToken?: string;
  reinit?: boolean;
}): Promise<OpenDemoAccountResult> {
  const current = await supabase.auth.getSession();
  if (current.error) return { ok: false, error: "demo_session_failed" };
  if (current.data.session && accountKindForUser(current.data.session.user) === "demo") {
    rememberDemoIdentity(current.data.session.user.id);
    if (input?.reinit !== false) await hardReinit();
    return { ok: true, session: current.data.session, kind: "demo" };
  }
  if (hasParkedSession("demo")) return requestAccountSwitch("demo");
  if (hasDemoBinding()) return { ok: false, error: "demo_session_failed" };
  if (current.data.session) {
    const currentKind = accountKindForUser(current.data.session.user);
    if (currentKind === "real") {
      parkInactiveSession(current.data.session);
    }
  }

  let response: Response;
  try {
    response = await fetch(provisionUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: PUBLIC_SUPABASE_ANON_KEY,
        authorization: `Bearer ${PUBLIC_SUPABASE_ANON_KEY}`,
        ...(input?.turnstileToken ? { "x-turnstile-token": input.turnstileToken } : {}),
      },
      body: JSON.stringify(input?.turnstileToken ? { turnstileToken: input.turnstileToken } : {}),
    });
  } catch {
    return { ok: false, error: "demo_provision_unavailable" };
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    tokenHash?: string;
    verifyType?: string;
    userId?: string;
  };

  if (!response.ok || !payload.tokenHash) {
    return {
      ok: false,
      error: payload.error ?? "demo_provision_failed",
    };
  }

  // Even a failed OTP verification must not silently create another identity.
  if (!payload.userId) return { ok: false, error: "demo_session_failed" };
  rememberDemoIdentity(payload.userId);

  const verified = await supabase.auth.verifyOtp({
    token_hash: payload.tokenHash,
    type: "email",
  });
  if (
    verified.error ||
    !verified.data.session ||
    accountKindForUser(verified.data.session.user) !== "demo" ||
    verified.data.session.user.id !== payload.userId
  ) {
    return { ok: false, error: "demo_session_failed" };
  }

  // Active demo credentials live only in GoTrue storage — no redundant parked copy.
  clearParkedSession("demo");
  setStoredActiveKind("demo");

  if (input?.reinit !== false) {
    await hardReinit("/demo/welcome");
  }
  return { ok: true, session: verified.data.session, kind: "demo" };
}

/** Leave demo locally, keeping its credential for an explicit later resume. */
export async function closeDemo(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session || accountKindForUser(data.session.user) !== "demo") {
    throw new Error("demo_session_failed");
  }
  parkInactiveSession(data.session);
  // A real identity must not survive an explicit exit to the login screen.
  clearParkedSession("real");
  clearPendingAccountSwitch();
  beginAccountSwitchReinit();
  clearGoTrueClientStorage();
  await hardReinit("/login");
}

/**
 * Queue a switch to a parked identity, then hard-navigate.
 * Does not call setSession on the live client — that happens on the next boot
 * via `bootstrapPendingAccountSwitch`, after the previous QueryClient is gone.
 */
export async function requestAccountSwitch(
  kind: AccountKind
): Promise<OpenDemoAccountResult | { ok: true; switching: true; kind: AccountKind }> {
  const parked = readParkedSession(kind);
  if (!parked?.access_token || !parked.refresh_token) {
    return {
      ok: false,
      error: kind === "demo" ? "demo_session_missing" : "real_session_missing",
    };
  }
  if (kind === "demo") rememberDemoIdentity(parked.user.id);

  const current = await supabase.auth.getSession();
  if (current.data.session) {
    parkInactiveSession(current.data.session);
  }

  writePendingAccountSwitch({
    kind,
    access_token: parked.access_token,
    refresh_token: parked.refresh_token,
  });

  // Wipe the live GoTrue key so the next boot cannot briefly restore the
  // previous identity before pending bootstrap runs.
  beginAccountSwitchReinit();
  clearGoTrueClientStorage();

  await hardReinit("/dashboard");
  return { ok: true, switching: true, kind };
}

/** Start the missing identity through normal login/Turnstile, preserving the current one. */
export async function requestAccountEntry(
  kind: AccountKind
): Promise<{ ok: boolean; error?: string }> {
  if (hasParkedSession(kind)) return requestAccountSwitch(kind);
  const current = await supabase.auth.getSession();
  if (current.error || !current.data.session) return { ok: false, error: "session_missing" };
  if (accountKindForUser(current.data.session.user) === kind)
    return { ok: false, error: "already_active" };
  parkInactiveSession(current.data.session);
  beginAccountSwitchReinit();
  clearGoTrueClientStorage();
  await hardReinit(`/login?account=${kind}`);
  return { ok: true };
}

/** Every sample-data entry point leads to the same dedicated demo cockpit. */
export async function enterDemo(): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return { ok: false, error: "session_missing" };
  if (accountKindForUser(data.session.user) === "demo") {
    await hardReinit("/dashboard?showDemoSample=1");
    return { ok: true };
  }
  return requestAccountEntry("demo");
}

/**
 * Apply a pending switch before any financial queries run.
 * On failure clears the parked target so a revoked/expired session cannot revive.
 */
export async function bootstrapPendingAccountSwitch(): Promise<
  | { applied: false }
  | { applied: true; session: Session; kind: AccountKind }
  | { applied: false; error: string; kind: AccountKind }
> {
  const pending = peekPendingAccountSwitch();
  if (!pending) {
    endAccountSwitchReinit();
    return { applied: false };
  }

  let applied: Awaited<ReturnType<typeof supabase.auth.setSession>>;
  try {
    applied = await supabase.auth.setSession({
      access_token: pending.access_token,
      refresh_token: pending.refresh_token,
    });
  } catch {
    clearPendingAccountSwitch();
    clearParkedSession(pending.kind);
    endAccountSwitchReinit();
    return { applied: false, error: "demo_session_failed", kind: pending.kind };
  }

  clearPendingAccountSwitch();
  endAccountSwitchReinit();

  const target = applied.data.session;
  let identityMatches =
    !applied.error && !!target && accountKindForUser(target.user) === pending.kind;
  if (identityMatches && pending.kind === "demo") {
    try {
      rememberDemoIdentity(target!.user.id);
    } catch {
      identityMatches = false;
    }
  }
  if (!identityMatches || !target) {
    // Invalidate only the failed target. Caller falls through to getSession —
    // after a reinit wipe there may be no prior session left.
    clearParkedSession(pending.kind);
    clearGoTrueClientStorage();
    return { applied: false, error: "demo_session_failed", kind: pending.kind };
  }

  // Success: active session is only in GoTrue storage.
  clearParkedSession(pending.kind);
  setStoredActiveKind(pending.kind);

  return {
    applied: true,
    session: target,
    kind: pending.kind,
  };
}

/** @deprecated Use requestAccountSwitch — kept for older call sites during 1.4.0. */
export async function switchToStoredAccount(
  kind: AccountKind
): Promise<OpenDemoAccountResult | { ok: true; switching: true; kind: AccountKind }> {
  return requestAccountSwitch(kind);
}

export function canSwitchToAccount(kind: AccountKind): boolean {
  return hasParkedSession(kind);
}
