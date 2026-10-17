import { beforeEach, expect, it, vi } from "vitest";
const { invoke, rpc } = vi.hoisted(() => ({ invoke: vi.fn(), rpc: vi.fn() }));
vi.mock("$lib/supabase", () => ({ supabase: { functions: { invoke }, rpc } }));
import { inviteUser, resendInvitation, deleteInvitation } from "$lib/services/groups";
import type { GroupInvitation } from "$lib/types";

beforeEach(() => vi.clearAllMocks());
it("returns a persisted failed invitation so the UI can refresh and retry", async () => {
  const invitation = {
    id: "i1",
    group_id: "g1",
    invited_user_email: "a@b.com",
    delivery_status: "failed",
  } as GroupInvitation;
  invoke.mockResolvedValue({
    data: { invitation, deliveryError: "recipient_not_allowed" },
    error: null,
  });
  expect(await inviteUser("g1", " A@B.com ")).toEqual(invitation);
  expect(invoke).toHaveBeenCalledWith("send-group-invitation", {
    body: { groupId: "g1", email: "a@b.com" },
  });
  await resendInvitation(invitation);
  expect(invoke).toHaveBeenLastCalledWith("send-group-invitation", {
    body: { groupId: "g1", email: "a@b.com", invitationId: "i1" },
  });
});
it("uses the authorized history deletion RPC", async () => {
  rpc.mockResolvedValue({ error: null });
  await deleteInvitation("i1");
  expect(rpc).toHaveBeenCalledWith("delete_group_invitation", { p_invitation_id: "i1" });
});
