<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { updateProfile } from "$lib/services/profiles";
  import { deleteAccount } from "$lib/services/groups";
  import { buildAccountExport, downloadAccountExport } from "$lib/services/account-export";
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
  import { getBankImportReminder, type ImportReminderCadence } from "$lib/profile-settings";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import GlossarySheet from "$lib/components/ui/GlossarySheet.svelte";
  import { track, trackOnce } from "$lib/analytics";
  import { canSeedDemo, clearDemoData, hasDemoData, seedDemoData } from "$lib/services/demo-data";
  import { fetchPlans } from "$lib/services/plans";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    profile: Profile | null;
  }
  let { profile }: Props = $props();

  const queryClient = useQueryClient();

  let editing = $state(false);
  let nameInput = $state("");
  const reminderCadenceOptions = [7, 14, 30] as const;

  const bankImportReminder = $derived(getBankImportReminder(profile?.settings));

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
    onError: (err) => toastError(err),
  }));

  let showDeleteConfirm = $state(false);
  let glossaryOpen = $state(false);
  let deleteError = $state<string | null>(null);

  const txCountQuery = createQuery(() => ({
    queryKey: ["transactions", "count-probe"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("transactions")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!profile,
  }));

  const demoProbeQuery = createQuery(() => ({
    queryKey: ["transactions", "demo-probe"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, description")
        .like("description", "Demo:%")
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  }));

  const plansQuery = createQuery(() => ({
    queryKey: ["plans"],
    queryFn: fetchPlans,
    enabled: !!profile,
  }));

  const demoActive = $derived(
    hasDemoData({
      transactions: demoProbeQuery.data ?? [],
      plans: plansQuery.data ?? [],
    })
  );

  const canLoadDemo = $derived(canSeedDemo(txCountQuery.data ?? 0));

  const seedDemoMutation = createMutation(() => ({
    mutationFn: seedDemoData,
    onSuccess: async (result) => {
      track("demo_loaded", { row_count: result.inserted });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions", "count-probe"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions", "demo-probe"] });
      toast.success(m.demo_loaded_toast());
    },
    onError: (err) => toastError(err),
  }));

  const clearDemoMutation = createMutation(() => ({
    mutationFn: clearDemoData,
    onSuccess: async (result) => {
      track("demo_cleared", { row_count: result.deleted });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions", "count-probe"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions", "demo-probe"] });
      toast.success(m.demo_cleared_toast());
    },
    onError: (err) => toastError(err),
  }));

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
        toastError(err);
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
      trackOnce("push_enabled");
      await refreshPushState();
      toast.success(m.toast_push_subscribed());
    },
    onError: async (err) => {
      await refreshPushState();
      toastError(err);
    },
  }));

  const unsubMutation = createMutation(() => ({
    mutationFn: unsubscribeFromPush,
    onSuccess: async () => {
      await refreshPushState();
      toast.success(m.toast_push_unsubscribed());
    },
    onError: (err) => toastError(err),
  }));

  function nextSettingsForReminder(input: {
    enabled: boolean;
    cadenceDays: ImportReminderCadence;
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
    mutationFn: (input: { enabled: boolean; cadenceDays: ImportReminderCadence }) => {
      if (!profile) throw new Error("no_profile");
      return updateProfile(profile.id, { settings: nextSettingsForReminder(input) });
    },
    onSuccess: async (_data, input) => {
      if (input.enabled) {
        trackOnce("import_reminder_enabled", { cadence_days: input.cadenceDays });
      }
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success(m.toast_profile_updated());
    },
    onError: (err) => toastError(err),
  }));

  function setReminderEnabled(enabled: boolean): void {
    reminderMutation.mutate({
      enabled,
      cadenceDays: bankImportReminder.cadenceDays,
    });
    // A reminder is the intent; push is its delivery channel on this device. Enabling the
    // reminder also registers OS push in the same user gesture so the alert actually reaches
    // the phone instead of only the in-app row. Push stays optional - if permission is
    // denied/blocked, the reminder still lands in the in-app notification row.
    if (enabled && notifSupported && pushState === "disabled") {
      subMutation.mutate();
    }
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
          <p class="mt-0.5 text-xs text-slate-400">{m.profile_import_alert_hint()}</p>
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
          class="focus-visible:ring-accent mt-1 h-9 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-slate-100 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
          value={String(bankImportReminder.cadenceDays)}
          disabled={!bankImportReminder.enabled || reminderMutation.isPending}
          onchange={(event) => setReminderCadence((event.currentTarget as HTMLSelectElement).value)}
        >
          <option value="7">{m.profile_import_alert_cadence_weekly()}</option>
          <option value="14">{m.profile_import_alert_cadence_biweekly()}</option>
          <option value="30">{m.profile_import_alert_cadence_monthly()}</option>
        </select>
      </label>

      <p class="text-xs text-slate-400">{m.profile_import_alert_push_note()}</p>
    </div>
  </div>

  <div class="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur">
    <div
      class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-slate-100">{m.demo_settings_title()}</p>
        <p class="mt-0.5 text-xs text-slate-400">{m.demo_settings_body()}</p>
      </div>
      <div class="flex flex-wrap gap-2">
        {#if demoActive}
          <button
            type="button"
            class="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5 disabled:opacity-50"
            disabled={clearDemoMutation.isPending}
            onclick={() => clearDemoMutation.mutate()}
          >
            {m.demo_settings_clear()}
          </button>
        {:else}
          <button
            type="button"
            class="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5 disabled:opacity-50"
            disabled={!canLoadDemo || seedDemoMutation.isPending}
            title={!canLoadDemo ? m.demo_seed_blocked() : undefined}
            onclick={() => seedDemoMutation.mutate()}
          >
            {m.demo_settings_load()}
          </button>
        {/if}
      </div>
    </div>
  </div>

  <div class="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur">
    <div
      class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-slate-100">{m.glossary_title()}</p>
        <p class="mt-0.5 text-xs text-slate-400">
          {m.glossary_open_settings({ appName: m.app_name() })}
        </p>
      </div>
      <button
        type="button"
        onclick={() => (glossaryOpen = true)}
        class="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5"
      >
        {m.glossary_title()}
      </button>
    </div>
  </div>

  <div class="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur">
    <div
      class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-slate-100">{m.settings_export_title()}</p>
        <p class="mt-0.5 text-xs text-slate-400">{m.settings_export_body()}</p>
      </div>
      <button
        type="button"
        onclick={async () => {
          try {
            const bundle = await buildAccountExport();
            downloadAccountExport(bundle);
            toast.success(m.settings_export_success());
          } catch (err) {
            toastError(err);
          }
        }}
        class="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/5"
      >
        {m.settings_export_action()}
      </button>
    </div>
  </div>

  <div class="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur">
    <div
      class="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
    >
      <div class="min-w-0">
        <p class="text-sm font-medium text-slate-100">{m.profile_delete_account()}</p>
        <p class="mt-0.5 text-xs text-slate-400">{m.profile_delete_account_hint()}</p>
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

  <p class="mt-4 px-1 text-xs text-slate-400">
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

<GlossarySheet open={glossaryOpen} onclose={() => (glossaryOpen = false)} />
