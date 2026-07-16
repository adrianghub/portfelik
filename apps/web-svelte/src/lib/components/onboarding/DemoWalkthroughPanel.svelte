<script lang="ts">
  import { goto } from "$app/navigation";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { track } from "$lib/analytics";
  import {
    demoWalkthroughActionLabel,
    demoWalkthroughActionsVisible,
    demoWalkthroughPanelCopy,
    type DemoWalkthroughActionId,
  } from "$lib/content/onboarding";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import { guidedTourStatus } from "$lib/services/guided-tour";
  import { resetGuidedTourForReplay } from "$lib/services/guided-tour-actions";
  import {
    canSeedDemo,
    clearDemoData,
    fetchDemoProbe,
    hasDemoData,
    seedDemoData,
  } from "$lib/services/demo-data";
  import { fetchPlans } from "$lib/services/plans";
  import { toastError } from "$lib/toast-error";
  import type { Profile } from "$lib/types";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";
  import { session, requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";

  interface Props {
    profile: Profile | null;
  }

  let { profile }: Props = $props();

  const queryClient = useQueryClient();
  const panel = demoWalkthroughPanelCopy();
  const uid = $derived(session.userId);

  const demoProbeQuery = createQuery(() => ({
    queryKey: uid
      ? qk.transactions.list(uid, "demo-probe")
      : ["user", "", "transactions", "demo-probe"],
    queryFn: fetchDemoProbe,
    enabled: !!uid,
  }));

  const plansQuery = createQuery(() => ({
    queryKey: uid ? qk.plans(uid) : ["user", "", "plans"],
    queryFn: fetchPlans,
    enabled: !!uid,
  }));

  const demoActive = $derived(
    hasDemoData({
      transactions: demoProbeQuery.data?.transactions ?? [],
      plans: plansQuery.data ?? [],
      netWorthItems: demoProbeQuery.data?.netWorthItems ?? [],
    })
  );

  const canLoadDemo = $derived(canSeedDemo({ demoActive }));
  const tourStatus = $derived(guidedTourStatus(profile?.settings));
  const visibleActions = $derived(demoWalkthroughActionsVisible({ demoActive }));

  function tourStatusLabel(): string {
    switch (tourStatus) {
      case "in_progress":
        return m.tour_status_in_progress();
      case "completed":
        return m.tour_status_completed();
      case "dismissed":
        return m.tour_status_dismissed();
      default:
        return m.tour_status_not_started();
    }
  }

  async function invalidateDemoQueries(): Promise<void> {
    const u = requireSessionUserId();
    await queryClient.invalidateQueries({ queryKey: qk.transactions.all(u) });
    await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
    await queryClient.invalidateQueries({ queryKey: qk.transactions.list(u, "count-probe") });
    await queryClient.invalidateQueries({ queryKey: qk.transactions.list(u, "demo-probe") });
  }

  const seedDemoMutation = createMutation(() => ({
    mutationFn: seedDemoData,
    onSuccess: async (result) => {
      track("demo_loaded", { row_count: result.inserted });
      await invalidateDemoQueries();
      toast.success(m.demo_loaded_toast());
    },
    onError: (err) => toastError(err),
  }));

  const clearDemoMutation = createMutation(() => ({
    mutationFn: clearDemoData,
    onSuccess: async (result) => {
      track("demo_cleared", { row_count: result.deleted });
      await invalidateDemoQueries();
      toast.success(m.demo_cleared_toast());
    },
    onError: (err) => toastError(err),
  }));

  const restartTourMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!profile) throw new Error("no_profile");
      await resetGuidedTourForReplay(queryClient, profile.id, profile);
    },
    onSuccess: () => {
      toast.success(m.tour_restarted_toast());
    },
    onError: (err) => toastError(err),
  }));

  const loadAndTourMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!profile) throw new Error("no_profile");
      if (!canLoadDemo) throw new Error("demo_active");
      await seedDemoData();
      await invalidateDemoQueries();
      track("demo_loaded", { row_count: 1 });
      await resetGuidedTourForReplay(queryClient, profile.id, profile);
      await goto("/dashboard");
    },
    onSuccess: () => {
      toast.success(m.demo_loaded_toast());
    },
    onError: (err) => toastError(err),
  }));

  function actionDisabled(id: DemoWalkthroughActionId): boolean {
    switch (id) {
      case "clear":
        return clearDemoMutation.isPending;
      case "load":
        return !canLoadDemo || seedDemoMutation.isPending;
      case "load_and_tour":
        return !canLoadDemo || loadAndTourMutation.isPending;
      case "restart_tour":
        return restartTourMutation.isPending;
    }
  }

  // Same guard as the dashboard banner: clear deletes by "Demo:" prefix,
  // confirm before firing.
  let confirmClearOpen = $state(false);

  function runAction(id: DemoWalkthroughActionId): void {
    switch (id) {
      case "clear":
        confirmClearOpen = true;
        break;
      case "load":
        seedDemoMutation.mutate();
        break;
      case "load_and_tour":
        loadAndTourMutation.mutate();
        break;
      case "restart_tour":
        restartTourMutation.mutate();
        break;
    }
  }
</script>

<div
  class="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur"
  data-tour-id="tour-demo-walkthrough"
>
  <div class="flex flex-col gap-3 px-4 py-3">
    <div class="min-w-0">
      <p class="text-sm font-medium text-slate-100">{panel.title}</p>
      <p class="mt-0.5 text-xs text-slate-400">{panel.body}</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <span
        class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium {demoActive
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
          : 'border-white/10 bg-white/5 text-slate-300'}"
      >
        {demoActive ? panel.statusActive : panel.statusNone}
      </span>
      <span
        class="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-slate-300"
      >
        {tourStatusLabel()}
      </span>
    </div>

    <div class="flex flex-wrap gap-2">
      {#each visibleActions as action (action.id)}
        <button
          type="button"
          class="{action.variant === 'accent'
            ? 'bg-accent-gradient text-slate-900'
            : 'border border-white/10 text-slate-200 hover:bg-white/5'} rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 {action.variant ===
          'accent'
            ? 'font-semibold'
            : 'font-medium'}"
          disabled={actionDisabled(action.id)}
          onclick={() => runAction(action.id)}
        >
          {demoWalkthroughActionLabel(action.id)}
        </button>
      {/each}
    </div>
  </div>
</div>

<ConfirmDialog
  open={confirmClearOpen}
  message={m.demo_clear_confirm_message()}
  pending={clearDemoMutation.isPending}
  onconfirm={() => {
    void clearDemoMutation.mutateAsync().then(() => {
      confirmClearOpen = false;
    });
  }}
  onclose={() => (confirmClearOpen = false)}
/>
