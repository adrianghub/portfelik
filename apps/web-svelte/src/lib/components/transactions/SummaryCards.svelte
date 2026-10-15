<script lang="ts">
  import type { CashflowSummaryMode } from "$lib/services/transaction-cashflow";
  import type { PeriodCashflowBreakdown } from "$lib/services/period-cashflow";
  import type { MonthlySummary, TransactionType } from "$lib/types";
  import { cn, formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  type DrillKey =
    | "income-realized"
    | "income-open"
    | "income-total"
    | "expense-realized"
    | "expense-open"
    | "expense-total"
    | "net-realized"
    | "net-projected";

  interface Props {
    summary: MonthlySummary;
    breakdown?: PeriodCashflowBreakdown | null;
    mode?: CashflowSummaryMode | "filtered";
    activeType?: TransactionType;
    ontypeclick?: (type: TransactionType) => void;
    ondrill?: (key: DrillKey) => void;
  }
  let {
    summary,
    breakdown = null,
    mode = "ledger",
    activeType,
    ontypeclick,
    ondrill,
  }: Props = $props();

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
  const showSplit = $derived(breakdown != null && !activeType);

  const incomeCardClass = $derived(
    cn(
      "focus-visible:ring-accent relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
      (ontypeclick || ondrill) && "cursor-pointer hover:bg-white/5",
      activeType === "income" && "ring-1 ring-emerald-500/40"
    )
  );

  const expenseCardClass = $derived(
    cn(
      "focus-visible:ring-accent relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
      (ontypeclick || ondrill) && "cursor-pointer hover:bg-white/5",
      activeType === "expense" && "ring-1 ring-rose-500/40"
    )
  );

  function onIncomeActivate() {
    if (ondrill) ondrill("income-total");
    else ontypeclick?.("income");
  }

  function onExpenseActivate() {
    if (ondrill) ondrill("expense-total");
    else ontypeclick?.("expense");
  }
</script>

<div class="space-y-2" data-testid="transaction-summary-cards">
  <p class="text-xs text-slate-400">{modeLabel}</p>
  <div
    class={cn("grid gap-3", showFullRow ? "grid-cols-2 sm:grid-cols-3" : "max-w-xs grid-cols-1")}
  >
    {#if showFullRow || activeType === "income"}
      {#if ontypeclick || ondrill}
        <button type="button" class={incomeCardClass} onclick={onIncomeActivate}>
          <p class="text-eyebrow text-slate-400">{m.summary_income()}</p>
          <p class="mt-1.5 text-lg font-semibold text-emerald-300 tabular-nums">
            {formatCurrency(breakdown?.income.total ?? summary.total_income)}
          </p>
          {#if showSplit && breakdown}
            <dl class="mt-2 space-y-1 text-xs text-slate-400">
              <div class="flex justify-between gap-2">
                <dt>{m.summary_income_received()}</dt>
                <dd class="text-slate-300 tabular-nums">
                  {formatCurrency(breakdown.income.realized)}
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt>{m.summary_income_expected()}</dt>
                <dd class="text-slate-300 tabular-nums">{formatCurrency(breakdown.income.open)}</dd>
              </div>
            </dl>
          {/if}
        </button>
      {:else}
        <article
          class="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
        >
          <p class="text-eyebrow text-slate-400">{m.summary_income()}</p>
          <p class="mt-1.5 text-lg font-semibold text-emerald-300 tabular-nums">
            {formatCurrency(breakdown?.income.total ?? summary.total_income)}
          </p>
          {#if showSplit && breakdown}
            <dl class="mt-2 space-y-1 text-xs text-slate-400">
              <div class="flex justify-between gap-2">
                <dt>{m.summary_income_received()}</dt>
                <dd class="text-slate-300 tabular-nums">
                  {formatCurrency(breakdown.income.realized)}
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt>{m.summary_income_expected()}</dt>
                <dd class="text-slate-300 tabular-nums">{formatCurrency(breakdown.income.open)}</dd>
              </div>
            </dl>
          {/if}
        </article>
      {/if}
    {/if}

    {#if showFullRow || activeType === "expense"}
      {#if ontypeclick || ondrill}
        <button type="button" class={expenseCardClass} onclick={onExpenseActivate}>
          <p class="text-eyebrow text-slate-400">{m.summary_expenses()}</p>
          <p class="mt-1.5 text-lg font-semibold text-rose-300 tabular-nums">
            {formatCurrency(breakdown?.expense.total ?? summary.total_expenses)}
          </p>
          {#if showSplit && breakdown}
            <dl class="mt-2 space-y-1 text-xs text-slate-400">
              <div class="flex justify-between gap-2">
                <dt>{m.summary_expense_spent()}</dt>
                <dd class="text-slate-300 tabular-nums">
                  {formatCurrency(breakdown.expense.realized)}
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt>{m.summary_expense_due()}</dt>
                <dd class="text-slate-300 tabular-nums">
                  {formatCurrency(breakdown.expense.open)}
                </dd>
              </div>
            </dl>
          {/if}
        </button>
      {:else}
        <article
          class="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
        >
          <p class="text-eyebrow text-slate-400">{m.summary_expenses()}</p>
          <p class="mt-1.5 text-lg font-semibold text-rose-300 tabular-nums">
            {formatCurrency(breakdown?.expense.total ?? summary.total_expenses)}
          </p>
          {#if showSplit && breakdown}
            <dl class="mt-2 space-y-1 text-xs text-slate-400">
              <div class="flex justify-between gap-2">
                <dt>{m.summary_expense_spent()}</dt>
                <dd class="text-slate-300 tabular-nums">
                  {formatCurrency(breakdown.expense.realized)}
                </dd>
              </div>
              <div class="flex justify-between gap-2">
                <dt>{m.summary_expense_due()}</dt>
                <dd class="text-slate-300 tabular-nums">
                  {formatCurrency(breakdown.expense.open)}
                </dd>
              </div>
            </dl>
          {/if}
        </article>
      {/if}
    {/if}

    {#if showFullRow}
      <article
        class="relative col-span-2 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur sm:col-span-1"
        data-testid="summary-period-net"
      >
        <p class="text-eyebrow text-slate-400">{m.summary_net()}</p>
        <p
          class={cn(
            "mt-1.5 text-lg font-semibold tabular-nums",
            (breakdown?.projectedNet ?? summary.net) >= 0 ? "text-emerald-300" : "text-rose-300"
          )}
        >
          {formatCurrency(breakdown?.projectedNet ?? summary.net)}
        </p>
        {#if showSplit && breakdown}
          <dl class="mt-2 space-y-1 text-xs text-slate-400">
            <div class="flex justify-between gap-2">
              <dt>{m.summary_net_realized()}</dt>
              <dd
                class={cn(
                  "tabular-nums",
                  breakdown.realizedNet >= 0 ? "text-emerald-300/90" : "text-rose-300/90"
                )}
              >
                {formatCurrency(breakdown.realizedNet)}
              </dd>
            </div>
            <div class="flex justify-between gap-2">
              <dt>{m.summary_net_projected()}</dt>
              <dd
                class={cn(
                  "tabular-nums",
                  breakdown.projectedNet >= 0 ? "text-emerald-300/90" : "text-rose-300/90"
                )}
              >
                {formatCurrency(breakdown.projectedNet)}
              </dd>
            </div>
          </dl>
        {/if}
      </article>
    {/if}
  </div>
  {#if activeType && ontypeclick}
    <p class="text-xs text-slate-500">{m.summary_type_filter_hint()}</p>
  {/if}
</div>
