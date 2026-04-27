<script lang="ts">
	import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import {
		fetchUserGroups,
		fetchReceivedInvitations,
		createGroup,
		disbandGroup,
		leaveGroup,
		inviteUser,
		acceptInvitation,
		rejectInvitation
	} from '$lib/services/groups';
	import { supabase } from '$lib/supabase';
	import Dialog from '$lib/components/ui/Dialog.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as m from '$lib/paraglide/messages';

	const queryClient = useQueryClient();

	const groupsQuery = createQuery(() => ({
		queryKey: ['user_groups'],
		queryFn: fetchUserGroups
	}));

	const invitationsQuery = createQuery(() => ({
		queryKey: ['group_invitations_received'],
		queryFn: fetchReceivedInvitations
	}));

	let currentUserId = $state<string | undefined>(undefined);
	supabase.auth.getSession().then(({ data }) => {
		currentUserId = data.session?.user.id;
	});

	// Create group dialog
	let showCreateGroup = $state(false);
	let newGroupName = $state('');

	const createGroupMutation = createMutation(() => ({
		mutationFn: () => createGroup(newGroupName),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['user_groups'] });
			newGroupName = '';
			showCreateGroup = false;
		}
	}));

	// Invite dialog
	let inviteGroupId = $state<string | null>(null);
	let inviteEmail = $state('');

	const inviteMutation = createMutation(() => ({
		mutationFn: () => inviteUser(inviteGroupId!, inviteEmail),
		onSuccess: () => {
			inviteEmail = '';
			inviteGroupId = null;
		}
	}));

	// Disband confirm
	let disbandGroupId = $state<string | null>(null);

	const disbandMutation = createMutation(() => ({
		mutationFn: () => disbandGroup(disbandGroupId!),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['user_groups'] });
			disbandGroupId = null;
		}
	}));

	// Leave confirm
	let leaveGroupId = $state<string | null>(null);

	const leaveMutation = createMutation(() => ({
		mutationFn: () => leaveGroup(leaveGroupId!),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['user_groups'] });
			leaveGroupId = null;
		}
	}));

	// Accept/reject invitations
	const acceptMutation = createMutation(() => ({
		mutationFn: (id: string) => acceptInvitation(id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['user_groups'] });
			await queryClient.invalidateQueries({ queryKey: ['group_invitations_received'] });
		}
	}));

	const rejectMutation = createMutation(() => ({
		mutationFn: (id: string) => rejectInvitation(id),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ['group_invitations_received'] });
		}
	}));

	function submitCreateGroup(e: Event) {
		e.preventDefault();
		createGroupMutation.mutate();
	}

	function submitInvite(e: Event) {
		e.preventDefault();
		inviteMutation.mutate();
	}
</script>

<!-- Received invitations -->
{#if invitationsQuery.data && invitationsQuery.data.length > 0}
	<section class="space-y-2 mb-4">
		<h3 class="text-xs font-medium text-zinc-500 uppercase tracking-wide">{m.group_invitations_received()}</h3>
		{#each invitationsQuery.data as inv}
			<div class="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
				<span class="text-sm text-zinc-900">{inv.group_name}</span>
				<div class="flex gap-2">
					<button
						onclick={() => acceptMutation.mutate(inv.id)}
						disabled={acceptMutation.isPending}
						class="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
					>
						{m.group_invitation_accept()}
					</button>
					<button
						onclick={() => rejectMutation.mutate(inv.id)}
						disabled={rejectMutation.isPending}
						class="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
					>
						{m.group_invitation_reject()}
					</button>
				</div>
			</div>
		{/each}
	</section>
{/if}

<!-- Groups list -->
{#if groupsQuery.isLoading}
	<div class="space-y-2">
		{#each [0, 1, 2] as _}
			<div class="h-14 rounded-xl bg-zinc-100 animate-pulse"></div>
		{/each}
	</div>
{:else if groupsQuery.isError}
	<p class="text-sm text-rose-600">{m.common_error_title()}</p>
{:else}
	{#if groupsQuery.data?.length === 0}
		<p class="text-sm text-zinc-400 text-center py-8">{m.groups_empty()}</p>
	{:else if groupsQuery.data}
		<div class="space-y-2">
			{#each groupsQuery.data as group}
				<div class="rounded-xl border border-zinc-200 bg-white px-4 py-3 space-y-2">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium text-zinc-900">{group.name}</span>
						<span class="text-xs text-zinc-400">
							{group.owner_id === currentUserId ? m.groups_role_owner() : m.groups_role_member()}
						</span>
					</div>
					{#if group.owner_id === currentUserId}
						<div class="flex gap-2">
							<button
								onclick={() => { inviteGroupId = group.id; inviteEmail = ''; }}
								class="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
							>
								{m.group_invite()}
							</button>
							<button
								onclick={() => (disbandGroupId = group.id)}
								class="rounded-lg border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors"
							>
								{m.group_disband()}
							</button>
						</div>
					{:else}
						<button
							onclick={() => (leaveGroupId = group.id)}
							class="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
						>
							{m.group_leave()}
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}

	<button
		onclick={() => { showCreateGroup = true; newGroupName = ''; }}
		class="mt-4 w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors"
	>
		+ {m.group_form_title_add()}
	</button>
{/if}

<!-- Create group dialog -->
<Dialog open={showCreateGroup} onclose={() => (showCreateGroup = false)} title={m.group_form_title_add()}>
	<form onsubmit={submitCreateGroup} class="space-y-4">
		<div class="space-y-1">
			<label class="text-xs font-medium text-zinc-600" for="grp-name">{m.group_form_name()}</label>
			<input
				id="grp-name"
				type="text"
				required
				bind:value={newGroupName}
				class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
			/>
		</div>
		{#if createGroupMutation.isError}
			<p class="text-sm text-rose-600">{m.common_error_title()}</p>
		{/if}
		<div class="flex gap-2 pt-1">
			<button type="button" onclick={() => (showCreateGroup = false)} class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
				{m.common_cancel()}
			</button>
			<button type="submit" disabled={createGroupMutation.isPending} class="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors">
				{createGroupMutation.isPending ? m.common_saving() : m.common_save()}
			</button>
		</div>
	</form>
</Dialog>

<!-- Invite dialog -->
<Dialog open={!!inviteGroupId} onclose={() => (inviteGroupId = null)} title={m.group_invite_title()}>
	<form onsubmit={submitInvite} class="space-y-4">
		<div class="space-y-1">
			<label class="text-xs font-medium text-zinc-600" for="inv-email">{m.group_invite_email()}</label>
			<input
				id="inv-email"
				type="email"
				required
				bind:value={inviteEmail}
				class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
			/>
		</div>
		{#if inviteMutation.isError}
			<p class="text-sm text-rose-600">{m.common_error_title()}</p>
		{/if}
		<div class="flex gap-2 pt-1">
			<button type="button" onclick={() => (inviteGroupId = null)} class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
				{m.common_cancel()}
			</button>
			<button type="submit" disabled={inviteMutation.isPending} class="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors">
				{inviteMutation.isPending ? m.common_saving() : m.group_invite()}
			</button>
		</div>
	</form>
</Dialog>

<!-- Disband confirm -->
<ConfirmDialog
	open={!!disbandGroupId}
	message={m.group_disband_confirm()}
	onconfirm={() => disbandMutation.mutate()}
	onclose={() => (disbandGroupId = null)}
	pending={disbandMutation.isPending}
/>

<!-- Leave confirm -->
<ConfirmDialog
	open={!!leaveGroupId}
	message={m.group_leave_confirm()}
	onconfirm={() => leaveMutation.mutate()}
	onclose={() => (leaveGroupId = null)}
	pending={leaveMutation.isPending}
/>
