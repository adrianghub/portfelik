/**
 * Demo 2.0 dual-session boundary.
 *
 * Active GoTrue credentials live only in the Supabase client storage.
 * At most one *inactive* identity is parked under a kind-scoped key so the
 * user can switch back. Switching always goes through a one-shot pending
 * payload + hard navigation so QueryClient and in-flight work die with the
 * previous JS heap (see `requestAccountSwitch` / `bootstrapPendingAccountSwitch`).
 */
import type { Session, User } from "@supabase/supabase-js";
import { deviceAuthStorage } from "$lib/auth/device-storage";

export type AccountKind = "demo" | "real";

export const DEMO_SESSION_STORAGE_KEY = "jakstoimy.auth.demo.session.v1";
/** Identity marker survives expired/revoked credentials; never grants access. */
export const DEMO_BINDING_KEY = "jakstoimy.auth.demo.binding.v1";
export const REAL_SESSION_STORAGE_KEY = "jakstoimy.auth.real.session.v1";
export const ACTIVE_ACCOUNT_KIND_KEY = "jakstoimy.auth.active_kind.v1";
/** One-shot bootstrap after hard navigation. Cleared on consume or failure. */
export const PENDING_ACCOUNT_SWITCH_KEY = "jakstoimy.auth.pending_switch.v1";
/**
 * Set for the duration of a hard Demo↔Real reinit so SIGNED_OUT from a local
 * storage wipe does not drop parked sessions or bounce to /login mid-switch.
 */
export const ACCOUNT_SWITCH_REINIT_KEY = "jakstoimy.auth.reinit.v1";

export type PendingAccountSwitch = {
  kind: AccountKind;
  access_token: string;
  refresh_token: string;
};

export function isDemoAccountUser(user: User | null | undefined): boolean {
  return (user?.app_metadata?.account_kind as string | undefined) === "demo";
}

export function accountKindForUser(user: User | null | undefined): AccountKind {
  return isDemoAccountUser(user) ? "demo" : "real";
}

function storageKeyForKind(kind: AccountKind): string {
  return kind === "demo" ? DEMO_SESSION_STORAGE_KEY : REAL_SESSION_STORAGE_KEY;
}

function readJsonSession(key: string): Session | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = deviceAuthStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.access_token || !parsed?.refresh_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeJsonSession(key: string, session: Session | null): void {
  if (typeof localStorage === "undefined") return;
  if (!session) {
    deviceAuthStorage.removeItem(key);
    return;
  }
  deviceAuthStorage.setItem(key, JSON.stringify(session));
}

export function getStoredActiveKind(): AccountKind | null {
  if (typeof localStorage === "undefined") return null;
  const value = deviceAuthStorage.getItem(ACTIVE_ACCOUNT_KIND_KEY);
  return value === "demo" || value === "real" ? value : null;
}

export function setStoredActiveKind(kind: AccountKind): void {
  if (typeof localStorage === "undefined") return;
  deviceAuthStorage.setItem(ACTIVE_ACCOUNT_KIND_KEY, kind);
}

/** Park the identity the user is leaving. Never store a copy of the active session. */
export function parkInactiveSession(session: Session): void {
  if (!session.user) return;
  const kind = accountKindForUser(session.user);
  if (kind === "demo") rememberDemoIdentity(session.user.id);
  writeJsonSession(storageKeyForKind(kind), session);
}

export function rememberDemoIdentity(userId: string): void {
  if (typeof localStorage === "undefined") return;
  const bound = deviceAuthStorage.getItem(DEMO_BINDING_KEY);
  if (bound !== null && bound !== userId) throw new Error("demo_identity_mismatch");
  deviceAuthStorage.setItem(DEMO_BINDING_KEY, userId);
}

export function hasDemoBinding(): boolean {
  return (
    (typeof localStorage !== "undefined" &&
      (deviceAuthStorage.getItem(DEMO_BINDING_KEY) !== null ||
        deviceAuthStorage.getItem(DEMO_SESSION_STORAGE_KEY) !== null)) ||
    hasParkedSession("demo")
  );
}

/** Only after confirmed deletion or an explicit decision to forget local demo access. */
export function forgetDemoAccess(): void {
  clearParkedSession("demo");
  if (peekPendingAccountSwitch()?.kind === "demo") clearPendingAccountSwitch();
  if (typeof localStorage !== "undefined") deviceAuthStorage.removeItem(DEMO_BINDING_KEY);
}

export function readParkedSession(kind: AccountKind): Session | null {
  return readJsonSession(storageKeyForKind(kind));
}

export function hasParkedSession(kind: AccountKind): boolean {
  return readParkedSession(kind) !== null;
}

export function clearParkedSession(kind: AccountKind): void {
  writeJsonSession(storageKeyForKind(kind), null);
}

/** @deprecated Prefer parkInactiveSession — kept for call-site clarity during migration. */
export function persistPartitionedSession(session: Session | null): void {
  if (!session?.user) return;
  parkInactiveSession(session);
}

export function readPartitionedSession(kind: AccountKind): Session | null {
  return readParkedSession(kind);
}

export function clearPartitionedSession(kind: AccountKind): void {
  clearParkedSession(kind);
}

export function writePendingAccountSwitch(pending: PendingAccountSwitch): void {
  if (typeof localStorage === "undefined") return;
  deviceAuthStorage.setItem(PENDING_ACCOUNT_SWITCH_KEY, JSON.stringify(pending));
}

export function peekPendingAccountSwitch(): PendingAccountSwitch | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = deviceAuthStorage.getItem(PENDING_ACCOUNT_SWITCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingAccountSwitch;
    if (
      (parsed.kind !== "demo" && parsed.kind !== "real") ||
      !parsed.access_token ||
      !parsed.refresh_token
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingAccountSwitch(): void {
  if (typeof localStorage === "undefined") return;
  deviceAuthStorage.removeItem(PENDING_ACCOUNT_SWITCH_KEY);
}

/** Consume pending switch once. Returns null if absent or malformed. */
export function consumePendingAccountSwitch(): PendingAccountSwitch | null {
  const pending = peekPendingAccountSwitch();
  clearPendingAccountSwitch();
  return pending;
}

export function beginAccountSwitchReinit(): void {
  if (typeof localStorage === "undefined") return;
  deviceAuthStorage.setItem(ACCOUNT_SWITCH_REINIT_KEY, "1");
}

export function isAccountSwitchReinit(): boolean {
  if (typeof localStorage === "undefined") return false;
  return deviceAuthStorage.getItem(ACCOUNT_SWITCH_REINIT_KEY) === "1";
}

export function endAccountSwitchReinit(): void {
  if (typeof localStorage === "undefined") return;
  deviceAuthStorage.removeItem(ACCOUNT_SWITCH_REINIT_KEY);
}

/** Clear revoked credentials; real logout may keep its separate demo. The binding remains. */
export function clearAllIdentitySessionState(options?: { preserveDemo?: boolean }): void {
  if (!options?.preserveDemo) clearParkedSession("demo");
  clearParkedSession("real");
  clearPendingAccountSwitch();
  endAccountSwitchReinit();
  if (typeof localStorage !== "undefined") {
    deviceAuthStorage.removeItem(ACTIVE_ACCOUNT_KIND_KEY);
  }
}

/** Drop GoTrue client keys without going through signOut (avoids login bounce). */
export function clearGoTrueClientStorage(): void {
  if (typeof localStorage === "undefined") return;
  for (const key of deviceAuthStorage.keys()) {
    if (/^sb-.*-auth-token$/.test(key)) deviceAuthStorage.removeItem(key);
  }
}

/** Sample CSV served from static/ for the optional empty-demo hint. */
export const DEMO_SAMPLE_CSV_PATH = "/sample-imports/jakstoimy-demo.csv";
export const DEMO_SAMPLE_MANIFEST_PATH = "/sample-imports/jakstoimy-demo.manifest.json";
