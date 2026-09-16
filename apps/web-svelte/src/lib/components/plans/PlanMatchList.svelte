<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { dismissPlanSuggestion, linkPlanTransaction } from "$lib/services/plan-settlement";
  import type { PlanMatchSuggestion } from "$lib/services/plan-match-suggestions";
  import { requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { planSettleHref } from "$lib/utils/plan-routes";
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { page } from "$app/stores";
  import { toast } from "svelte-sonner";

  interface Props {
    matches: PlanMatchSuggestion[];
    showPlanName?: boolean;
  }

  let { matches, showPlanName = true }: Props = $props();

  const queryClient = useQueryClient();

  async function invalidateMatchQueries(planId: string): Promise<void> {
    const userId = requireSessionUserId();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.planLinks(userId, planId) }),
      queryClient.invalidateQueries({ queryKey: qk.planRanked(userId, planId) }),
      queryClient.invalidateQueries({ queryKey: qk.planEligible(userId, planId) }),
      queryClient.invalidateQueries({ queryKey: qk.planDismissed(userId, planId) }),
      queryClient.invalidateQueries({ queryKey: qk.planSuggestionCount(userId, planId) }),
      queryClient.invalidateQueries({ queryKey: qk.planProgress(userId) }),
      queryClient.invalidateQueries({ queryKey: qk.planProgressList(userId) }),
      queryClient.invalidateQueries({ queryKey: qk.planMatches(userId) }),
      queryClient.invalidateQueries({ queryKey: qk.plans(userId) }),
    ]);
  }

  const linkMutation = createMutation(() => ({
    mutationFn: (match: PlanMatchSuggestion) =>
      linkPlanTransaction(match.planId, match.tx.id, { planKind: match.kind }),
    onSuccess: async (_data, match) => {
      await invalidateMatchQueries(match.planId);
      toast.success(m.plan_settle_linked());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const dismissMutation = createMutation(() => ({
    mutationFn: (match: PlanMatchSuggestion) => dismissPlanSuggestion(match.planId, match.tx.id),
    onSuccess: async (_data, match) => {
      await invalidateMatchQueries(match.planId);
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function amountSign(type: PlanMatchSuggestion["tx"]["type"]): string {
    return type === "income" ? "+" : "−";
  }
</script>

<ul class="space-y-1.5">
  {#each matches as match (`${match.planId}:${match.tx.id}`)}
    <li class="rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2.5">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="truncate text-sm font-medium text-slate-100">{match.tx.description}</p>
          <p class="mt-0.5 truncate text-xs text-slate-400">
            {#if showPlanName}
              <a
                href={planSettleHref(match.planId, $page.url.searchParams)}
                class="hover:text-slate-200 hover:underline"
              >
                {match.planName}
              </a>
              ·
            {/if}
            {formatDate(match.tx.date)}{match.tx.category_name
              ? ` · ${match.tx.category_name}`
              : ""}
          </p>
        </div>
        <span
          class={cn(
            "shrink-0 text-sm font-semibold tabular-nums",
            match.tx.type === "income" ? "text-emerald-300" : "text-rose-300"
          )}
        >
          {amountSign(match.tx.type)}{formatCurrency(match.tx.amount)}
        </span>
      </div>
      <div class="mt-2 flex gap-2">
        <button
          type="button"
          onclick={() => linkMutation.mutate(match)}
          disabled={linkMutation.isPending}
          class="bg-accent-gradient focus-visible:ring-accent inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        >
          {m.plan_settle_link()}
        </button>
        <button
          type="button"
          onclick={() => dismissMutation.mutate(match)}
          disabled={dismissMutation.isPending}
          class="focus-visible:ring-accent inline-flex min-h-9 items-center rounded-full border border-white/10 px-3 text-sm font-medium text-slate-400 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        >
          {m.plan_settle_reject()}
        </button>
      </div>
    </li>
  {/each}
</ul>
