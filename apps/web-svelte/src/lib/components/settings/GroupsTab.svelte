<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { page } from "$app/stores";
  import {
    fetchUserGroups,
    fetchMyGroupRoles,
    fetchReceivedInvitations,
    fetchSentInvitations,
    fetchGroupMembersWithProfiles,
    createGroup,
    disbandGroup,
    GroupHasItemsError,
    leaveGroup,
    inviteUser,
    acceptInvitation,
    rejectInvitation,
    cancelInvitation,
    removeGroupMember,
    nominateGroupCoOwner,
    revokeGroupCoOwner,
  } from "$lib/services/groups";
  import { supabase } from "$lib/supabase";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import { errorMessage } from "$lib/services/supabase-errors";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import * as m from "$lib/paraglide/messages";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { Users } from "lucide-svelte";
  import type { GroupMemberRole } from "$lib/types";

  const queryClient = useQueryClient();

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
  }));

  const groupRolesQuery = createQuery(() => ({
    queryKey: ["my-group-roles"],
    queryFn: fetchMyGroupRoles,
  }));

  const invitationsQuery = createQuery(() => ({
    queryKey: ["group_invitations_received"],
    queryFn: fetchReceivedInvitations,
  }));

  let currentUserId = $state<string | undefined>(undefined);
  supabase.auth.getSession().then(({ data }) => {
    currentUserId = data.session?.user.id;
  });

  let deepLinkHandled = $state(false);
  $effect(() => {
    const groupId = $page.url.searchParams.get("group");
    if (!groupId || deepLinkHandled || !groupsQuery.data?.length) return;
    if (groupsQuery.data.some((g) => g.id === groupId)) {
      membersGroupId = groupId;
      deepLinkHandled = true;
    }
  });

  function myRoleForGroup(groupId: string): GroupMemberRole {
    return groupRolesQuery.data?.get(groupId) ?? "member";
  }

  function myRoleLabel(groupId: string, ownerId: string): string {
    if (ownerId === currentUserId) return m.groups_role_owner();
    const role = myRoleForGroup(groupId);
    if (role === "co_owner") return m.group_role_co_owner();
    return m.groups_role_member();
  }

  function canManageGroup(group: { id: string; owner_id: string }): boolean {
    return group.owner_id === currentUserId || myRoleForGroup(group.id) === "co_owner";
  }

  // ── Create group ──────────────────────────────────────────────────────────
  let showCreateGroup = $state(false);
  let newGroupName = $state("");

  const createGroupMutation = createMutation(() => ({
    mutationFn: () => createGroup(newGroupName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user_groups"] });
      await queryClient.invalidateQueries({ queryKey: ["my-group-roles"] });
      toast.success(m.toast_group_created());
      newGroupName = "";
      showCreateGroup = false;
    },
    onError: (err) => toastError(err),
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
    onError: (err) => toastError(err),
  }));

  // ── Disband ───────────────────────────────────────────────────────────────
  let disbandGroupId = $state<string | null>(null);

  const disbandMutation = createMutation(() => ({
    mutationFn: () => disbandGroup(disbandGroupId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user_groups"] });
      await queryClient.invalidateQueries({ queryKey: ["my-group-roles"] });
      toast.success(m.toast_group_disbanded());
      disbandGroupId = null;
    },
    onError: (err) => {
      if (err instanceof GroupHasItemsError) {
        toast.error(m.group_disband_blocked_title(), {
          description: m.group_disband_blocked_body(),
        });
        return;
      }
      toastError(err);
    },
  }));

  // ── Leave ─────────────────────────────────────────────────────────────────
  let leaveGroupId = $state<string | null>(null);

  const leaveMutation = createMutation(() => ({
    mutationFn: () => leaveGroup(leaveGroupId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user_groups"] });
      await queryClient.invalidateQueries({ queryKey: ["my-group-roles"] });
      toast.success(m.toast_group_left());
      leaveGroupId = null;
    },
    onError: (err) => toastError(err),
  }));

  // ── Accept / reject received invitations ─────────────────────────────────
  const acceptMutation = createMutation(() => ({
    mutationFn: (id: string) => acceptInvitation(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["user_groups"] });
      await queryClient.invalidateQueries({ queryKey: ["my-group-roles"] });
      await queryClient.invalidateQueries({ queryKey: ["group_invitations_received"] });
      toast.success(m.toast_invitation_accepted());
    },
    onError: (err) => toastError(err),
  }));

  const rejectMutation = createMutation(() => ({
    mutationFn: (id: string) => rejectInvitation(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["group_invitations_received"] });
      toast.success(m.toast_invitation_rejected());
    },
    onError: (err) => toastError(err),
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
    onError: (err) => toastError(err),
  }));

  // ── Members ───────────────────────────────────────────────────────────────
  let membersGroupId = $state<string | null>(null);
  const membersGroup = $derived(groupsQuery.data?.find((g) => g.id === membersGroupId) ?? null);
  const canManageMemberRoles = $derived(!!membersGroup && membersGroup.owner_id === currentUserId);

  const membersQuery = createQuery(() => ({
    queryKey: ["group_members_profiles", membersGroupId],
    queryFn: () => fetchGroupMembersWithProfiles(membersGroupId!),
    enabled: !!membersGroupId,
  }));

  let removeTargetUserId = $state<string | null>(null);

  function effectiveMemberRole(memberUserId: string, role?: GroupMemberRole): GroupMemberRole {
    if (membersGroup?.owner_id === memberUserId) return "owner";
    return role ?? "member";
  }

  const coOwnerMutation = createMutation(() => ({
    mutationFn: (vars: { userId: string; action: "nominate" | "revoke" }) =>
      vars.action === "nominate"
        ? nominateGroupCoOwner(membersGroupId!, vars.userId)
        : revokeGroupCoOwner(membersGroupId!, vars.userId),
    onSuccess: async (_data, vars) => {
      await queryClient.invalidateQueries({
        queryKey: ["group_members_profiles", membersGroupId],
      });
      toast.success(
        vars.action === "nominate"
          ? m.toast_group_co_owner_nominated()
          : m.toast_group_co_owner_revoked()
      );
    },
    onError: (err) => toastError(err),
  }));

  const removeMemberMutation = createMutation(() => ({
    mutationFn: () => removeGroupMember(membersGroupId!, removeTargetUserId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["group_members_profiles", membersGroupId],
      });
      toast.success(m.toast_member_removed());
      removeTargetUserId = null;
    },
    onError: (err) => toastError(err),
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
    return "bg-slate-100 text-slate-400";
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
    <h3 class="text-xs font-medium tracking-wide text-slate-400 uppercase">
      {m.group_invitations_received()}
    </h3>
    {#each invitationsQuery.data as inv (inv.id)}
      <div
        class="flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900 dark:bg-blue-950"
      >
        <span class="text-sm text-slate-100">{inv.group_name}</span>
        <div class="flex gap-2">
          <button
            onclick={() => acceptMutation.mutate(inv.id)}
            disabled={acceptMutation.isPending}
            class="rounded-lg bg-slate-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {m.group_invitation_accept()}
          </button>
          <button
            onclick={() => rejectMutation.mutate(inv.id)}
            disabled={rejectMutation.isPending}
            class="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
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
      <div class="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"></div>
    {/each}
  </div>
{:else if groupsQuery.isError}
  <QueryError error={groupsQuery.error} onRetry={() => groupsQuery.refetch()} />
{:else}
  {#if groupsQuery.data?.length === 0}
    <EmptyState title={m.groups_empty()} body={m.groups_empty_hint()}>
      {#snippet icon()}
        <Users size={28} strokeWidth={1.4} />
      {/snippet}
    </EmptyState>
  {:else if groupsQuery.data}
    <div class="space-y-2">
      {#each groupsQuery.data as group (group.id)}
        <div
          class="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900"
        >
          <div class="flex items-center justify-between">
            <span class="text-sm font-medium text-slate-100">{group.name}</span>
            <span class="text-xs text-slate-400">
              {myRoleLabel(group.id, group.owner_id)}
            </span>
          </div>
          {#if group.owner_id === currentUserId}
            <div class="flex flex-wrap gap-2">
              <button
                onclick={() => {
                  inviteGroupId = group.id;
                  inviteEmail = "";
                }}
                class="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {m.group_invite()}
              </button>
              <button
                onclick={() => {
                  membersGroupId = group.id;
                }}
                class="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {m.group_members_title()}
              </button>
              <button
                onclick={() => {
                  sentInvGroupId = sentInvGroupId === group.id ? null : group.id;
                }}
                class="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {m.group_sent_invitations()}
              </button>
              <button
                onclick={() => (disbandGroupId = group.id)}
                class="rounded-lg border border-rose-200 px-3 py-1 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950"
              >
                {m.group_disband()}
              </button>
            </div>

            <!-- Sent invitations panel (inline toggle) -->
            {#if sentInvGroupId === group.id}
              <div
                class="mt-1 rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
              >
                {#if sentInvQuery.isLoading}
                  <div class="h-8 animate-pulse rounded bg-slate-200"></div>
                {:else if sentInvQuery.data?.length === 0}
                  <p class="text-xs text-slate-400">{m.group_sent_invitations_empty()}</p>
                {:else if sentInvQuery.data}
                  <ul class="space-y-2">
                    {#each sentInvQuery.data as inv (inv.id)}
                      <li class="flex items-center justify-between gap-2">
                        <div class="min-w-0">
                          <p
                            class="truncate text-xs font-medium text-slate-800 dark:text-slate-200"
                          >
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
                              class="rounded border border-slate-200 px-2 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
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
          {:else if canManageGroup(group)}
            <div class="flex flex-wrap gap-2">
              <button
                onclick={() => {
                  membersGroupId = group.id;
                }}
                class="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {m.group_members_title()}
              </button>
              <button
                onclick={() => (leaveGroupId = group.id)}
                class="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {m.group_leave()}
              </button>
            </div>
          {:else}
            <button
              onclick={() => (leaveGroupId = group.id)}
              class="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
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
    class="mt-4 w-full rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-400 transition-colors hover:border-slate-400 hover:text-slate-700 dark:border-slate-600 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-300"
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
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="grp-name"
        >{m.group_form_name()}</label
      >
      <input
        id="grp-name"
        type="text"
        required
        bind:value={newGroupName}
        class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
      />
    </div>
    {#if createGroupMutation.isError}
      <p class="text-sm text-rose-300">{errorMessage(createGroupMutation.error)}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showCreateGroup = false)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={createGroupMutation.isPending}
        class="bg-accent-gradient focus-visible:ring-accent flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
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
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="inv-email"
        >{m.group_invite_email()}</label
      >
      <input
        id="inv-email"
        type="email"
        required
        bind:value={inviteEmail}
        class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
      />
    </div>
    {#if inviteMutation.isError}
      <p class="text-sm text-rose-300">{errorMessage(inviteMutation.error)}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (inviteGroupId = null)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={inviteMutation.isPending}
        class="bg-accent-gradient focus-visible:ring-accent flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
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
        <div class="h-10 animate-pulse rounded-xl bg-slate-800/60"></div>
      {/each}
    </div>
  {:else if membersQuery.data?.length === 0}
    <p class="py-4 text-center text-sm text-slate-400">{m.group_members_empty()}</p>
  {:else if membersQuery.data}
    <ul class="divide-y divide-slate-100 dark:divide-slate-700">
      {#each membersQuery.data as member (member.user_id)}
        {@const effectiveRole = effectiveMemberRole(member.user_id, member.role)}
        {@const canChangeRole =
          canManageMemberRoles && member.user_id !== currentUserId && effectiveRole !== "owner"}
        <li class="flex items-center justify-between gap-3 py-3">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-slate-100">
              {member.name ?? member.email}
            </p>
            {#if member.name}
              <p class="truncate text-xs text-slate-400">{member.email}</p>
            {/if}
            <p class="text-xs text-slate-400">
              {effectiveRole === "owner"
                ? m.group_role_owner()
                : effectiveRole === "co_owner"
                  ? m.group_role_co_owner()
                  : m.group_role_member()}
            </p>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-1">
            {#if canChangeRole && effectiveRole === "member"}
              <button
                onclick={() =>
                  coOwnerMutation.mutate({ userId: member.user_id, action: "nominate" })}
                class="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
              >
                {m.group_nominate_co_owner()}
              </button>
            {/if}
            {#if canChangeRole && effectiveRole === "co_owner"}
              <button
                onclick={() => coOwnerMutation.mutate({ userId: member.user_id, action: "revoke" })}
                class="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5"
              >
                {m.group_revoke_co_owner()}
              </button>
            {/if}
            {#if canManageMemberRoles && member.user_id !== currentUserId}
              <button
                onclick={() => (removeTargetUserId = member.user_id)}
                class="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950"
              >
                {m.group_member_remove()}
              </button>
            {/if}
          </div>
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
