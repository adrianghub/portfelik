import { supabase } from '$lib/supabase';
import type { GroupInvitation, GroupMember, UserGroup } from '$lib/types';

export async function fetchUserGroups(): Promise<UserGroup[]> {
	const { data, error } = await supabase
		.from('user_groups')
		.select('id, name, owner_id, created_at, updated_at')
		.order('name');

	if (error) throw error;
	return data as UserGroup[];
}

export async function fetchGroupMembers(groupId: string): Promise<GroupMember[]> {
	const { data, error } = await supabase
		.from('group_members')
		.select('group_id, user_id, joined_at')
		.eq('group_id', groupId);

	if (error) throw error;
	return data as GroupMember[];
}

export async function fetchReceivedInvitations(): Promise<GroupInvitation[]> {
	const { data, error } = await supabase
		.from('group_invitations')
		.select('*')
		.eq('status', 'pending')
		.order('created_at', { ascending: false });

	if (error) throw error;
	return data as GroupInvitation[];
}

export async function fetchSentInvitations(groupId: string): Promise<GroupInvitation[]> {
	const { data, error } = await supabase
		.from('group_invitations')
		.select('*')
		.eq('group_id', groupId)
		.order('created_at', { ascending: false });

	if (error) throw error;
	return data as GroupInvitation[];
}

export async function createGroup(name: string): Promise<UserGroup> {
	const { data, error } = await supabase.rpc('create_group', { p_name: name });
	if (error) throw error;
	return data as UserGroup;
}

export async function disbandGroup(groupId: string): Promise<void> {
	const { error } = await supabase.rpc('disband_group', { p_group_id: groupId });
	if (error) throw error;
}

export async function leaveGroup(groupId: string): Promise<void> {
	const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
	if (error) throw error;
}

export async function inviteUser(groupId: string, email: string): Promise<GroupInvitation> {
	const { data, error } = await supabase.rpc('invite_user', {
		p_group_id: groupId,
		p_email: email
	});
	if (error) throw error;
	return data as GroupInvitation;
}

export async function acceptInvitation(invitationId: string): Promise<void> {
	const { error } = await supabase.rpc('accept_invitation', { p_invitation_id: invitationId });
	if (error) throw error;
}

export async function rejectInvitation(invitationId: string): Promise<void> {
	const { error } = await supabase.rpc('reject_invitation', { p_invitation_id: invitationId });
	if (error) throw error;
}

export async function cancelInvitation(invitationId: string): Promise<void> {
	const { error } = await supabase.rpc('cancel_invitation', { p_invitation_id: invitationId });
	if (error) throw error;
}
