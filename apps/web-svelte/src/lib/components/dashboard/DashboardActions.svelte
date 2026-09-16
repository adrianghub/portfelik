<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { session } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import { ChevronRight, X } from "lucide-svelte";
  import { fetchDashboardPlanProgress } from "$lib/services/plan-settlement";
  import {
    dismissAction,
    fetchActiveDismissedKeys,
    undismissAction,
  } from "$lib/services/action-dismissals";
  import {
    buildDashboardActions,
    type AttentionPlan,
    type DashboardActionTone,
    type OverdueAttentionSummary,
  } from "$lib/services/dashboard-actions";
  import PlanMatchList from "$lib/components/plans/PlanMatchList.svelte";
  import { fetchDashboardPlanMatches } from "$lib/services/plan-match-suggestions";
  import type { ScopeFilter } from "$lib/utils/list-view-url";
  import { cn } from "$lib/utils";
  import { toast } from "svelte-sonner";

  type LoadState = "pending" | "error" | "success";

  interface Props {
    groupFilter: ScopeFilter;
    overdue: OverdueAttentionSummary | null;
    overdueState: LoadState;
  }
  let { groupFilter, overdue, overdueState }: Props = $props();

  const queryClient = useQueryClient();
  const uid = $derived(session.userId);

  const planProgressQuery = createQuery(() => ({
    queryKey: uid ? qk.planProgress(uid) : ["user", "", "plan-progress"],
    queryFn: () => fetchDashboardPlanProgress(),
    enabled: !!uid,
  }));

  const dismissalsQuery = createQuery(() => ({
    queryKey: uid ? qk.actionDismissals(uid) : ["user", "", "action-dismissals"],
    queryFn: fetchActiveDismissedKeys,
    enabled: !!uid,
  }));

  const matchesQuery = createQuery(() => ({
    queryKey: uid ? qk.planMatches(uid, groupFilter) : ["user", "", "plan-matches", groupFilter],
    queryFn: () => fetchDashboardPlanMatches(groupFilter),
    enabled: !!uid,
  }));

  const plans = $derived<AttentionPlan[]>(
    (planProgressQuery.data ?? []).map((plan) => ({
      planId: plan.planId,
      planName: plan.planName,
      kind: plan.kind,
      groupId: plan.groupId,
      eligibleCount: plan.eligibleCount,
      monthlyNeeded: plan.monthlyNeeded,
      monthlyActual: plan.monthlyActual,
      monthlyActualBasis: plan.monthlyActualBasis,
    }))
  );

  const isPending = $derived(
    overdueState === "pending" || planProgressQuery.isPending || dismissalsQuery.isPending
  );
  const isError = $derived(overdueState === "error" || planProgressQuery.isError);

  const actions = $derived(
    dismissalsQuery.isPending
      ? []
      : buildDashboardActions({
          overdue,
          plans,
          groupFilter,
          dismissedKeys: dismissalsQuery.data,
        })
  );

  const matches = $derived(matchesQuery.data ?? []);

  function snoozeUntilIso(): string {
    const until = new Date();
    until.setDate(until.getDate() + 7);
    return until.toISOString();
  }

  const hideMutation = createMutation(() => ({
    mutationFn: (actionId: string) => dismissAction(actionId, snoozeUntilIso()),
    onSuccess: async (_data, actionId) => {
      if (uid) {
        await queryClient.invalidateQueries({ queryKey: qk.actionDismissals(uid) });
      }
      toast.success(m.dashboard_task_hidden(), {
        action: {
          label: m.common_undo(),
          onClick: () => undoMutation.mutate(actionId),
        },
      });
    },
  }));

  const undoMutation = createMutation(() => ({
    mutationFn: (actionId: string) => undismissAction(actionId),
    onSuccess: async () => {
      if (uid) {
        await queryClient.invalidateQueries({ queryKey: qk.actionDismissals(uid) });
      }
    },
  }));

  const toneClass: Record<DashboardActionTone, string> = {
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15",
    default: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15",
  };
</script>

{#if actions.length > 0 || matches.length > 0 || isPending || isError}
  <section
    class="h-full min-w-0 overflow-x-clip rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_85%_0%,rgba(251,191,36,0.1),transparent_45%)] p-4"
    aria-labelledby="dashboard-actions-title"
    aria-busy={isPending}
    data-tour-id="tour-dashboard-actions"
  >
    <p id="dashboard-actions-title" class="text-eyebrow text-slate-400">
      {m.dashboard_tasks_title()}
    </p>

    {#if actions.length > 0}
      <ul class="mt-2.5 min-w-0 space-y-1.5">
        {#each actions as action (action.id)}
          <li class={cn("flex min-w-0 overflow-hidden rounded-xl border", toneClass[action.tone])}>
            <a
              href={action.href}
              class="focus-visible:ring-accent flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span class="min-w-0 flex-1">
                <span class="block font-medium">{action.title}</span>
                <span class="mt-0.5 block text-xs opacity-75">{action.detail}</span>
              </span>
              <ChevronRight size={16} class="shrink-0 opacity-70" aria-hidden="true" />
            </a>
            <button
              type="button"
              class="focus-visible:ring-accent shrink-0 px-3 text-current/70 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:outline-none"
              aria-label={m.dashboard_task_hide()}
              disabled={hideMutation.isPending}
              onclick={() => hideMutation.mutate(action.id)}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if matches.length > 0}
      <p class="text-eyebrow mt-3 text-slate-400">{m.dashboard_plan_matches_title()}</p>
      <div class="mt-2.5">
        <PlanMatchList {matches} />
      </div>
    {/if}

    {#if isPending}
      <div class="mt-2.5 space-y-1.5" aria-hidden="true">
        <div class="h-14 animate-pulse rounded-xl bg-white/5"></div>
      </div>
      <span class="sr-only">{m.common_loading()}</span>
    {:else if isError}
      <p class="mt-2 text-sm text-rose-300">{m.dashboard_tasks_error()}</p>
    {/if}
  </section>
{/if}
