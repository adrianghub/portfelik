<script lang="ts">
  import { browser } from "$app/environment";
  import { BarChart, Tooltip } from "layerchart";
  import { scaleBand } from "d3-scale";
  import type { PeriodHistoryBucket } from "$lib/services/period-history";
  import { stackCategoryHistory } from "$lib/services/period-history";
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import { formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  let {
    buckets,
    onselectperiod,
  }: {
    buckets: PeriodHistoryBucket[];
    /** Click a bar to drill into that window's transactions. */
    onselectperiod?: (bucket: PeriodHistoryBucket) => void;
  } = $props();

  // Distinct, legible hues; last entry (slate) is reserved for the folded
  // "Pozostałe" bucket — kept in step with SpendingTreemap's vocabulary + top-N.
  const PALETTE = [
    "#34d399",
    "#38bdf8",
    "#a78bfa",
    "#fbbf24",
    "#fb7185",
    "#22d3ee",
    "#f472b6",
    "#fb923c",
    "#94a3b8",
  ];

  // Drop leading empty windows so a brand-new account doesn't render months of
  // blank pre-history bars (and their empty tooltips).
  const visibleBuckets = $derived.by(() => {
    const first = buckets.findIndex((b) => b.total > 0);
    return first > 0 ? buckets.slice(first) : buckets;
  });

  const bucketByLabel = $derived(new Map(visibleBuckets.map((b) => [b.label, b])));

  const projectedLabels = $derived(
    new Set(visibleBuckets.filter((b) => b.isProjected).map((b) => b.label))
  );
  const firstProjectedLabel = $derived(visibleBuckets.find((b) => b.isProjected)?.label ?? null);

  // Same top-N + fold label as the treemap, so the two charts agree on which
  // categories are named vs folded into "Pozostałe".
  const stack = $derived(stackCategoryHistory(visibleBuckets, 8, "Pozostałe"));
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
    <div class={onselectperiod ? "h-56 cursor-pointer" : "h-56"}>
      <BarChart
        data={stack.rows}
        x="label"
        seriesLayout="stack"
        {series}
        xScale={scaleBand().padding(0.4)}
        axis="x"
        grid={false}
        rule={false}
        onbarclick={(_e, detail) => {
          const label = String((detail?.data as { label?: unknown })?.label ?? "");
          const bucket = bucketByLabel.get(label);
          if (bucket) onselectperiod?.(bucket);
        }}
        props={{
          bars: { radius: 2 },
          xAxis: { classes: { tickLabel: "text-[11px] fill-slate-400" } },
          highlight: { area: { class: "fill-white/5" } },
        }}
      >
        <!-- Faint band + "Teraz" divider marking the projected forecast region. -->
        <svelte:fragment slot="belowMarks" let:xScale let:height>
          {#if firstProjectedLabel}
            <!-- Band covers the contiguous rightmost projected region (buckets are [...past, ...forward]). -->
            {@const typedScale = xScale as ReturnType<typeof scaleBand<string>>}
            {@const bandX = typedScale(firstProjectedLabel) ?? 0}
            {@const bandW = (typedScale.range?.()[1] ?? 0) - bandX}
            <rect
              x={bandX}
              y={0}
              width={Math.max(0, bandW)}
              {height}
              class="pointer-events-none fill-white/5"
            />
            <line
              x1={bandX}
              x2={bandX}
              y1={0}
              y2={height}
              class="pointer-events-none stroke-slate-600"
              stroke-dasharray="3 3"
            />
            <text x={bandX + 4} y={12} class="pointer-events-none fill-slate-500 text-[9px]">
              <title>{m.dashboard_now_divider_info()}</title>
              {m.dashboard_forecast_now_divider()}
            </text>
          {/if}
        </svelte:fragment>

        <!-- Suppress the tooltip entirely for zero-total windows. -->
        <svelte:fragment slot="tooltip" let:tooltip let:visibleSeries>
          {#if rowTotal(tooltip?.data) > 0}
            <!-- Anchor over the hovered bar (x="data") and clamp to the chart box
                 (contained="container") so the tooltip stops jumping to the window
                 edge near the first/last bars. -->
            <Tooltip.Root
              x="data"
              y="pointer"
              anchor="bottom"
              contained="container"
              class="rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
              let:data
            >
              <Tooltip.Header class="font-medium text-slate-200">
                {#if projectedLabels.has(String(data.label))}
                  <span class="mr-1 rounded bg-slate-700 px-1 text-[10px] text-slate-300 uppercase">
                    {m.dashboard_forecast_tooltip_tag()}
                  </span>
                {/if}
                {String(data.label)}
              </Tooltip.Header>
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
      {#if projectedLabels.size > 0}
        <span class="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span class="size-2 rounded-full bg-white/20"></span>
          {m.dashboard_forecast_legend()}
          <InfoTooltip
            label={m.dashboard_forecast_legend()}
            text={m.dashboard_forecast_info()}
            side="top"
          />
        </span>
      {/if}
    </div>
    {#if projectedLabels.size > 0}
      <p class="mt-2 inline-flex items-center gap-1 text-[11px] text-slate-500">
        <span>{m.dashboard_forecast_caption()}</span>
        <InfoTooltip
          label={m.dashboard_forecast_tooltip_tag()}
          text={m.dashboard_now_divider_info()}
          side="top"
        />
      </p>
    {/if}
  {:else if !browser}
    <div class="flex h-56 items-center justify-center text-xs text-slate-400">Ładowanie...</div>
  {:else}
    <div class="flex h-56 items-center justify-center text-xs text-slate-400">
      Brak danych do porównania
    </div>
  {/if}
</div>
