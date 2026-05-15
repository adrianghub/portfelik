<script lang="ts">
  import type { MonthlySummary } from "$lib/types";
  import { cn, formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    summary: MonthlySummary;
  }
  let { summary }: Props = $props();
</script>

<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
  <article
    class="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
  >
    <p class="text-eyebrow text-slate-400">{m.summary_income()}</p>
    <p class="mt-1.5 text-lg font-semibold text-emerald-300 tabular-nums">
      {formatCurrency(summary.total_income)}
    </p>
  </article>
  <article
    class="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
  >
    <p class="text-eyebrow text-slate-400">{m.summary_expenses()}</p>
    <p class="mt-1.5 text-lg font-semibold text-rose-300 tabular-nums">
      {formatCurrency(summary.total_expenses)}
    </p>
  </article>
  <article
    class="relative col-span-2 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur sm:col-span-1"
  >
    <p class="text-eyebrow text-slate-400">{m.summary_net()}</p>
    <p
      class={cn(
        "mt-1.5 text-lg font-semibold tabular-nums",
        summary.net >= 0 ? "text-emerald-300" : "text-rose-300"
      )}
    >
      {formatCurrency(summary.net)}
    </p>
  </article>
</div>
