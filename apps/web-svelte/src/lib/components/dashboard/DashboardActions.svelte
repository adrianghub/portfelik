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
  import { fetchCategories } from "$lib/services/categories";
  import { productDateIso } from "$lib/date-local";
  import {
    exceededCaps,
    exclusiveWindowEndToInclusive,
    pileWindow,
  } from "$lib/services/pile-progress";
  import { fetchTransactions } from "$lib/services/transactions";
  import { formatCurrency, cn } from "$lib/utils";
  import type { ScopeFilter } from "$lib/utils/list-view-url";
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

  const today = productDateIso(new Date());

  const categoriesQuery = createQuery(() => ({
    queryKey: qk.categories(session.userId!),
    queryFn: fetchCategories,
    enabled: () => !!session.userId,
  }));

  const capCategories = $derived(
    (categoriesQuery.data ?? []).filter(
      (category) =>
        category.type === "expense" &&
        category.cap_amount != null &&
        category.cap_amount > 0 &&
        (category.cap_period === "month" || category.cap_period === "year")
    )
  );

  const capWindow = $derived.by(() => {
    if (capCategories.length === 0) return null;
    let start = "9999-12-31";
    let end = "0000-01-01";
    for (const category of capCategories) {
      const span = pileWindow(category.cap_period!, today);
      if (span.start < start) start = span.start;
      if (span.end > end) end = span.end;
    }
    return { start, end };
  });

  const capTxQuery = createQuery(() => ({
    queryKey: qk.transactions.list(
      session.userId!,
      "piles",
      groupFilter,
      capWindow?.start ?? "",
      capWindow?.end ?? ""
    ),
    queryFn: () => fetchTransactions(capWindow!.start, capWindow!.end),
    enabled: () => !!session.userId && !!capWindow,
  }));

  const capExceptions = $derived(
    capTxQuery.data ? exceededCaps(capCategories, capTxQuery.data, today, groupFilter) : []
  );

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

  function capHref(categoryId: string, period: "month" | "year"): string {
    const { start, end } = pileWindow(period, today);
    const params = new URLSearchParams({
      categoryId,
      startDate: start,
      endDate: exclusiveWindowEndToInclusive(end),
      group: groupFilter,
    });
    return `/transactions?${params.toString()}`;
  }

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

{#if actions.length > 0 || capExceptions.length > 0 || isPending || isError}
  <section
    class="min-w-0"
    aria-label={m.dashboard_exceptions_label()}
    aria-busy={isPending}
    data-tour-id="tour-dashboard-actions"
  >
    {#if actions.length > 0 || capExceptions.length > 0}
      <ul class="min-w-0 space-y-1.5">
        {#each actions as action (action.id)}
          <li class={cn("flex min-w-0 overflow-hidden rounded-xl border", toneClass[action.tone])}>
            <a
              href={action.href}
              class="focus-visible:ring-accent flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <span class="min-w-0 flex-1 font-medium">{action.title}</span>
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
        {#each capExceptions as cap (cap.categoryId)}
          <li class="overflow-hidden rounded-xl border border-rose-500/30 bg-rose-500/10">
            <a
              href={capHref(cap.categoryId, cap.period)}
              class="focus-visible:ring-accent flex items-center gap-3 px-3 py-2.5 text-sm font-medium text-rose-100 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span class="min-w-0 flex-1">
                {m.dashboard_piles_line({
                  name: cap.name,
                  spent: formatCurrency(cap.spent),
                  cap: formatCurrency(cap.cap),
                })}
              </span>
              <ChevronRight size={16} class="shrink-0 opacity-70" aria-hidden="true" />
            </a>
          </li>
        {/each}
      </ul>
    {/if}

    {#if isPending}
      <div class="mt-2.5 space-y-1.5" aria-hidden="true">
        <div class="h-10 animate-pulse rounded-xl bg-white/5"></div>
      </div>
      <span class="sr-only">{m.common_loading()}</span>
    {:else if isError}
      <p class="mt-2 text-sm text-rose-300">{m.dashboard_tasks_error()}</p>
    {/if}
  </section>
{/if}
