<script lang="ts">
  import type { ComponentProps } from "svelte";
  import type SpendHistoryChart from "./SpendHistoryChart.svelte";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import * as m from "$lib/paraglide/messages";

  let props: ComponentProps<typeof SpendHistoryChart> = $props();
  const load = () => import("./SpendHistoryChart.svelte");
  let chart = $state(load());
</script>

{#await chart}
  <div
    class="h-64 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"
    role="status"
    aria-label={m.common_loading()}
  ></div>
{:then module}
  <module.default {...props} />
{:catch error}
  <QueryError {error} onRetry={() => (chart = load())} />
{/await}
