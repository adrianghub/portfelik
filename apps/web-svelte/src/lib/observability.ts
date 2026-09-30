import { track, type DiagnosticEvent } from "$lib/analytics";
import { postgrestErrorCode } from "$lib/services/supabase-errors";

export type ErrorContext = "global" | "mutation" | "import" | "parser" | "route";

function eventForContext(context: ErrorContext): DiagnosticEvent {
  if (context === "mutation") return "mutation_failure";
  if (context === "import") return "import_failure";
  if (context === "parser") return "parser_failure";
  return "client_error";
}

function safeErrorCode(error: unknown): string {
  const databaseCode = postgrestErrorCode(error);
  if (databaseCode) return databaseCode.slice(0, 32);
  if (error instanceof Error && error.name) return error.name.slice(0, 32);
  return "unknown";
}

/**
 * Record operational failures without descriptions, amounts, file contents,
 * account identifiers, or other financial data.
 */
export function reportError(error: unknown, context: ErrorContext): void {
  track(eventForContext(context), {
    context,
    code: safeErrorCode(error),
  });
  if (import.meta.env.DEV) console.error(`[${context}]`, error);
}

export function installGlobalErrorReporting(): () => void {
  const onError = (event: ErrorEvent) => reportError(event.error ?? event.message, "global");
  const onUnhandledRejection = (event: PromiseRejectionEvent) =>
    reportError(event.reason, "global");
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}
