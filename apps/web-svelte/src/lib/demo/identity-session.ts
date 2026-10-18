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

export type AccountKind = "demo" | "real";

export const DEMO_SESSION_STORAGE_KEY = "jakstoimy.auth.demo.session.v1";
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
    const raw = localStorage.getItem(key);
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
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify(session));
}

export function getStoredActiveKind(): AccountKind | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(ACTIVE_ACCOUNT_KIND_KEY);
  return value === "demo" || value === "real" ? value : null;
}

export function setStoredActiveKind(kind: AccountKind): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACTIVE_ACCOUNT_KIND_KEY, kind);
}

/** Park the identity the user is leaving. Never store a copy of the active session. */
export function parkInactiveSession(session: Session): void {
  if (!session.user) return;
  const kind = accountKindForUser(session.user);
  writeJsonSession(storageKeyForKind(kind), session);
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
  localStorage.setItem(PENDING_ACCOUNT_SWITCH_KEY, JSON.stringify(pending));
}

export function peekPendingAccountSwitch(): PendingAccountSwitch | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(PENDING_ACCOUNT_SWITCH_KEY);
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
  localStorage.removeItem(PENDING_ACCOUNT_SWITCH_KEY);
}

/** Consume pending switch once. Returns null if absent or malformed. */
export function consumePendingAccountSwitch(): PendingAccountSwitch | null {
  const pending = peekPendingAccountSwitch();
  clearPendingAccountSwitch();
  return pending;
}

export function beginAccountSwitchReinit(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACCOUNT_SWITCH_REINIT_KEY, "1");
}

export function isAccountSwitchReinit(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(ACCOUNT_SWITCH_REINIT_KEY) === "1";
}

export function endAccountSwitchReinit(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(ACCOUNT_SWITCH_REINIT_KEY);
}

/** Intentional logout / revoke: drop parked identities and any pending switch. */
export function clearAllIdentitySessionState(): void {
  clearParkedSession("demo");
  clearParkedSession("real");
  clearPendingAccountSwitch();
  endAccountSwitchReinit();
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(ACTIVE_ACCOUNT_KIND_KEY);
  }
}

/** Drop GoTrue client keys without going through signOut (avoids login bounce). */
export function clearGoTrueClientStorage(): void {
  if (typeof localStorage === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && /^sb-.*-auth-token$/.test(key)) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
}

/** Sample CSV served from static/ for the optional empty-demo hint. */
export const DEMO_SAMPLE_CSV_PATH = "/sample-imports/jakstoimy-demo.csv";
export const DEMO_SAMPLE_MANIFEST_PATH = "/sample-imports/jakstoimy-demo.manifest.json";
