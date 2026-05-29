<script lang="ts">
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { updateProfile } from "$lib/services/profiles";
  import { deleteAccount } from "$lib/services/groups";
  import { requestAndSubscribePush, unsubscribeFromPush } from "$lib/services/push";
  import { supabase } from "$lib/supabase";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import type { Profile } from "$lib/types";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    profile: Profile | null;
  }
  let { profile }: Props = $props();

  const queryClient = useQueryClient();

  let editing = $state(false);
  let nameInput = $state("");

  function startEdit() {
    nameInput = profile?.name ?? "";
    editing = true;
  }

  const mutation = createMutation(() => ({
    mutationFn: () => updateProfile(profile!.id, { name: nameInput }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(m.toast_profile_updated());
      editing = false;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  let showDeleteConfirm = $state(false);
  let deleteError = $state<string | null>(null);

  const deleteMutation = createMutation(() => ({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      toast.success(m.toast_account_deleted());
      await supabase.auth.signOut();
      goto("/login");
    },
    onError: (err: Error) => {
      if (err.message?.includes("has_owned_groups")) {
        deleteError = m.profile_delete_account_has_groups();
      } else {
        deleteError = null;
        toast.error(m.toast_error());
      }
    },
  }));

  function handleSubmit(e: Event) {
    e.preventDefault();
    mutation.mutate();
  }

  let notifPermission = $state<NotificationPermission>("default");
  let notifSupported = $state(true);

  onMount(() => {
    notifSupported = "Notification" in window && "serviceWorker" in navigator;
    if ("Notification" in window) notifPermission = Notification.permission;
  });

  const subMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!profile) throw new Error("no_profile");
      const ok = await requestAndSubscribePush(profile.id);
      if (!ok) throw new Error("permission_denied");
    },
    onSuccess: () => {
      notifPermission = "granted";
      toast.success(m.toast_push_subscribed());
    },
    onError: () => {
      // Reflect the browser's decision so the UI shows the blocked state.
      if ("Notification" in window) notifPermission = Notification.permission;
      toast.error(m.toast_error());
    },
  }));

  const unsubMutation = createMutation(() => ({
    mutationFn: unsubscribeFromPush,
    onSuccess: () => {
      notifPermission = "default";
      toast.success(m.toast_push_unsubscribed());
    },
    onError: () => toast.error(m.toast_error()),
  }));
</script>

{#if !profile}
  <div class="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"></div>
{:else}
  <div
    class="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900"
  >
    <div class="flex items-center justify-between gap-3 px-4 py-3">
      <span class="shrink-0 text-sm text-slate-400">{m.profile_name()}</span>
      {#if editing}
        <form
          onsubmit={handleSubmit}
          class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2"
        >
          <!-- svelte-ignore a11y_autofocus -->
          <input
            type="text"
            bind:value={nameInput}
            autofocus
            class="min-w-0 flex-1 basis-full rounded-lg border border-slate-200 px-2 py-1 text-sm focus:ring-2 focus:ring-emerald-500/10 focus:outline-none sm:basis-0 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-white/10"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            class="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            {mutation.isPending ? m.common_saving() : m.common_save()}
          </button>
          <button
            type="button"
            onclick={() => (editing = false)}
            class="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {m.common_cancel()}
          </button>
        </form>
      {:else}
        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-100">{profile.name ?? "—"}</span>
          <button
            onclick={startEdit}
            class="p-1 text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-400"
            aria-label={m.common_edit()}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
            >
          </button>
        </div>
      {/if}
    </div>
    <div class="flex justify-between px-4 py-3">
      <span class="text-sm text-slate-400">{m.profile_email()}</span>
      <span class="text-sm text-slate-100">{profile.email}</span>
    </div>
    <div class="flex justify-between px-4 py-3">
      <span class="text-sm text-slate-400">{m.profile_role()}</span>
      <span class="text-sm text-slate-100">
        {profile.role === "admin" ? m.profile_role_admin() : m.profile_role_user()}
      </span>
    </div>
  </div>

  {#if notifSupported}
    <div
      class="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur"
    >
      <div
        class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
      >
        <span class="text-sm font-medium text-slate-100">
          {#if notifPermission === "granted"}
            {m.profile_notifications_enabled()}
          {:else if notifPermission === "denied"}
            {m.profile_notifications_blocked()}
          {:else}
            {m.profile_notifications_disabled()}
          {/if}
        </span>
        {#if notifPermission === "granted"}
          <button
            type="button"
            onclick={() => unsubMutation.mutate()}
            disabled={unsubMutation.isPending}
            class="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {unsubMutation.isPending ? m.common_saving() : m.profile_notifications_disable()}
          </button>
        {:else if notifPermission === "default"}
          <button
            type="button"
            onclick={() => subMutation.mutate()}
            disabled={subMutation.isPending}
            class="bg-accent-gradient shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-900 transition-transform hover:brightness-110 disabled:opacity-50"
          >
            {subMutation.isPending ? m.common_saving() : m.profile_notifications_enable()}
          </button>
        {/if}
      </div>
    </div>
  {/if}

  <div
    class="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900 dark:bg-rose-950"
  >
    <p class="text-sm font-medium text-rose-700 dark:text-rose-300">{m.profile_delete_account()}</p>
    <p class="mt-1 text-xs text-rose-300 dark:text-rose-400">
      {m.profile_delete_account_confirm()}
    </p>
    {#if deleteError}
      <p class="mt-2 text-xs font-medium text-rose-700 dark:text-rose-300">{deleteError}</p>
    {/if}
    <button
      type="button"
      onclick={() => {
        deleteError = null;
        showDeleteConfirm = true;
      }}
      class="mt-3 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-300 transition-colors hover:bg-rose-100 dark:border-rose-700 dark:bg-slate-900 dark:text-rose-400 dark:hover:bg-rose-900"
    >
      {m.profile_delete_account()}
    </button>
  </div>
{/if}

<ConfirmDialog
  open={showDeleteConfirm}
  message={m.profile_delete_account_confirm()}
  onconfirm={() => deleteMutation.mutate()}
  onclose={() => (showDeleteConfirm = false)}
  pending={deleteMutation.isPending}
/>
