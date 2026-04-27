<script lang="ts">
  import type { MonthlySummary } from "$lib/types";
  import { formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    summary: MonthlySummary;
  }
  let { summary }: Props = $props();
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
  <div class="rounded-xl border border-zinc-200 bg-white p-3 sm:p-4">
    <p class="text-xs text-zinc-500">{m.summary_income()}</p>
    <p class="mt-1 text-base font-semibold text-emerald-600 tabular-nums sm:text-xl">
      {formatCurrency(summary.total_income)}
    </p>
  </div>
  <div class="rounded-xl border border-zinc-200 bg-white p-3 sm:p-4">
    <p class="text-xs text-zinc-500">{m.summary_expenses()}</p>
    <p class="mt-1 text-base font-semibold text-rose-600 tabular-nums sm:text-xl">
      {formatCurrency(summary.total_expenses)}
    </p>
  </div>
  <div class="col-span-2 rounded-xl border border-zinc-200 bg-white p-3 sm:col-span-1 sm:p-4">
    <p class="text-xs text-zinc-500">{m.summary_net()}</p>
    <p
      class="mt-1 text-base font-semibold tabular-nums sm:text-xl {summary.net >= 0
        ? 'text-emerald-600'
        : 'text-rose-600'}"
    >
      {formatCurrency(summary.net)}
    </p>
  </div>
</div>
