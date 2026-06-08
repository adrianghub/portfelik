<script lang="ts">
  import type { CashflowSummaryMode } from "$lib/services/transaction-cashflow";
  import type { MonthlySummary, TransactionType } from "$lib/types";
  import { cn, formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    summary: MonthlySummary;
    mode?: CashflowSummaryMode | "filtered";
    activeType?: TransactionType;
    ontypeclick?: (type: TransactionType) => void;
  }
  let { summary, mode = "ledger", activeType, ontypeclick }: Props = $props();

  const modeLabel = $derived(
    activeType === "income"
      ? m.summary_type_income_active()
      : activeType === "expense"
        ? m.summary_type_expense_active()
        : mode === "forecast"
          ? m.summary_forecast_note()
          : mode === "filtered"
            ? m.summary_filtered_note()
            : m.summary_ledger_note()
  );

  const showFullRow = $derived(!activeType);

  const incomeCardClass = $derived(
    cn(
      "focus-visible:ring-accent relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
      ontypeclick && "cursor-pointer hover:bg-white/5",
      activeType === "income" && "ring-1 ring-emerald-500/40"
    )
  );

  const expenseCardClass = $derived(
    cn(
      "focus-visible:ring-accent relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
      ontypeclick && "cursor-pointer hover:bg-white/5",
      activeType === "expense" && "ring-1 ring-rose-500/40"
    )
  );
</script>

<div class="space-y-2">
  <p class="text-xs text-slate-400">{modeLabel}</p>
  <div
    class={cn("grid gap-3", showFullRow ? "grid-cols-2 sm:grid-cols-3" : "max-w-xs grid-cols-1")}
  >
    {#if showFullRow || activeType === "income"}
      {#if ontypeclick}
        <button type="button" class={incomeCardClass} onclick={() => ontypeclick("income")}>
          <p class="text-eyebrow text-slate-400">{m.summary_income()}</p>
          <p class="mt-1.5 text-lg font-semibold text-emerald-300 tabular-nums">
            {formatCurrency(summary.total_income)}
          </p>
        </button>
      {:else}
        <article
          class="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
        >
          <p class="text-eyebrow text-slate-400">{m.summary_income()}</p>
          <p class="mt-1.5 text-lg font-semibold text-emerald-300 tabular-nums">
            {formatCurrency(summary.total_income)}
          </p>
        </article>
      {/if}
    {/if}

    {#if showFullRow || activeType === "expense"}
      {#if ontypeclick}
        <button type="button" class={expenseCardClass} onclick={() => ontypeclick("expense")}>
          <p class="text-eyebrow text-slate-400">{m.summary_expenses()}</p>
          <p class="mt-1.5 text-lg font-semibold text-rose-300 tabular-nums">
            {formatCurrency(summary.total_expenses)}
          </p>
        </button>
      {:else}
        <article
          class="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
        >
          <p class="text-eyebrow text-slate-400">{m.summary_expenses()}</p>
          <p class="mt-1.5 text-lg font-semibold text-rose-300 tabular-nums">
            {formatCurrency(summary.total_expenses)}
          </p>
        </article>
      {/if}
    {/if}

    {#if showFullRow}
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
    {/if}
  </div>
  {#if activeType && ontypeclick}
    <p class="text-xs text-slate-500">{m.summary_type_filter_hint()}</p>
  {/if}
</div>
