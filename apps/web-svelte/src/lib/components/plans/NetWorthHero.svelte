<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { NetWorthSummary } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { Pencil } from "lucide-svelte";

  interface Props {
    summary: NetWorthSummary;
    onedit?: () => void;
  }

  let { summary, onedit }: Props = $props();

  const assetSegments = $derived(
    [
      { key: "cash", label: m.plans_net_worth_cash(), amount: summary.cash, class: "bg-sky-500" },
      {
        key: "invest",
        label: m.plans_net_worth_investments(),
        amount: summary.investments,
        class: "bg-emerald-400",
      },
      {
        key: "re",
        label: m.plans_net_worth_real_estate(),
        amount: summary.realEstate,
        class: "bg-emerald-700",
      },
    ].filter((s) => s.amount > 0)
  );
  const stripTotal = $derived(assetSegments.reduce((s, seg) => s + seg.amount, 0));
</script>

{#if !summary.hasSnapshot}
  <section
    class="rounded-2xl border border-dashed border-white/10 bg-slate-900/40 px-4 py-5 text-center"
  >
    <p class="text-sm text-slate-400">{m.plans_net_worth_empty()}</p>
    {#if onedit}
      <button
        type="button"
        onclick={onedit}
        class="bg-accent-gradient focus-visible:ring-accent mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.plans_net_worth_edit()}
      </button>
    {/if}
  </section>
{:else}
  <section
    class="rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_20%_0%,rgba(45,212,191,0.14),transparent_50%)] p-5"
    aria-label={m.plans_net_worth_title()}
  >
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-eyebrow text-slate-400">{m.plans_net_worth_title()}</p>
        <p
          class={cn(
            "mt-2 text-4xl font-semibold tabular-nums",
            summary.netWorth >= 0 ? "text-accent" : "text-rose-400"
          )}
        >
          {formatCurrency(summary.netWorth)}
        </p>
        <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span class="text-emerald-300 tabular-nums">
            {m.plans_net_worth_assets({ amount: formatCurrency(summary.totalAssets) })}
          </span>
          {#if summary.totalDebt > 0}
            <span class="text-rose-300 tabular-nums">
              {m.plans_net_worth_debt({ amount: formatCurrency(summary.totalDebt) })}
            </span>
          {/if}
        </div>
        {#if summary.asOfDate}
          <p class="mt-2 text-xs text-slate-500">
            {m.plans_net_worth_subtitle({ date: formatDate(summary.asOfDate) })}
          </p>
        {/if}
      </div>
      {#if onedit}
        <button
          type="button"
          onclick={onedit}
          class="focus-visible:ring-accent shrink-0 rounded-full border border-white/10 p-2 text-slate-400 hover:bg-white/5 hover:text-slate-100 focus-visible:ring-2 focus-visible:outline-none"
          aria-label={m.plans_net_worth_edit()}
        >
          <Pencil size={16} aria-hidden="true" />
        </button>
      {/if}
    </div>

    {#if assetSegments.length > 0 && stripTotal > 0}
      <div class="mt-4 flex h-2 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
        {#each assetSegments as seg (seg.key)}
          <div
            class={cn("h-full", seg.class)}
            style="width: {(seg.amount / stripTotal) * 100}%"
          ></div>
        {/each}
      </div>
      <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400">
        {#each assetSegments as seg (seg.key)}
          <span>{seg.label} · {formatCurrency(seg.amount)}</span>
        {/each}
      </div>
    {/if}

    <p class="mt-3 text-[11px] text-slate-500">{m.plans_net_worth_manual_note()}</p>
  </section>
{/if}
