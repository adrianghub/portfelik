import * as m from "$lib/paraglide/messages";

/**
 * User-facing client-side validation failure. Carries a message that is
 * already localized and safe to render verbatim (unlike a plain `Error`,
 * whose `message` is treated as an internal code and never shown).
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

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
      // `detail` is the raw domain code (e.g. "transaction_outside_plan_period").
      // We deliberately ignore the DB `hint` (often English) — errorMessage()
      // maps the code to Polish and never renders the raw code or hint.
      return { kind: "custom", detail: e?.message?.trim() || undefined };
  }
  if ((err as { status?: number } | null)?.status === 401) return { kind: "session_expired" };
  return { kind: "generic" };
}

export interface ErrorMessageOpts {
  fallback?: string;
  overrides?: Record<string, string>;
}

/**
 * Polish copy for known `P0001` domain codes raised by SECURITY DEFINER RPCs.
 * Anything not listed here resolves to the generic fallback so internal
 * snake_case codes and English DB hints never reach the UI. Callers that need
 * bespoke copy for a specific RPC still pass `overrides: { P0001: "..." }`.
 */
const P0001_MESSAGES: Record<string, () => string> = {
  transaction_outside_plan_period: m.error_plan_link_outside_period,
  transaction_already_linked: m.error_plan_link_already_linked,
  transaction_type_not_supported: m.error_plan_link_type,
  transaction_must_be_expense: m.error_plan_link_type,
  transaction_not_expense: m.error_plan_link_type,
  plan_not_found: m.error_plan_not_found,
  transaction_not_found: m.error_transaction_not_found,
  link_not_found: m.error_link_not_found,
  not_authorized_plan: m.error_permission,
  not_authorized_transaction: m.error_permission,
  not_authorized: m.error_permission,
  permission_denied: m.error_permission,
  group_forbidden: m.error_permission,
  category_type_mismatch: m.error_category_type_mismatch,
  category_type_in_use: m.error_category_type_in_use,
  category_not_found: m.error_validation,
  plan_not_active: m.error_plan_not_active,
  name_required: m.plan_form_name_required,
  date_required: m.error_validation,
  date_order: m.plan_form_dates_invalid,
  debt_original_required: m.plan_debt_original_required,
  debt_payment_required: m.plan_debt_payment_required,
  debt_rate_invalid: m.plan_debt_rate_invalid,
  debt_balance_exceeds_original: m.plan_debt_balance_exceeds_original,
  group_scope_mismatch: m.error_plan_scope_mismatch,
  private_scope_mismatch: m.error_plan_scope_mismatch,
  transaction_type_locked_by_plan_link: m.error_transaction_type_locked_by_plan_link,
  rule_kind_immutable: m.error_rule_kind_immutable,
  rule_match_type_required: m.error_rule_match_type_required,
  rule_text_required: m.error_rule_text_required,
  invalid_amount: m.error_invalid_amount,
  invalid_date: m.error_invalid_date,
  invalid_currency: m.error_invalid_currency,
  invalid_item_label: m.error_invalid_item_label,
  item_not_owned: m.error_item_not_owned,
  duplicate_item_id: m.error_duplicate_item_id,
  invalid_items_payload: m.error_invalid_items_payload,
};

/** Resolve a user-facing Polish message for any thrown error. */
export function errorMessage(err: unknown, opts: ErrorMessageOpts = {}): string {
  // Explicit, already-localized client-side validation copy renders verbatim.
  if (err instanceof ValidationError) return err.message;
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
    case "custom": {
      const mapped = detail ? P0001_MESSAGES[detail] : undefined;
      return mapped?.() ?? opts.fallback ?? m.error_generic();
    }
    default:
      return opts.fallback ?? m.error_generic();
  }
}
