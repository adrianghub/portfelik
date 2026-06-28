<script lang="ts">
  import { browser } from "$app/environment";
  import { BarChart, Tooltip } from "layerchart";
  import { scaleBand } from "d3-scale";
  import { Check, X } from "lucide-svelte";
  import type { PeriodHistoryBucket } from "$lib/services/period-history";
  import { stackCategoryHistory } from "$lib/services/period-history";
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import { formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  let {
    buckets,
    onselectperiod,
    onOpenGlossary,
  }: {
    buckets: PeriodHistoryBucket[];
    /** Confirm drill-down from the bar breakdown panel. */
    onselectperiod?: (bucket: PeriodHistoryBucket) => void;
    onOpenGlossary?: (entryId: string) => void;
  } = $props();

  // Distinct, legible hues; last entry (slate) is reserved for the folded
  // "Pozostałe" bucket in the stacked bar chart.
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
  // Current (in-progress) period — bolded on the x-axis so "now" reads from the
  // axis instead of a floating "Teraz" label.
  const currentLabel = $derived(visibleBuckets.find((b) => b.isCurrent)?.label ?? null);

  // The Axis applies one static class to every tick label, so emphasise the
  // current period by toggling classes on the matching <text> directly. A
  // MutationObserver keeps it correct across re-renders (we observe child/text
  // mutations only, not attributes, so toggling classes can't loop).
  function emphasizeCurrentTick(node: HTMLElement, label: string | null) {
    let current = label;
    const apply = () => {
      node.querySelectorAll<SVGTextElement>("text.tickLabel").forEach((t) => {
        const isCur = current != null && t.textContent?.trim() === current;
        t.classList.toggle("font-semibold", isCur);
        t.classList.toggle("fill-slate-100", isCur);
      });
    };
    apply();
    const obs = new MutationObserver(apply);
    obs.observe(node, { childList: true, subtree: true, characterData: true });
    return {
      update(next: string | null) {
        current = next;
        apply();
      },
      destroy() {
        obs.disconnect();
      },
    };
  }

  // Same top-N + fold label as the category breakdown lists on the dashboard.
  const stack = $derived(stackCategoryHistory(visibleBuckets, 8, "Pozostałe"));
  const series = $derived(
    stack.categories.map((key, i) => ({
      key,
      label: key,
      color: PALETTE[i] ?? PALETTE[PALETTE.length - 1],
    }))
  );
  const colorByKey = $derived(new Map(series.map((s) => [s.key, s.color])));

  const hasData = $derived(
    stack.rows.some((r) => stack.categories.some((c) => (r[c] as number) > 0))
  );

  function rowTotal(row: Record<string, unknown> | null | undefined): number {
    if (!row) return 0;
    return stack.categories.reduce((sum, c) => sum + (Number(row[c]) || 0), 0);
  }

  /** Bar click opens a breakdown panel; navigation waits for explicit confirm. */
  let selectedBucket = $state<PeriodHistoryBucket | null>(null);
  /** Ignore the window click that opens the panel (same tick as band click). */
  let ignoreOutsideUntil = 0;

  const selectedSegments = $derived.by(() => {
    const bucket = selectedBucket;
    if (!bucket) return [];
    const row = stack.rows.find((r) => r.label === bucket.label);
    if (!row) return [];
    return stack.categories
      .map((key) => ({
        key,
        amount: Number(row[key]) || 0,
        color: colorByKey.get(key) ?? PALETTE[PALETTE.length - 1],
      }))
      .filter((s) => s.amount > 0);
  });

  function selectBar(label: string) {
    const bucket = bucketByLabel.get(label);
    if (!bucket || bucket.total <= 0) return;
    selectedBucket = selectedBucket?.label === label ? null : bucket;
    ignoreOutsideUntil = Date.now() + 200;
  }

  function barLabelFromDetail(detail: { data?: unknown } | null | undefined): string {
    return String((detail?.data as { label?: unknown })?.label ?? "");
  }

  function dismissSelection() {
    selectedBucket = null;
  }

  function confirmSelection() {
    if (selectedBucket) onselectperiod?.(selectedBucket);
    dismissSelection();
  }

  function clickOutside(e: MouseEvent) {
    if (!selectedBucket || Date.now() < ignoreOutsideUntil) return;
    const t = e.target as HTMLElement;
    if (t.closest("[data-spend-history-popup]")) return;
    if (!t.closest("[data-spend-history-chart]")) dismissSelection();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") dismissSelection();
  }

  /** Inclusive last day of a bucket window (end is exclusive in storage). */
  function bucketEndInclusive(end: string): string {
    const d = new Date(end.slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function formatDayLabel(iso: string): string {
    const [, mm, dd] = iso.slice(0, 10).split("-");
    return `${dd}.${mm}`;
  }

  function bucketPeriodLabel(bucket: PeriodHistoryBucket): string {
    const start = formatDayLabel(bucket.start);
    const end = formatDayLabel(bucketEndInclusive(bucket.end));
    return start === end ? start : `${start} – ${end}`;
  }
</script>

<svelte:window onclick={clickOutside} onkeydown={onKeydown} />

<div
  class="overflow-x-hidden rounded-xl border border-slate-800 bg-slate-900/60 p-4"
  data-spend-history-root
>
  {#if browser && hasData}
    <div
      class={onselectperiod ? "h-56 cursor-pointer" : "h-56"}
      data-spend-history-chart
      use:emphasizeCurrentTick={currentLabel}
    >
      <BarChart
        data={stack.rows}
        x="label"
        seriesLayout="stack"
        {series}
        xScale={scaleBand().padding(0.4)}
        axis="x"
        grid={false}
        rule={false}
        ontooltipclick={(_e, detail) => selectBar(barLabelFromDetail(detail))}
        onbarclick={(_e, detail) => selectBar(barLabelFromDetail(detail))}
        props={{
          bars: { radius: 2 },
          xAxis: { classes: { tickLabel: "text-[11px] fill-slate-400" } },
          highlight: { area: { class: "fill-white/5" } },
        }}
      >
        <!-- Faint band + dashed divider marking the projected forecast region;
             the current period is bolded on the axis instead of a label. -->
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
          {/if}
        </svelte:fragment>

        <!-- Hover: total only. Click opens the breakdown panel below. -->
        <svelte:fragment slot="tooltip" let:tooltip>
          {#if rowTotal(tooltip?.data) > 0}
            {@const label = String((tooltip?.data as { label?: unknown })?.label ?? "")}
            {@const bucket = bucketByLabel.get(label)}
            {#if selectedBucket?.label !== label}
              <Tooltip.Root
                x="data"
                y="pointer"
                anchor="bottom"
                contained="container"
                class="max-w-[min(16rem,90vw)] rounded-lg border border-slate-700 bg-slate-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
                let:data
              >
                <Tooltip.Header class="font-medium text-slate-200">
                  {#if projectedLabels.has(String(data.label))}
                    <span
                      class="mr-1 rounded bg-slate-700 px-1 text-[10px] text-slate-300 uppercase"
                    >
                      {m.dashboard_forecast_tooltip_tag()}
                    </span>
                  {/if}
                  {bucket ? bucketPeriodLabel(bucket) : String(data.label)}
                </Tooltip.Header>
                <div class="mt-0.5 text-sm font-semibold text-slate-100 tabular-nums">
                  {formatCurrency(rowTotal(data))}
                </div>
                <p class="mt-1 text-[10px] text-slate-500">
                  {m.dashboard_history_bar_click_hint()}
                </p>
              </Tooltip.Root>
            {/if}
          {/if}
        </svelte:fragment>
      </BarChart>
    </div>

    {#if selectedBucket}
      <div
        class="mt-3 rounded-lg border border-slate-700 bg-slate-900/95 p-3 shadow-lg"
        role="dialog"
        aria-label={m.dashboard_history_bar_breakdown({
          label: bucketPeriodLabel(selectedBucket),
        })}
        data-spend-history-popup
      >
        <div class="mb-2 flex items-start justify-between gap-2">
          <p class="text-sm font-medium text-slate-200">
            {#if selectedBucket.isProjected}
              <span class="mr-1 rounded bg-slate-700 px-1 text-[10px] text-slate-300 uppercase">
                {m.dashboard_forecast_tooltip_tag()}
              </span>
            {/if}
            {bucketPeriodLabel(selectedBucket)}
          </p>
          <button
            type="button"
            class="focus-visible:ring-accent shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
            aria-label={m.common_close()}
            onclick={dismissSelection}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <ul class="max-h-40 space-y-1.5 overflow-y-auto">
          {#each selectedSegments as segment (segment.key)}
            <li class="flex items-center justify-between gap-3 text-xs">
              <span class="flex min-w-0 items-center gap-2 text-slate-300">
                <span class="size-2 shrink-0 rounded-full" style="background:{segment.color}"
                ></span>
                <span class="truncate">{segment.key}</span>
              </span>
              <span class="shrink-0 font-medium text-slate-100 tabular-nums">
                {formatCurrency(segment.amount)}
              </span>
            </li>
          {/each}
        </ul>

        <div class="mt-3 flex items-center justify-between gap-3 border-t border-slate-800 pt-3">
          <span class="text-xs text-slate-400">
            {m.dashboard_history_bar_total()}:
            <span class="font-semibold text-slate-200 tabular-nums">
              {formatCurrency(selectedBucket.total)}
            </span>
          </span>
          {#if onselectperiod}
            <button
              type="button"
              class="focus-visible:ring-accent inline-flex items-center gap-1.5 rounded-full bg-emerald-600/90 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-emerald-500 focus-visible:ring-2 focus-visible:outline-none"
              onclick={confirmSelection}
            >
              <Check size={14} aria-hidden="true" />
              {m.dashboard_history_bar_details()}
            </button>
          {/if}
        </div>
      </div>
    {/if}

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
            glossaryEntryId="prognoza"
            {onOpenGlossary}
          />
        </span>
      {/if}
    </div>
  {:else if !browser}
    <div class="flex h-56 items-center justify-center text-xs text-slate-400">Ładowanie...</div>
  {:else}
    <div class="flex h-56 items-center justify-center text-xs text-slate-400">
      Brak danych do porównania
    </div>
  {/if}
</div>
