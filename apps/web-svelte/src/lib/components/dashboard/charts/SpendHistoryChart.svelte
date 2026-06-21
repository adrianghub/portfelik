<script lang="ts">
  import { browser } from "$app/environment";
  import { BarChart, Tooltip } from "layerchart";
  import { scaleBand } from "d3-scale";
  import type { PeriodHistoryBucket } from "$lib/services/period-history";
  import { stackCategoryHistory } from "$lib/services/period-history";
  import { formatCurrency } from "$lib/utils";

  let { buckets }: { buckets: PeriodHistoryBucket[] } = $props();

  // Distinct, legible hues; last entry (slate) is reserved for the folded "Inne" bucket.
  const PALETTE = ["#34d399", "#38bdf8", "#a78bfa", "#fbbf24", "#fb7185", "#94a3b8"];

  // Drop leading empty windows so a brand-new account doesn't render months of
  // blank pre-history bars (and their empty tooltips).
  const visibleBuckets = $derived.by(() => {
    const first = buckets.findIndex((b) => b.total > 0);
    return first > 0 ? buckets.slice(first) : buckets;
  });

  const stack = $derived(stackCategoryHistory(visibleBuckets, 5));
  const series = $derived(
    stack.categories.map((key, i) => ({
      key,
      label: key,
      color: PALETTE[i] ?? PALETTE[PALETTE.length - 1],
    }))
  );
  const hasData = $derived(
    stack.rows.some((r) => stack.categories.some((c) => (r[c] as number) > 0))
  );

  function rowTotal(row: Record<string, unknown> | null | undefined): number {
    if (!row) return 0;
    return stack.categories.reduce((sum, c) => sum + (Number(row[c]) || 0), 0);
  }
</script>

<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
  {#if browser && hasData}
    <div class="h-56">
      <BarChart
        data={stack.rows}
        x="label"
        seriesLayout="stack"
        {series}
        xScale={scaleBand().padding(0.4)}
        axis="x"
        grid={false}
        rule={false}
        props={{
          bars: { radius: 2 },
          xAxis: { classes: { tickLabel: "text-[11px] fill-slate-400" } },
          highlight: { area: { class: "fill-white/5" } },
        }}
      >
        <!-- Suppress the tooltip entirely for zero-total windows. -->
        <svelte:fragment slot="tooltip" let:tooltip let:visibleSeries>
          {#if rowTotal(tooltip?.data) > 0}
            <Tooltip.Root
              class="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
              let:data
            >
              <Tooltip.Header class="font-medium text-slate-200"
                >{String(data.label)}</Tooltip.Header
              >
              <Tooltip.List>
                {#each [...visibleSeries].reverse() as s (s.key)}
                  <Tooltip.Item
                    label={s.label}
                    value={Number(data[s.key]) || 0}
                    format={(v: unknown) => formatCurrency(v as number)}
                    color={s.color}
                    valueAlign="right"
                  />
                {/each}
              </Tooltip.List>
            </Tooltip.Root>
          {/if}
        </svelte:fragment>
      </BarChart>
    </div>
    <div class="mt-3 flex flex-wrap gap-x-3 gap-y-1">
      {#each series as s (s.key)}
        <span class="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span class="size-2 rounded-full" style="background:{s.color}"></span>
          {s.label}
        </span>
      {/each}
    </div>
  {:else if !browser}
    <div class="flex h-56 items-center justify-center text-xs text-slate-500">Ładowanie...</div>
  {:else}
    <div class="flex h-56 items-center justify-center text-xs text-slate-500">
      Brak danych do porównania
    </div>
  {/if}
</div>
