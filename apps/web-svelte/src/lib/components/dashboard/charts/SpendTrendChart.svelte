<script lang="ts">
  import { browser } from "$app/environment";
  import { AreaChart } from "layerchart";
  import { scaleBand } from "d3-scale";

  let { current, previous, labels }: { current: number[]; previous: number[]; labels: string[] } =
    $props();

  const data = $derived(
    labels.map((label, i) => ({
      label,
      current: current[i] ?? 0,
      previous: previous[i] ?? 0,
    }))
  );

  const hasData = $derived(data.some((d) => d.current > 0 || d.previous > 0));
</script>

<div class="h-56 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
  {#if browser && hasData}
    <AreaChart
      {data}
      x="label"
      xScale={scaleBand()}
      series={[
        {
          key: "current",
          label: "Bieżący okres",
          value: "current",
          color: "hsl(160 60% 45%)",
        },
        {
          key: "previous",
          label: "Poprzedni okres",
          value: "previous",
          color: "hsl(215 20% 55%)",
          props: { fillOpacity: 0.1, line: { class: "stroke-slate-500" } },
        },
      ]}
      axis="x"
      grid={false}
      rule={false}
      props={{
        xAxis: { classes: { tickLabel: "text-[10px] fill-slate-400" } },
      }}
    />
  {:else if !browser}
    <div class="flex h-full items-center justify-center text-xs text-slate-500">Ładowanie...</div>
  {:else}
    <div class="flex h-full items-center justify-center text-xs text-slate-500">
      Brak danych trendu
    </div>
  {/if}
</div>
