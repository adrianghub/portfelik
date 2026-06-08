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
