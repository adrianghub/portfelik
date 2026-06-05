<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { fetchActivePlanProgress } from "$lib/services/plan-settlement";
  import { formatCurrency } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { ShoppingBasket } from "lucide-svelte";

  const progressQuery = createQuery(() => ({
    queryKey: ["plan-progress"],
    queryFn: fetchActivePlanProgress,
  }));

  const activePlans = $derived((progressQuery.data ?? []).filter((p) => p.linkedCount > 0 || true));
</script>

{#if progressQuery.isPending}
  <div class="h-28 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
{:else if activePlans.length > 0}
  <section
    class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
    aria-labelledby="dashboard-plan-progress-title"
  >
    <div class="mb-3 flex items-center justify-between gap-2">
      <p id="dashboard-plan-progress-title" class="text-eyebrow text-slate-400">
        {m.dashboard_plan_progress_title()}
      </p>
      <ShoppingBasket size={18} class="shrink-0 text-slate-400" aria-hidden="true" />
    </div>
    <ul class="space-y-2">
      {#each activePlans.slice(0, 4) as plan (plan.planId)}
        <li>
          <a
            href="/plans/{plan.planId}"
            class="block rounded-xl border border-white/5 px-3 py-2 transition-colors hover:bg-white/5"
          >
            <div class="flex items-baseline justify-between gap-2">
              <span class="truncate text-sm font-medium text-slate-200">{plan.planName}</span>
              <span class="shrink-0 text-xs text-slate-400 tabular-nums">
                {formatCurrency(plan.linkedAmount)}
                {#if plan.plannedAmount != null && plan.plannedAmount > 0}
                  / {formatCurrency(plan.plannedAmount)}
                {/if}
              </span>
            </div>
            {#if plan.plannedAmount != null && plan.plannedAmount > 0}
              {@const ratio = Math.min(1, plan.linkedAmount / plan.plannedAmount)}
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
    <a href="/plans" class="text-accent mt-3 inline-block text-xs hover:underline">
      {m.dashboard_plan_progress_cta()}
    </a>
  </section>
{/if}
