import * as m from "$lib/paraglide/messages";

/** Minimal PostgREST / Supabase client error shape. */
export interface PostgrestErrorLike {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

export function extractPostgrestError(err: unknown): PostgrestErrorLike | null {
  if (!err || typeof err !== "object") return null;
  const e = err as PostgrestErrorLike;
  if (e.code || e.message) return e;
  return null;
}

export function postgrestErrorCode(err: unknown): string | null {
  return extractPostgrestError(err)?.code ?? null;
}

export type ErrorKind =
  | "network"
  | "permission"
  | "duplicate"
  | "in_use"
  | "validation"
  | "session_expired"
  | "custom"
  | "generic";

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError && /fetch/i.test(err.message)) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = (err as { message?: string } | null)?.message;
  return !!msg && /failed to fetch|networkerror|load failed/i.test(msg);
}

/** Pure classification — no i18n, fully unit-testable. */
export function classifyError(err: unknown): { kind: ErrorKind; detail?: string } {
  if (isNetworkError(err)) return { kind: "network" };
  const e = extractPostgrestError(err);
  switch (e?.code) {
    case "42501":
      return { kind: "permission" };
    case "23505":
      return { kind: "duplicate" };
    case "23503":
      return { kind: "in_use" };
    case "23502":
    case "23514":
    case "22P02":
      return { kind: "validation" };
    case "401":
    case "PGRST301":
      return { kind: "session_expired" };
    case "P0001":
      return { kind: "custom", detail: e?.hint?.trim() || e?.message?.trim() || undefined };
  }
  if ((err as { status?: number } | null)?.status === 401) return { kind: "session_expired" };
  return { kind: "generic" };
}

export interface ErrorMessageOpts {
  fallback?: string;
  overrides?: Record<string, string>;
}

/** Resolve a user-facing Polish message for any thrown error. */
export function errorMessage(err: unknown, opts: ErrorMessageOpts = {}): string {
  const code = postgrestErrorCode(err);
  if (code && opts.overrides?.[code]) return opts.overrides[code];
  const { kind, detail } = classifyError(err);
  switch (kind) {
    case "network":
      return m.error_network();
    case "permission":
      return m.error_permission();
    case "duplicate":
      return m.error_duplicate();
    case "in_use":
      return m.error_in_use();
    case "validation":
      return m.error_validation();
    case "session_expired":
      return m.error_session_expired();
    case "custom":
      return detail ?? opts.fallback ?? m.error_generic();
    default:
      return opts.fallback ?? m.error_generic();
  }
}
