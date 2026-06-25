<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { createQuery, createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { ChevronRight, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import { fetchProfile } from "$lib/services/profiles";
  import { fetchLastCommittedImportSession } from "$lib/services/bank-import";
  import { fetchDashboardPlanProgress } from "$lib/services/plan-settlement";
  import { getBankImportReminder } from "$lib/profile-settings";
  import type { AttentionPlan } from "$lib/dashboard-attention";
  import type { SpendingInsight } from "$lib/services/spending-insight";
  import {
    buildDashboardActions,
    type DashboardAction,
    type DashboardActionTone,
  } from "$lib/services/dashboard-actions";
  import {
    fetchActiveDismissedKeys,
    dismissAction,
    undismissAction,
  } from "$lib/services/action-dismissals";
  import { cn } from "$lib/utils";

  interface Props {
    userId: string | null;
    overdueCount: number;
    /** Current-period spending insight (anomalies surface as actions). */
    insight: SpendingInsight | null;
    /** Stable id of the current spending period — scopes anomaly dismissals. */
    periodKey: string;
  }
  let { userId, overdueCount, insight, periodKey }: Props = $props();

  const queryClient = useQueryClient();
  const DISMISSALS_KEY = ["action-dismissals"] as const;

  const profileQuery = createQuery(() => ({
    queryKey: ["profile", userId],
    queryFn: () => fetchProfile(userId!),
    enabled: !!userId,
  }));

  const importHealthQuery = createQuery(() => ({
    queryKey: ["import-health"],
    queryFn: fetchLastCommittedImportSession,
  }));

  const planProgressQuery = createQuery(() => ({
    queryKey: ["plan-progress"],
    queryFn: () => fetchDashboardPlanProgress(),
  }));

  const dismissalsQuery = createQuery(() => ({
    queryKey: DISMISSALS_KEY,
    queryFn: fetchActiveDismissedKeys,
  }));

  const cadenceDays = $derived(getBankImportReminder(profileQuery.data?.settings).cadenceDays);

  const daysSinceImport = $derived.by(() => {
    const committed = importHealthQuery.data?.committed_at;
    if (!committed) return null;
    const diff = (Date.now() - new Date(committed).getTime()) / (1000 * 60 * 60 * 24);
    return Math.floor(diff);
  });

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

  // Anomalies are already computed by computeSpendingInsight; only increases (deltaAbs > 0)
  // are worth a "sprawdź" nudge — a category dropping below trend is not an action.
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

  const settleReady = $derived(
    (planProgressQuery.data ?? []).map((p) => ({
      planId: p.planId,
      planName: p.planName,
      eligibleCount: p.eligibleCount,
    }))
  );

  const actions = $derived(
    buildDashboardActions({
      attention: { daysSinceImport, cadenceDays, overdueCount, plans },
      anomalies,
      settleReady,
      debtDetected: [],
      periodKey,
      dismissedKeys: dismissalsQuery.data ?? new Set<string>(),
    })
  );

  const toneClass: Record<DashboardActionTone, string> = {
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15",
    default: "border-emerald-500/25 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15",
    muted: "border-slate-500/25 bg-slate-500/10 text-slate-200 hover:bg-slate-500/15",
  };

  function optimisticRemove(key: string) {
    queryClient.setQueryData<Set<string>>(DISMISSALS_KEY, (old) => new Set(old).add(key));
  }
  function optimisticRestore(key: string) {
    queryClient.setQueryData<Set<string>>(DISMISSALS_KEY, (old) => {
      const next = new Set(old);
      next.delete(key);
      return next;
    });
  }

  const dismissMutation = createMutation(() => ({
    mutationFn: (key: string) => dismissAction(key),
    onMutate: (key: string) => {
      const prev = queryClient.getQueryData<Set<string>>(DISMISSALS_KEY);
      optimisticRemove(key);
      return { prev };
    },
    onError: (e: unknown, _key: string, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(DISMISSALS_KEY, ctx.prev);
      toastError(e);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: DISMISSALS_KEY }),
  }));

  const undoMutation = createMutation(() => ({
    mutationFn: (key: string) => undismissAction(key),
    onMutate: (key: string) => {
      optimisticRestore(key);
    },
    onError: (e: unknown) => {
      toastError(e);
      void queryClient.invalidateQueries({ queryKey: DISMISSALS_KEY });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: DISMISSALS_KEY }),
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

<section
  class="rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_85%_0%,rgba(251,191,36,0.1),transparent_45%)] p-5"
  aria-labelledby="dashboard-actions-title"
>
  <p id="dashboard-actions-title" class="text-eyebrow text-slate-400">{m.attention_title()}</p>

  {#if actions.length > 0}
    <ul class="mt-3 space-y-2">
      {#each actions as action (action.id)}
        <li class={cn("flex items-stretch gap-1.5 rounded-xl border", toneClass[action.tone])}>
          <a
            href={action.href}
            class="focus-visible:ring-accent flex flex-1 items-center justify-between gap-2 rounded-l-xl px-3 py-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <span class="min-w-0">
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
            class="focus-visible:ring-accent flex items-center rounded-r-xl px-2 opacity-60 transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="mt-2 text-sm text-emerald-300/90">{m.attention_empty()}</p>
  {/if}
</section>
