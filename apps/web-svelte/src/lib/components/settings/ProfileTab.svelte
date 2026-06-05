<script lang="ts">
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { updateProfile } from "$lib/services/profiles";
  import { deleteAccount } from "$lib/services/groups";
  import {
    getPushNotificationState,
    requestAndSubscribePush,
    unsubscribeFromPush,
    type PushNotificationState,
  } from "$lib/services/push";
  import { supabase } from "$lib/supabase";
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";
  import type { Profile, ProfileSettings } from "$lib/types";
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
  const reminderCadenceOptions = [7, 14, 30] as const;

  const bankImportReminder = $derived(
    profile?.settings.alerts?.bankImportReminder ?? { enabled: false, cadenceDays: 7 as const }
  );

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

  let pushState = $state<PushNotificationState>("disabled");
  let notifSupported = $state(true);

  async function refreshPushState() {
    notifSupported = "Notification" in window && "serviceWorker" in navigator;
    if (!notifSupported) return;
    pushState = await getPushNotificationState();
  }

  onMount(() => {
    void refreshPushState();
  });

  const subMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!profile) throw new Error("no_profile");
      const ok = await requestAndSubscribePush(profile.id);
      if (!ok) throw new Error("permission_denied");
    },
    onSuccess: async () => {
      await refreshPushState();
      toast.success(m.toast_push_subscribed());
    },
    onError: async () => {
      await refreshPushState();
      toast.error(m.toast_error());
    },
  }));

  const unsubMutation = createMutation(() => ({
    mutationFn: unsubscribeFromPush,
    onSuccess: async () => {
      await refreshPushState();
      toast.success(m.toast_push_unsubscribed());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function nextSettingsForReminder(input: {
    enabled: boolean;
    cadenceDays: 7 | 14 | 30;
  }): ProfileSettings {
    const current = profile?.settings ?? {};
    return {
      ...current,
      alerts: {
        ...(current.alerts ?? {}),
        bankImportReminder: input,
      },
    };
  }

  const reminderMutation = createMutation(() => ({
    mutationFn: (input: { enabled: boolean; cadenceDays: 7 | 14 | 30 }) => {
      if (!profile) throw new Error("no_profile");
      return updateProfile(profile.id, { settings: nextSettingsForReminder(input) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(m.toast_profile_updated());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function setReminderEnabled(enabled: boolean): void {
    reminderMutation.mutate({
      enabled,
      cadenceDays: bankImportReminder.cadenceDays,
    });
  }

  function setReminderCadence(value: string): void {
    const cadenceDays = Number(value);
    if (!reminderCadenceOptions.includes(cadenceDays as 7 | 14 | 30)) return;
    reminderMutation.mutate({
      enabled: bankImportReminder.enabled,
      cadenceDays: cadenceDays as 7 | 14 | 30,
    });
  }
</script>

{#if !profile}
  <div class="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"></div>
{:else}
  <div
    class="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur"
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
            class="focus:border-accent/40 focus:ring-accent/30 min-w-0 flex-1 basis-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-sm text-slate-100 focus:ring-2 focus:outline-none sm:basis-0"
          />
          <button
            type="submit"
            disabled={mutation.isPending}
            class="bg-accent-gradient rounded-lg px-3 py-1 text-xs font-semibold text-slate-900 transition-transform hover:brightness-110 disabled:opacity-50"
          >
            {mutation.isPending ? m.common_saving() : m.common_save()}
          </button>
          <button
            type="button"
            onclick={() => (editing = false)}
            class="rounded-lg border border-white/10 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5"
          >
            {m.common_cancel()}
          </button>
        </form>
      {:else}
        <div class="flex items-center gap-2">
          <span class="text-sm text-slate-100">{profile.name ?? "-"}</span>
          <button
            onclick={startEdit}
            class="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
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
          {#if pushState === "active"}
            {m.profile_notifications_enabled()}
          {:else if pushState === "blocked"}
            {m.profile_notifications_blocked()}
          {:else}
            {m.profile_notifications_disabled()}
          {/if}
        </span>
        {#if pushState === "active"}
          <button
            type="button"
            onclick={() => unsubMutation.mutate()}
            disabled={unsubMutation.isPending}
            class="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            {unsubMutation.isPending ? m.common_saving() : m.profile_notifications_disable()}
          </button>
        {:else if pushState !== "blocked"}
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

  <div class="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur">
    <div class="space-y-3 px-4 py-3">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div class="min-w-0">
          <p class="text-sm font-medium text-slate-100">{m.profile_import_alert_title()}</p>
          <p class="mt-0.5 text-xs text-slate-500">{m.profile_import_alert_hint()}</p>
        </div>
        <label class="inline-flex shrink-0 items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={bankImportReminder.enabled}
            disabled={reminderMutation.isPending}
            onchange={(event) =>
              setReminderEnabled((event.currentTarget as HTMLInputElement).checked)}
            class="h-4 w-4 rounded border-white/10 bg-slate-950"
          />
          {m.profile_import_alert_enabled()}
        </label>
      </div>

      <label class="block max-w-xs text-xs text-slate-400">
        {m.profile_import_alert_cadence()}
        <select
          class="focus-visible:ring-accent mt-1 h-9 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-slate-100 focus-visible:ring-2 focus-visible:outline-none"
          value={bankImportReminder.cadenceDays}
          disabled={reminderMutation.isPending}
          onchange={(event) => setReminderCadence((event.currentTarget as HTMLSelectElement).value)}
        >
          <option value="7">{m.profile_import_alert_cadence_weekly()}</option>
          <option value="14">{m.profile_import_alert_cadence_biweekly()}</option>
          <option value="30">{m.profile_import_alert_cadence_monthly()}</option>
        </select>
      </label>

      <p class="text-xs text-slate-500">{m.profile_import_alert_push_note()}</p>
    </div>
  </div>

  <div class="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur">
    <div
      class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-slate-100">{m.profile_delete_account()}</p>
        <p class="mt-0.5 text-xs text-slate-500">{m.profile_delete_account_hint()}</p>
        {#if deleteError}
          <p class="mt-1.5 text-xs text-rose-300">{deleteError}</p>
        {/if}
      </div>
      <button
        type="button"
        onclick={() => {
          deleteError = null;
          showDeleteConfirm = true;
        }}
        class="shrink-0 rounded-lg border border-rose-500/25 px-3 py-1.5 text-xs font-medium text-rose-300/90 transition-colors hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-200"
      >
        {m.profile_delete_account()}
      </button>
    </div>
  </div>

  <p class="mt-4 px-1 text-xs text-slate-500">
    <a href="/privacy" class="text-slate-400 underline hover:text-slate-200"
      >{m.privacy_policy_link()}</a
    >
  </p>
{/if}

<ConfirmDialog
  open={showDeleteConfirm}
  message={m.profile_delete_account_confirm()}
  onconfirm={() => deleteMutation.mutate()}
  onclose={() => (showDeleteConfirm = false)}
  pending={deleteMutation.isPending}
/>
