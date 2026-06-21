<script lang="ts">
  import { squarifyTreemap } from "$lib/utils/treemap-layout";
  import { formatCurrency } from "$lib/utils";

  export interface TreemapCategory {
    categoryId: string | null;
    name: string;
    total: number;
    deltaPct: number | null;
  }

  let {
    categories,
    categoryHref,
  }: {
    categories: TreemapCategory[];
    /** Build a period-aware transactions link for a category (null = all). */
    categoryHref: (categoryId: string | null) => string;
  } = $props();

  // Distinct hues; "Inne" (folded remainder, categoryId === null) renders slate.
  const PALETTE = ["#34d399", "#38bdf8", "#a78bfa", "#fbbf24", "#fb7185", "#22d3ee", "#f472b6"];
  const OTHER_COLOR = "#94a3b8";

  let boxW = $state(0);
  let boxH = $state(0);

  const tiles = $derived(
    squarifyTreemap(
      categories.map((c) => ({ value: c.total, data: c })),
      boxW,
      boxH
    )
  );

  function colorFor(c: TreemapCategory, i: number): string {
    return c.categoryId === null ? OTHER_COLOR : PALETTE[i % PALETTE.length];
  }
  function deltaLabel(pct: number | null): string {
    if (pct === null) return "";
    return `${pct >= 0 ? "↑" : "↓"}${Math.abs(Math.round(pct))}%`;
  }
</script>

<div bind:clientWidth={boxW} bind:clientHeight={boxH} class="relative h-64 w-full sm:h-72">
  {#each tiles as t, i (t.data.categoryId ?? t.data.name)}
    <a
      href={categoryHref(t.data.categoryId)}
      title={`${t.data.name} · ${formatCurrency(t.data.total)}`}
      class="focus-visible:ring-accent absolute block overflow-hidden p-0.5 focus-visible:ring-2 focus-visible:outline-none"
      style="left:{t.x}px; top:{t.y}px; width:{t.w}px; height:{t.h}px;"
    >
      <div
        class="flex h-full w-full flex-col justify-between rounded-md p-2 text-slate-950 transition-opacity hover:opacity-90"
        style="background:{colorFor(t.data, i)};"
      >
        {#if t.h >= 34}
          <span class="truncate text-xs leading-tight font-semibold">{t.data.name}</span>
        {/if}
        {#if t.w >= 56 && t.h >= 52}
          <span class="flex items-baseline justify-between gap-1">
            <span class="truncate text-sm font-bold tabular-nums"
              >{formatCurrency(t.data.total)}</span
            >
            {#if t.data.deltaPct !== null && t.w >= 100}
              <span class="shrink-0 text-[10px] font-semibold opacity-80"
                >{deltaLabel(t.data.deltaPct)}</span
              >
            {/if}
          </span>
        {/if}
      </div>
    </a>
  {/each}
</div>
