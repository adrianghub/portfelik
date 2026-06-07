<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { fetchDashboardPlanProgress } from "$lib/services/plan-settlement";
  import { getPlanEmoji } from "$lib/utils/plan-emoji";
  import { formatCurrency } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { Sparkles } from "lucide-svelte";

  const progressQuery = createQuery(() => ({
    queryKey: ["plan-progress"],
    queryFn: () => fetchDashboardPlanProgress(),
  }));

  const activePlans = $derived(
    (progressQuery.data ?? []).filter(
      (p) =>
        p.eligibleCount > 0 || p.linkedCount > 0 || (p.budgetAmount != null && p.budgetAmount > 0)
    )
  );
</script>

{#if progressQuery.isPending}
  <div class="h-28 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
{:else if progressQuery.isError}
  <p class="text-sm text-rose-400">{m.dashboard_plan_progress_error()}</p>
{:else if activePlans.length > 0}
  <section
    class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
    aria-labelledby="dashboard-plan-progress-title"
  >
    <div class="mb-3 flex items-center justify-between gap-2">
      <p id="dashboard-plan-progress-title" class="text-eyebrow text-slate-400">
        {m.dashboard_plan_progress_title()}
      </p>
      <a href="/plans" class="text-accent shrink-0 text-xs font-semibold hover:underline">
        {m.dashboard_plan_progress_all()}
      </a>
    </div>
    <ul class="space-y-2">
      {#each activePlans.slice(0, 4) as plan (plan.planId)}
        {@const emoji = getPlanEmoji(undefined, plan.planName)}
        {@const spentPct =
          plan.budgetAmount != null && plan.budgetAmount > 0
            ? Math.round(Math.min(1, plan.spentAmount / plan.budgetAmount) * 100)
            : null}
        <li>
          <a
            href={plan.eligibleCount > 0 ? `/plans/${plan.planId}/settle` : `/plans/${plan.planId}`}
            class="block rounded-xl border border-white/5 px-3 py-2 transition-colors hover:bg-white/5"
          >
            <div class="flex items-center gap-2">
              <!-- Emoji avatar -->
              <div
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-800 text-sm"
                aria-hidden="true"
              >
                {#if emoji}
                  {emoji}
                {:else}
                  <span class="text-xs font-semibold text-slate-400">
                    {plan.planName.charAt(0).toUpperCase()}
                  </span>
                {/if}
              </div>
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-200">
                {plan.planName}
              </span>
              {#if plan.eligibleCount > 0}
                <span
                  class="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"
                >
                  <Sparkles size={8} strokeWidth={2} aria-hidden="true" />
                  {plan.eligibleCount}
                </span>
              {/if}
              <span class="shrink-0 text-xs text-slate-400 tabular-nums">
                {formatCurrency(plan.spentAmount)}
                {#if plan.budgetAmount != null && plan.budgetAmount > 0}
                  / {formatCurrency(plan.budgetAmount)}
                  {#if spentPct != null}
                    · {spentPct}%
                  {/if}
                {/if}
              </span>
            </div>
            {#if plan.budgetAmount != null && plan.budgetAmount > 0}
              {@const ratio = Math.min(1, plan.spentAmount / plan.budgetAmount)}
              <div
                class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800"
                role="progressbar"
                aria-valuenow={Math.round(ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  class="bg-accent-gradient h-full rounded-full transition-all"
                  style={`width: ${Math.round(ratio * 100)}%`}
                ></div>
              </div>
            {:else if plan.linkedCount > 0}
              <p class="mt-1 text-xs text-slate-400">
                {m.dashboard_plan_progress_linked_count({ count: plan.linkedCount })}
              </p>
            {/if}
          </a>
        </li>
      {/each}
    </ul>
  </section>
{/if}
