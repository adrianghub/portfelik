import type { GroupInvitation } from "$lib/types";

export type InvitationFunctionBody = {
  invitation?: GroupInvitation;
  error?: string;
  deliveryError?: string;
};

/**
 * Normalize send-group-invitation Edge Function success/error payloads.
 * Create failures become Errors with stable domain codes; delivery failures
 * still return the invitation row (delivery_status === "failed").
 */
export function resolveInvitationFunctionResult(
  data: InvitationFunctionBody | null | undefined,
  error: unknown
): GroupInvitation {
  if (error) {
    const code =
      data && typeof data === "object" && typeof data.error === "string" ? data.error.trim() : "";
    throw new Error(code || "invitation_create_failed");
  }
  if (!data?.invitation) {
    throw new Error(data?.error?.trim() || "invitation_create_failed");
  }
  return data.invitation;
}

/** Best-effort parse of FunctionsHttpError.context Response JSON. */
export async function invitationErrorFromFunctionsFailure(error: unknown): Promise<Error> {
  const context = (error as { context?: Response } | null)?.context;
  if (context && typeof context.json === "function") {
    try {
      const body = (await context.clone().json()) as InvitationFunctionBody;
      if (body?.error?.trim()) return new Error(body.error.trim());
      if (body?.deliveryError?.trim()) return new Error(body.deliveryError.trim());
    } catch {
      /* fall through */
    }
  }
  return new Error("invitation_create_failed");
}

export function invitationDeliveryFailureCode(
  data: InvitationFunctionBody | null | undefined
): string | null {
  if (!data?.invitation || data.invitation.delivery_status !== "failed") return null;
  return data.deliveryError?.trim() || "email_send_failed";
}
