<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { supabase } from "$lib/supabase";
  import { fetchProfile } from "$lib/services/profiles";
  import { fetchAdminNotifications } from "$lib/services/notifications";
  import {
    fetchAdminPushSubscriptions,
    deleteAdminPushSubscriptionByEndpoint,
    type AdminPushSubscriptionRow,
  } from "$lib/services/push";
  import type { Notification } from "$lib/types";
  import { formatDate } from "$lib/utils";
  import { createMutation } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import * as m from "$lib/paraglide/messages";

  let notifications = $state<Notification[]>([]);
  let pushSubs = $state<AdminPushSubscriptionRow[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let pendingDelete = $state<string | null>(null);

  onMount(async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      goto("/login");
      return;
    }
    const profile = await fetchProfile(sessionData.session.user.id).catch(() => null);
    if (profile?.role !== "admin") {
      toast.error(m.admin_required());
      goto("/transactions");
      return;
    }
    await loadAll();
  });

  async function loadAll() {
    loading = true;
    error = null;
    try {
      const [notifs, subs] = await Promise.all([
        fetchAdminNotifications(),
        fetchAdminPushSubscriptions(),
      ]);
      notifications = notifs;
      pushSubs = subs;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  const triggerSummaryMutation = createMutation(() => ({
    mutationFn: async () => {
      const { error } = await supabase.rpc("trigger_admin_summary");
      if (error) throw error;
    },
    onSuccess: () => toast.success(m.toast_admin_summary_triggered()),
    onError: (err: Error) => toast.error(err.message),
  }));

  const deleteSubMutation = createMutation(() => ({
    mutationFn: async (endpoint: string) => {
      await deleteAdminPushSubscriptionByEndpoint(endpoint);
    },
    onSuccess: async () => {
      toast.success(m.toast_push_sub_deleted());
      pendingDelete = null;
      await loadAll();
    },
    onError: (err: Error) => {
      toast.error(err.message);
      pendingDelete = null;
    },
  }));
</script>

<div class="container mx-auto max-w-4xl space-y-6 px-4 py-6">
  <h1 class="text-hero font-semibold text-slate-100">{m.admin_title()}</h1>

  <nav class="flex gap-2 border-b border-white/5">
    <a
      href="/admin"
      class="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-slate-400 hover:text-slate-100"
    >
      {m.admin_tab_users()}
    </a>
    <a
      href="/admin/notifications"
      aria-current="page"
      class="border-accent -mb-px border-b-2 px-3 py-2 text-sm font-medium text-slate-100"
    >
      {m.admin_tab_diagnostics()}
    </a>
  </nav>

  <h2 class="text-eyebrow text-slate-300">
    {m.admin_diagnostics_title()}
  </h2>

  {#if loading}
    <div class="space-y-2">
      {#each [0, 1, 2] as _, i (i)}
        <div class="h-10 animate-pulse rounded-xl bg-slate-800/60"></div>
      {/each}
    </div>
  {:else if error}
    <p class="text-sm text-rose-300">{error}</p>
  {:else}
    <!-- Manual triggers -->
    <section class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur">
      <h3 class="text-eyebrow text-slate-300">
        {m.admin_diag_section()}
      </h3>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onclick={() => triggerSummaryMutation.mutate()}
          disabled={triggerSummaryMutation.isPending}
          class="bg-accent-gradient focus-visible:ring-accent rounded-full px-3.5 py-1.5 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        >
          {triggerSummaryMutation.isPending
            ? m.admin_trigger_summary_sending()
            : m.admin_trigger_summary()}
        </button>
      </div>
    </section>

    <!-- Push subscriptions -->
    <section class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur">
      <h3 class="text-eyebrow text-slate-300">
        {m.admin_push_subs_title()}
      </h3>
      {#if pushSubs.length === 0}
        <p class="mt-3 text-sm text-slate-500">{m.admin_push_subs_empty()}</p>
      {:else}
        <ul class="mt-3 divide-y divide-white/5">
          {#each pushSubs as sub (sub.endpoint)}
            <li class="flex items-start justify-between gap-4 py-3 text-sm">
              <div class="min-w-0 flex-1 space-y-0.5">
                <p class="text-slate-100">
                  {sub.device_type ?? m.admin_push_sub_device()}
                </p>
                <p class="truncate text-xs text-slate-500" title={sub.user_agent ?? ""}>
                  {sub.user_agent ?? "-"}
                </p>
                <p class="text-xs text-slate-500">
                  {m.admin_push_sub_last_used()}: {formatDate(sub.last_used_at)}
                </p>
              </div>
              <button
                type="button"
                onclick={() => (pendingDelete = sub.endpoint)}
                class="shrink-0 rounded-full px-2 py-1 text-xs text-rose-300 transition-colors hover:bg-rose-500/10"
              >
                {m.admin_push_sub_delete()}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <!-- Recent notifications -->
    <section class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur">
      <h3 class="text-eyebrow text-slate-300">
        {m.admin_notifications_recent()}
      </h3>
      {#if notifications.length === 0}
        <p class="mt-3 text-sm text-slate-500">{m.admin_notifications_empty()}</p>
      {:else}
        <ul class="mt-3 divide-y divide-white/5">
          {#each notifications as n (n.id)}
            <li class="space-y-0.5 py-3 text-sm">
              <div class="flex items-center justify-between gap-2">
                <span class="font-medium text-slate-100">{n.title ?? n.type}</span>
                <span class="text-xs text-slate-500">{formatDate(n.created_at)}</span>
              </div>
              {#if n.body}
                <p class="text-zinc-500 dark:text-zinc-400">{n.body}</p>
              {/if}
              <p class="text-xs text-slate-500">
                {n.type}{n.read_at ? "" : " · unread"}
              </p>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>

<ConfirmDialog
  open={pendingDelete !== null}
  message={m.admin_confirm_delete_sub()}
  pending={deleteSubMutation.isPending}
  onconfirm={() => pendingDelete && deleteSubMutation.mutate(pendingDelete)}
  onclose={() => (pendingDelete = null)}
/>
