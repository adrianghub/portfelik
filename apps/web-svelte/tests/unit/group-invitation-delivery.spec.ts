import { describe, expect, it } from "vitest";
import {
  invitationDeliveryFailureCode,
  resolveInvitationFunctionResult,
} from "$lib/services/group-invitation-delivery";
import type { GroupInvitation } from "$lib/types";

const invitation = {
  id: "inv-1",
  group_id: "g1",
  group_name: "Dom",
  invited_user_email: "a@example.com",
  created_by: "u1",
  status: "pending",
  delivery_status: "sent",
  delivery_attempts: 1,
  created_at: "2026-10-16T00:00:00Z",
  updated_at: "2026-10-16T00:00:00Z",
  expires_at: "2026-10-23T00:00:00Z",
  sent_at: null,
} as GroupInvitation;

describe("resolveInvitationFunctionResult", () => {
  it("returns the invitation on success", () => {
    expect(resolveInvitationFunctionResult({ invitation }, null)).toEqual(invitation);
  });

  it("prefers the Edge Function error code when invoke fails", () => {
    expect(() =>
      resolveInvitationFunctionResult(
        { error: "cannot_invite_self" },
        new Error("FunctionsHttpError")
      )
    ).toThrow("cannot_invite_self");
  });

  it("falls back when the body is missing", () => {
    expect(() => resolveInvitationFunctionResult(null, null)).toThrow("invitation_create_failed");
  });
});

describe("invitationDeliveryFailureCode", () => {
  it("returns null when delivery succeeded", () => {
    expect(invitationDeliveryFailureCode({ invitation })).toBeNull();
  });

  it("surfaces allowlist and send failures", () => {
    const failed = { ...invitation, delivery_status: "failed" as const };
    expect(
      invitationDeliveryFailureCode({
        invitation: failed,
        deliveryError: "recipient_not_allowed",
      })
    ).toBe("recipient_not_allowed");
    expect(invitationDeliveryFailureCode({ invitation: failed })).toBe("email_send_failed");
  });
});
