<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { session } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import { ChevronRight, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import { fetchDashboardPlanProgress } from "$lib/services/plan-settlement";
  import type { AttentionPlan } from "$lib/services/dashboard-actions";
  import type { SpendingInsight } from "$lib/services/spending-insight";
  import {
    buildDashboardActions,
    DASHBOARD_ACTIONS_PREVIEW,
    type DashboardAction,
    type DashboardActionTone,
  } from "$lib/services/dashboard-actions";
  import {
    fetchActiveDismissedKeys,
    dismissAction,
    undismissAction,
  } from "$lib/services/action-dismissals";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import DashboardSeeMoreButton from "$lib/components/dashboard/DashboardSeeMoreButton.svelte";
  import { cn } from "$lib/utils";

  interface Props {
    overdueCount: number;
    /** Current-period spending insight (anomalies surface as actions). */
    insight: SpendingInsight | null;
    /** Stable id of the current spending period — scopes dismissals. */
    periodKey: string;
    /** Inclusive end of the current period — anomaly deep links. */
    periodEnd: string;
  }
  let { overdueCount, insight, periodKey, periodEnd }: Props = $props();

  let actionsDialogOpen = $state(false);

  const queryClient = useQueryClient();
  const uid = $derived(session.userId);
  const dismissalsKey = $derived(
    uid ? qk.actionDismissals(uid) : (["user", "", "action-dismissals"] as const)
  );

  const planProgressQuery = createQuery(() => ({
    queryKey: uid ? qk.planProgress(uid) : ["user", "", "plan-progress"],
    queryFn: () => fetchDashboardPlanProgress(),
    enabled: !!uid,
  }));

  const dismissalsQuery = createQuery(() => ({
    queryKey: dismissalsKey,
    queryFn: fetchActiveDismissedKeys,
    enabled: !!uid,
  }));

  const plans = $derived<AttentionPlan[]>(
    (planProgressQuery.data ?? []).map((p) => ({
      planId: p.planId,
      planName: p.planName,
      kind: p.kind,
      eligibleCount: p.eligibleCount,
      monthlyNeeded: p.monthlyNeeded,
      monthlyActual: p.monthlyActual,
      monthlyActualBasis: p.monthlyActualBasis,
    }))
  );

  const anomalies = $derived(
    (insight?.categories ?? [])
      .filter((c) => c.anomaly && c.deltaAbs > 0)
      .map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        total: c.total,
        avgTotal: c.avgTotal,
      }))
  );

  const actions = $derived(
    buildDashboardActions({
      attention: { overdueCount, plans },
      anomalies,
      periodKey,
      periodEnd,
      dismissedKeys: dismissalsQuery.data ?? new Set<string>(),
    })
  );
  const previewActions = $derived(actions.slice(0, DASHBOARD_ACTIONS_PREVIEW));

  const toneClass: Record<DashboardActionTone, string> = {
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15",
    default: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15",
    muted: "border-slate-500/25 bg-slate-500/10 text-slate-200 hover:bg-slate-500/15",
  };

  function optimisticRemove(key: string) {
    queryClient.setQueryData<Set<string>>(dismissalsKey, (old) => new Set(old).add(key));
  }
  function optimisticRestore(key: string) {
    queryClient.setQueryData<Set<string>>(dismissalsKey, (old) => {
      const next = new Set(old);
      next.delete(key);
      return next;
    });
  }

  const dismissMutation = createMutation(() => ({
    mutationFn: (key: string) => dismissAction(key),
    onMutate: (key: string) => {
      const prev = queryClient.getQueryData<Set<string>>(dismissalsKey);
      optimisticRemove(key);
      return { prev };
    },
    onError: (e: unknown, _key: string, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(dismissalsKey, ctx.prev);
      toastError(e);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dismissalsKey }),
  }));

  const undoMutation = createMutation(() => ({
    mutationFn: (key: string) => undismissAction(key),
    onMutate: (key: string) => {
      optimisticRestore(key);
    },
    onError: (e: unknown) => {
      toastError(e);
      void queryClient.invalidateQueries({ queryKey: dismissalsKey });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dismissalsKey }),
  }));

  function handleDismiss(action: DashboardAction) {
    dismissMutation.mutate(action.dismissKey);
    toast(m.dashboard_action_dismiss(), {
      action: {
        label: m.dashboard_action_undo(),
        onClick: () => undoMutation.mutate(action.dismissKey),
      },
    });
  }
</script>

{#snippet actionRow(action: DashboardAction, rounded: "card" | "dialog" = "card")}
  <li
    class={cn(
      "flex min-w-0 items-stretch gap-1.5 overflow-hidden border",
      rounded === "card" ? "rounded-xl" : "rounded-lg",
      toneClass[action.tone]
    )}
  >
    <a
      href={action.href}
      class={cn(
        "focus-visible:ring-accent flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
        rounded === "card" ? "rounded-l-xl" : "rounded-l-lg"
      )}
      title={action.detail ? `${action.title} — ${action.detail}` : action.title}
    >
      <span class="min-w-0 flex-1 overflow-hidden">
        <span class="block truncate">{action.title}</span>
        {#if action.detail}
          <span class="block truncate text-xs opacity-70">{action.detail}</span>
        {/if}
      </span>
      <ChevronRight size={14} class="shrink-0 opacity-70" aria-hidden="true" />
    </a>
    <button
      type="button"
      onclick={() => handleDismiss(action)}
      aria-label={m.dashboard_action_dismiss()}
      class={cn(
        "focus-visible:ring-accent flex shrink-0 items-center px-2 opacity-60 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none",
        rounded === "card" ? "rounded-r-xl" : "rounded-r-lg"
      )}
    >
      <X size={14} aria-hidden="true" />
    </button>
  </li>
{/snippet}

<section
  class="min-w-0 overflow-x-clip rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_85%_0%,rgba(251,191,36,0.1),transparent_45%)] p-4 sm:p-5"
  aria-labelledby="dashboard-actions-title"
  data-tour-id="tour-dashboard-actions"
>
  <p id="dashboard-actions-title" class="text-eyebrow text-slate-400">{m.attention_title()}</p>

  {#if previewActions.length > 0}
    <ul class="mt-2.5 min-w-0 space-y-1.5">
      {#each previewActions as action (action.id)}
        {@render actionRow(action)}
      {/each}
    </ul>
    {#if actions.length > previewActions.length}
      <DashboardSeeMoreButton onclick={() => (actionsDialogOpen = true)} />
    {/if}
  {:else}
    <p class="mt-2 text-sm text-emerald-300/90">{m.attention_empty()}</p>
  {/if}
</section>

<Dialog
  open={actionsDialogOpen}
  onclose={() => (actionsDialogOpen = false)}
  title={m.dashboard_all_actions_title()}
>
  <ul class="space-y-1.5">
    {#each actions as action (action.id)}
      {@render actionRow(action, "dialog")}
    {/each}
  </ul>
</Dialog>
