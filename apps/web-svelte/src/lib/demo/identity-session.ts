/**
 * Demo 2.0 dual-session boundary.
 *
 * Persists Demo and Real GoTrue sessions in separate localStorage keys so a
 * switch stops in-flight work on one identity and restores the other without
 * mixing Query caches (caller must clear QueryClient on switch).
 */
import type { Session, User } from "@supabase/supabase-js";

export type AccountKind = "demo" | "real";

export const DEMO_SESSION_STORAGE_KEY = "jakstoimy.auth.demo.session.v1";
export const REAL_SESSION_STORAGE_KEY = "jakstoimy.auth.real.session.v1";
export const ACTIVE_ACCOUNT_KIND_KEY = "jakstoimy.auth.active_kind.v1";

export function isDemoAccountUser(user: User | null | undefined): boolean {
  return (user?.app_metadata?.account_kind as string | undefined) === "demo";
}

export function accountKindForUser(user: User | null | undefined): AccountKind {
  return isDemoAccountUser(user) ? "demo" : "real";
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

export function persistPartitionedSession(session: Session | null): void {
  if (!session?.user) {
    return;
  }
  const kind = accountKindForUser(session.user);
  writeJsonSession(
    kind === "demo" ? DEMO_SESSION_STORAGE_KEY : REAL_SESSION_STORAGE_KEY,
    session
  );
  setStoredActiveKind(kind);
}

export function readPartitionedSession(kind: AccountKind): Session | null {
  return readJsonSession(
    kind === "demo" ? DEMO_SESSION_STORAGE_KEY : REAL_SESSION_STORAGE_KEY
  );
}

export function clearPartitionedSession(kind: AccountKind): void {
  writeJsonSession(
    kind === "demo" ? DEMO_SESSION_STORAGE_KEY : REAL_SESSION_STORAGE_KEY,
    null
  );
}

/** Sample CSV served from static/ for the optional empty-demo hint. */
export const DEMO_SAMPLE_CSV_PATH = "/sample-imports/jakstoimy-demo.csv";
export const DEMO_SAMPLE_MANIFEST_PATH = "/sample-imports/jakstoimy-demo.manifest.json";
