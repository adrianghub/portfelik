<script lang="ts">
  import { browser } from "$app/environment";
  import { BarChart } from "layerchart";
  import type { CategoryInsight } from "$lib/services/spending-insight";
  import { formatCurrency } from "$lib/utils";

  let { categories }: { categories: CategoryInsight[] } = $props();

  const data = $derived(categories.slice(0, 6).map((c) => ({ name: c.name, total: c.total })));
</script>

<div class="h-56 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
  {#if browser && data.length > 0}
    <BarChart
      {data}
      x="total"
      y="name"
      orientation="horizontal"
      labels={{ format: (d: unknown) => formatCurrency((d as { total: number }).total) }}
      axis="y"
      grid={false}
      rule={false}
      tooltip={false}
      props={{
        bars: { radius: 4, class: "fill-emerald-400/80" },
        yAxis: { classes: { tickLabel: "text-[10px] fill-slate-400" } },
      }}
    />
  {:else if !browser}
    <div class="flex h-full items-center justify-center text-xs text-slate-500">Ładowanie...</div>
  {:else}
    <div class="flex h-full items-center justify-center text-xs text-slate-500">
      Brak danych kategorii
    </div>
  {/if}
</div>
