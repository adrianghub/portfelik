import { supabase } from "$lib/supabase";
import type {
  GroupInvitation,
  GroupMember,
  GroupMemberRole,
  GroupMemberWithProfile,
  UserGroup,
} from "$lib/types";

export async function fetchMyGroupRoles(): Promise<Map<string, GroupMemberRole>> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not_authenticated");

  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id);
  if (error) throw error;

  return new Map((data ?? []).map((row) => [row.group_id, row.role as GroupMemberRole]));
}

export async function fetchUserGroups(): Promise<UserGroup[]> {
  const { data, error } = await supabase
    .from("user_groups")
    .select("id, name, owner_id, created_at, updated_at")
    .order("name");

  if (error) throw error;
  return data as UserGroup[];
}

export async function fetchReceivedInvitations(): Promise<GroupInvitation[]> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user?.email) throw userError ?? new Error("Not authenticated");

  const email = user.email.trim().toLowerCase();

  const { data, error } = await supabase
    .from("group_invitations")
    .select("*")
    .eq("status", "pending")
    .eq("invited_user_email", email)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as GroupInvitation[];
}

export async function fetchSentInvitations(groupId: string): Promise<GroupInvitation[]> {
  const { data, error } = await supabase
    .from("group_invitations")
    .select("*")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data as GroupInvitation[];
}

export async function createGroup(name: string): Promise<UserGroup> {
  const { data, error } = await supabase.rpc("create_group", { p_name: name });
  if (error) throw error;
  return data as UserGroup;
}

export class GroupHasItemsError extends Error {
  constructor(message?: string) {
    super(message ?? "group_has_items");
    this.name = "GroupHasItemsError";
  }
}

export async function disbandGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc("disband_group", { p_group_id: groupId });
  if (error) {
    if (error.message?.includes("group_has_items")) {
      throw new GroupHasItemsError(error.hint ?? error.message);
    }
    throw error;
  }
}

export async function leaveGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc("leave_group", { p_group_id: groupId });
  if (error) throw error;
}

export async function inviteUser(groupId: string, email: string): Promise<GroupInvitation> {
  const { data, error } = await supabase.functions.invoke("send-group-invitation", {
    body: { groupId, email: email.trim().toLowerCase() },
  });
  if (error) throw error;
  return data.invitation as GroupInvitation;
}

export async function resendInvitation(invitation: GroupInvitation): Promise<GroupInvitation> {
  const { data, error } = await supabase.functions.invoke("send-group-invitation", {
    body: {
      groupId: invitation.group_id,
      email: invitation.invited_user_email,
      invitationId: invitation.id,
    },
  });
  if (error) throw error;
  return data.invitation as GroupInvitation;
}

export async function fetchInvitationPreview(token: string) {
  const { data, error } = await supabase.rpc("get_group_invitation_preview", { p_token: token });
  if (error) throw error;
  return data;
}

export async function claimInvitation(
  token: string
): Promise<{ groupId: string; groupName: string }> {
  const { data, error } = await supabase.rpc("claim_group_invitation", { p_token: token });
  if (error) {
    // Normalize to Error so UI can match message substrings (e.g. email_mismatch)
    // regardless of PostgrestError prototype quirks across bundles.
    throw new Error(error.message || error.code || "claim_failed");
  }
  return data as { groupId: string; groupName: string };
}

export async function acceptInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc("accept_invitation", { p_invitation_id: invitationId });
  if (error) throw error;
}

export async function rejectInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc("reject_invitation", { p_invitation_id: invitationId });
  if (error) throw error;
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_invitation", { p_invitation_id: invitationId });
  if (error) throw error;
}

export async function fetchGroupMembersWithProfiles(
  groupId: string
): Promise<GroupMemberWithProfile[]> {
  const { data: members, error } = await supabase
    .from("group_members")
    .select("user_id, joined_at, role")
    .eq("group_id", groupId);
  if (error) throw error;
  if (!members.length) return [];

  const userIds = members.map((m) => m.user_id);
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, email, name")
    .in("id", userIds);
  if (pErr) throw pErr;

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  return members.map((m) => ({
    user_id: m.user_id,
    joined_at: m.joined_at,
    email: profileMap.get(m.user_id)?.email ?? "",
    name: profileMap.get(m.user_id)?.name ?? null,
    role: (m as GroupMember).role,
  }));
}

export async function nominateGroupCoOwner(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("nominate_group_co_owner", {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function revokeGroupCoOwner(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_group_co_owner", {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function removeGroupMember(groupId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_group_member", {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function transferGroupOwnership(groupId: string, newOwnerId: string): Promise<void> {
  const { error } = await supabase.rpc("transfer_group_ownership", {
    p_group_id: groupId,
    p_new_owner_id: newOwnerId,
  });
  if (error) throw error;
}

export async function deleteAccount(): Promise<void> {
  const { error } = await supabase.rpc("delete_account");
  if (error) throw error;
}
