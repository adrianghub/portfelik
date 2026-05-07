<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import {
    fetchUserGroups,
    fetchReceivedInvitations,
    fetchSentInvitations,
    fetchGroupMembersWithProfiles,
    createGroup,
    disbandGroup,
    leaveGroup,
    inviteUser,
    acceptInvitation,
    rejectInvitation,
    cancelInvitation,
    removeGroupMember,
  } from "$lib/services/groups";
  import { supabase } from "$lib/supabase";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";

  const queryClient = useQueryClient();

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
  }));

  const invitationsQuery = createQuery(() => ({
    queryKey: ["group_invitations_received"],
    queryFn: fetchReceivedInvitations,
  }));

  let currentUserId = $state<string | undefined>(undefined);
  supabase.auth.getSession().then(({ data }) => {
    currentUserId = data.session?.user.id;
  });

  // ── Create group ──────────────────────────────────────────────────────────
  let showCreateGroup = $state(false);
  let newGroupName = $state("");

  const createGroupMutation = createMutation(() => ({
    mutationFn: () => createGroup(newGroupName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user_groups"] });
      toast.success(m.toast_group_created());
      newGroupName = "";
      showCreateGroup = false;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // ── Invite ────────────────────────────────────────────────────────────────
  let inviteGroupId = $state<string | null>(null);
  let inviteEmail = $state("");

  const inviteMutation = createMutation(() => ({
    mutationFn: () => inviteUser(inviteGroupId!, inviteEmail),
    onSuccess: async () => {
      // Invalidate sent invitations for this group so the panel updates
      await queryClient.invalidateQueries({
        queryKey: ["group_invitations_sent", inviteGroupId],
      });
      toast.success(m.toast_invitation_sent());
      inviteEmail = "";
      inviteGroupId = null;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // ── Disband ───────────────────────────────────────────────────────────────
  let disbandGroupId = $state<string | null>(null);

  const disbandMutation = createMutation(() => ({
    mutationFn: () => disbandGroup(disbandGroupId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user_groups"] });
      toast.success(m.toast_group_disbanded());
      disbandGroupId = null;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // ── Leave ─────────────────────────────────────────────────────────────────
  let leaveGroupId = $state<string | null>(null);

  const leaveMutation = createMutation(() => ({
    mutationFn: () => leaveGroup(leaveGroupId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user_groups"] });
      toast.success(m.toast_group_left());
      leaveGroupId = null;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // ── Accept / reject received invitations ─────────────────────────────────
  const acceptMutation = createMutation(() => ({
    mutationFn: (id: string) => acceptInvitation(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user_groups"] });
      await queryClient.invalidateQueries({ queryKey: ["group_invitations_received"] });
      toast.success(m.toast_invitation_accepted());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const rejectMutation = createMutation(() => ({
    mutationFn: (id: string) => rejectInvitation(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["group_invitations_received"] });
      toast.success(m.toast_invitation_rejected());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // ── Sent invitations + cancel ─────────────────────────────────────────────
  let sentInvGroupId = $state<string | null>(null);

  const sentInvQuery = createQuery(() => ({
    queryKey: ["group_invitations_sent", sentInvGroupId],
    queryFn: () => fetchSentInvitations(sentInvGroupId!),
    enabled: !!sentInvGroupId,
  }));

  const cancelMutation = createMutation(() => ({
    mutationFn: (id: string) => cancelInvitation(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["group_invitations_sent", sentInvGroupId],
      });
      toast.success(m.toast_invitation_cancelled());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // ── Members ───────────────────────────────────────────────────────────────
  let membersGroupId = $state<string | null>(null);

  const membersQuery = createQuery(() => ({
    queryKey: ["group_members_profiles", membersGroupId],
    queryFn: () => fetchGroupMembersWithProfiles(membersGroupId!),
    enabled: !!membersGroupId,
  }));

  let removeTargetUserId = $state<string | null>(null);

  const removeMemberMutation = createMutation(() => ({
    mutationFn: () => removeGroupMember(membersGroupId!, removeTargetUserId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["group_members_profiles", membersGroupId],
      });
      toast.success(m.toast_member_removed());
      removeTargetUserId = null;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // ── Status label helper ───────────────────────────────────────────────────
  function statusLabel(status: string) {
    if (status === "pending") return m.group_invitation_status_pending();
    if (status === "accepted") return m.group_invitation_status_accepted();
    if (status === "rejected") return m.group_invitation_status_rejected();
    return m.group_invitation_status_cancelled();
  }

  function statusClass(status: string) {
    if (status === "pending") return "bg-blue-50 text-blue-700";
    if (status === "accepted") return "bg-emerald-50 text-emerald-700";
    return "bg-zinc-100 text-zinc-500";
  }

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
  <section class="mb-4 space-y-2">
    <h3 class="text-xs font-medium tracking-wide text-zinc-500 uppercase">
      {m.group_invitations_received()}
    </h3>
    {#each invitationsQuery.data as inv (inv.id)}
      <div
        class="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950"
      >
        <span class="text-sm text-zinc-900 dark:text-white">{inv.group_name}</span>
        <div class="flex gap-2">
          <button
            onclick={() => acceptMutation.mutate(inv.id)}
            disabled={acceptMutation.isPending}
            class="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {m.group_invitation_accept()}
          </button>
          <button
            onclick={() => rejectMutation.mutate(inv.id)}
            disabled={rejectMutation.isPending}
            class="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50"
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
    {#each [0, 1, 2] as _, i (i)}
      <div class="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"></div>
    {/each}
  </div>
{:else if groupsQuery.isError}
  <p class="text-sm text-rose-600">{m.common_error_title()}</p>
{:else}
  {#if groupsQuery.data?.length === 0}
    <p class="py-8 text-center text-sm text-zinc-400">{m.groups_empty()}</p>
  {:else if groupsQuery.data}
    <div class="space-y-2">
      {#each groupsQuery.data as group (group.id)}
        <div class="space-y-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900">
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-zinc-900 dark:text-white">{group.name}</span>
            <span class="text-xs text-zinc-400 dark:text-zinc-500">
              {group.owner_id === currentUserId ? m.groups_role_owner() : m.groups_role_member()}
            </span>
          </div>
          {#if group.owner_id === currentUserId}
            <div class="flex flex-wrap gap-2">
              <button
                onclick={() => {
                  inviteGroupId = group.id;
                  inviteEmail = "";
                }}
                class="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {m.group_invite()}
              </button>
              <button
                onclick={() => {
                  membersGroupId = group.id;
                }}
                class="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {m.group_members_title()}
              </button>
              <button
                onclick={() => {
                  sentInvGroupId = sentInvGroupId === group.id ? null : group.id;
                }}
                class="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {m.group_sent_invitations()}
              </button>
              <button
                onclick={() => (disbandGroupId = group.id)}
                class="rounded-lg border border-rose-200 px-3 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950"
              >
                {m.group_disband()}
              </button>
            </div>

            <!-- Sent invitations panel (inline toggle) -->
            {#if sentInvGroupId === group.id}
              <div class="mt-1 rounded-lg border border-zinc-100 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800">
                {#if sentInvQuery.isLoading}
                  <div class="h-8 animate-pulse rounded bg-zinc-200"></div>
                {:else if sentInvQuery.data?.length === 0}
                  <p class="text-xs text-zinc-400">{m.group_sent_invitations_empty()}</p>
                {:else if sentInvQuery.data}
                  <ul class="space-y-2">
                    {#each sentInvQuery.data as inv (inv.id)}
                      <li class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <p class="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                            {inv.invited_user_email}
                          </p>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                          <span
                            class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {statusClass(
                              inv.status
                            )}"
                          >
                            {statusLabel(inv.status)}
                          </span>
                          {#if inv.status === "pending"}
                            <button
                              onclick={() => cancelMutation.mutate(inv.id)}
                              disabled={cancelMutation.isPending}
                              class="rounded border border-zinc-200 px-2 py-0.5 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                            >
                              {m.group_invitation_cancel()}
                            </button>
                          {/if}
                        </div>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          {:else}
            <button
              onclick={() => (leaveGroupId = group.id)}
              class="rounded-lg border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
            >
              {m.group_leave()}
            </button>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <button
    onclick={() => {
      showCreateGroup = true;
      newGroupName = "";
    }}
    class="mt-4 w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
  >
    + {m.group_form_title_add()}
  </button>
{/if}

<!-- Create group dialog -->
<Dialog
  open={showCreateGroup}
  onclose={() => (showCreateGroup = false)}
  title={m.group_form_title_add()}
>
  <form onsubmit={submitCreateGroup} class="space-y-4">
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600 dark:text-zinc-300" for="grp-name">{m.group_form_name()}</label>
      <input
        id="grp-name"
        type="text"
        required
        bind:value={newGroupName}
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:ring-white/10"
      />
    </div>
    {#if createGroupMutation.isError}
      <p class="text-sm text-rose-600">{m.common_error_title()}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showCreateGroup = false)}
        class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={createGroupMutation.isPending}
        class="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {createGroupMutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>

<!-- Invite dialog -->
<Dialog
  open={!!inviteGroupId}
  onclose={() => (inviteGroupId = null)}
  title={m.group_invite_title()}
>
  <form onsubmit={submitInvite} class="space-y-4">
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600 dark:text-zinc-300" for="inv-email"
        >{m.group_invite_email()}</label
      >
      <input
        id="inv-email"
        type="email"
        required
        bind:value={inviteEmail}
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:ring-white/10"
      />
    </div>
    {#if inviteMutation.isError}
      <p class="text-sm text-rose-600">{m.common_error_title()}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (inviteGroupId = null)}
        class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={inviteMutation.isPending}
        class="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {inviteMutation.isPending ? m.common_saving() : m.group_invite()}
      </button>
    </div>
  </form>
</Dialog>

<!-- Members dialog -->
<Dialog
  open={!!membersGroupId}
  onclose={() => {
    membersGroupId = null;
    removeTargetUserId = null;
  }}
  title={m.group_members_title()}
>
  {#if membersQuery.isLoading}
    <div class="space-y-2">
      {#each [0, 1, 2] as _, i (i)}
        <div class="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"></div>
      {/each}
    </div>
  {:else if membersQuery.data?.length === 0}
    <p class="py-4 text-center text-sm text-zinc-400">{m.group_members_empty()}</p>
  {:else if membersQuery.data}
    <ul class="divide-y divide-zinc-100 dark:divide-zinc-700">
      {#each membersQuery.data as member (member.user_id)}
        <li class="flex items-center justify-between gap-3 py-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-zinc-900 dark:text-white">{member.name ?? member.email}</p>
            {#if member.name}
              <p class="truncate text-xs text-zinc-400 dark:text-zinc-500">{member.email}</p>
            {/if}
          </div>
          {#if member.user_id !== currentUserId}
            <button
              onclick={() => (removeTargetUserId = member.user_id)}
              class="shrink-0 rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950"
            >
              {m.group_member_remove()}
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
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

<!-- Remove member confirm -->
<ConfirmDialog
  open={!!removeTargetUserId}
  message={m.group_member_remove_confirm()}
  onconfirm={() => removeMemberMutation.mutate()}
  onclose={() => (removeTargetUserId = null)}
  pending={removeMemberMutation.isPending}
/>
