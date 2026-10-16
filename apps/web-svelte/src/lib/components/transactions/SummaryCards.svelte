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
  const showSplit = $derived(
    breakdown != null &&
      !activeType &&
      (breakdown.income.open !== 0 || breakdown.expense.open !== 0)
  );
  const canDrill = $derived(!!ondrill);

  const incomeCardClass = $derived(
    cn(
      "relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur",
      activeType === "income" && "ring-1 ring-emerald-500/40"
    )
  );

  const expenseCardClass = $derived(
    cn(
      "relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur",
      activeType === "expense" && "ring-1 ring-rose-500/40"
    )
  );

  const totalBtnClass =
    "focus-visible:ring-accent w-full rounded-lg text-left transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none";
  const splitBtnClass =
    "focus-visible:ring-accent flex w-full justify-between gap-2 rounded-md px-0.5 py-0.5 text-left transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none";

  function onIncomeActivate() {
    if (activeType === "income" && ontypeclick) {
      ontypeclick("income");
      return;
    }
    if (ondrill) ondrill("income-total");
    else ontypeclick?.("income");
  }

  function onExpenseActivate() {
    if (activeType === "expense" && ontypeclick) {
      ontypeclick("expense");
      return;
    }
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
      <article class={incomeCardClass}>
        {#if ontypeclick || ondrill}
          <button type="button" class={totalBtnClass} onclick={onIncomeActivate}>
            <p class="text-eyebrow text-slate-400">{m.summary_income()}</p>
            <p class="mt-1.5 text-lg font-semibold text-emerald-300 tabular-nums">
              {formatCurrency(breakdown?.income.total ?? summary.total_income)}
            </p>
          </button>
        {:else}
          <p class="text-eyebrow text-slate-400">{m.summary_income()}</p>
          <p class="mt-1.5 text-lg font-semibold text-emerald-300 tabular-nums">
            {formatCurrency(breakdown?.income.total ?? summary.total_income)}
          </p>
        {/if}
        {#if showSplit && breakdown}
          <div class="mt-2 space-y-1 text-xs text-slate-400">
            {#if canDrill}
              <button
                type="button"
                class={splitBtnClass}
                onclick={() => ondrill?.("income-realized")}
              >
                <span>{m.summary_income_received()}</span>
                <span class="text-slate-300 tabular-nums"
                  >{formatCurrency(breakdown.income.realized)}</span
                >
              </button>
              <button type="button" class={splitBtnClass} onclick={() => ondrill?.("income-open")}>
                <span>{m.summary_income_expected()}</span>
                <span class="text-slate-300 tabular-nums"
                  >{formatCurrency(breakdown.income.open)}</span
                >
              </button>
            {:else}
              <div class="flex justify-between gap-2">
                <span>{m.summary_income_received()}</span>
                <span class="text-slate-300 tabular-nums"
                  >{formatCurrency(breakdown.income.realized)}</span
                >
              </div>
              <div class="flex justify-between gap-2">
                <span>{m.summary_income_expected()}</span>
                <span class="text-slate-300 tabular-nums"
                  >{formatCurrency(breakdown.income.open)}</span
                >
              </div>
            {/if}
          </div>
        {/if}
      </article>
    {/if}

    {#if showFullRow || activeType === "expense"}
      <article class={expenseCardClass}>
        {#if ontypeclick || ondrill}
          <button type="button" class={totalBtnClass} onclick={onExpenseActivate}>
            <p class="text-eyebrow text-slate-400">{m.summary_expenses()}</p>
            <p class="mt-1.5 text-lg font-semibold text-rose-300 tabular-nums">
              {formatCurrency(breakdown?.expense.total ?? summary.total_expenses)}
            </p>
          </button>
        {:else}
          <p class="text-eyebrow text-slate-400">{m.summary_expenses()}</p>
          <p class="mt-1.5 text-lg font-semibold text-rose-300 tabular-nums">
            {formatCurrency(breakdown?.expense.total ?? summary.total_expenses)}
          </p>
        {/if}
        {#if showSplit && breakdown}
          <div class="mt-2 space-y-1 text-xs text-slate-400">
            {#if canDrill}
              <button
                type="button"
                class={splitBtnClass}
                onclick={() => ondrill?.("expense-realized")}
              >
                <span>{m.summary_expense_spent()}</span>
                <span class="text-slate-300 tabular-nums"
                  >{formatCurrency(breakdown.expense.realized)}</span
                >
              </button>
              <button type="button" class={splitBtnClass} onclick={() => ondrill?.("expense-open")}>
                <span>{m.summary_expense_due()}</span>
                <span class="text-slate-300 tabular-nums"
                  >{formatCurrency(breakdown.expense.open)}</span
                >
              </button>
            {:else}
              <div class="flex justify-between gap-2">
                <span>{m.summary_expense_spent()}</span>
                <span class="text-slate-300 tabular-nums"
                  >{formatCurrency(breakdown.expense.realized)}</span
                >
              </div>
              <div class="flex justify-between gap-2">
                <span>{m.summary_expense_due()}</span>
                <span class="text-slate-300 tabular-nums"
                  >{formatCurrency(breakdown.expense.open)}</span
                >
              </div>
            {/if}
          </div>
        {/if}
      </article>
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
          <div class="mt-2 space-y-1 text-xs text-slate-400">
            {#if canDrill}
              <button type="button" class={splitBtnClass} onclick={() => ondrill?.("net-realized")}>
                <span>{m.summary_net_realized()}</span>
                <span
                  class={cn(
                    "tabular-nums",
                    breakdown.realizedNet >= 0 ? "text-emerald-300/90" : "text-rose-300/90"
                  )}
                >
                  {formatCurrency(breakdown.realizedNet)}
                </span>
              </button>
              <button
                type="button"
                class={splitBtnClass}
                onclick={() => ondrill?.("net-projected")}
              >
                <span>{m.summary_net_projected()}</span>
                <span
                  class={cn(
                    "tabular-nums",
                    breakdown.projectedNet >= 0 ? "text-emerald-300/90" : "text-rose-300/90"
                  )}
                >
                  {formatCurrency(breakdown.projectedNet)}
                </span>
              </button>
            {:else}
              <div class="flex justify-between gap-2">
                <span>{m.summary_net_realized()}</span>
                <span
                  class={cn(
                    "tabular-nums",
                    breakdown.realizedNet >= 0 ? "text-emerald-300/90" : "text-rose-300/90"
                  )}
                >
                  {formatCurrency(breakdown.realizedNet)}
                </span>
              </div>
              <div class="flex justify-between gap-2">
                <span>{m.summary_net_projected()}</span>
                <span
                  class={cn(
                    "tabular-nums",
                    breakdown.projectedNet >= 0 ? "text-emerald-300/90" : "text-rose-300/90"
                  )}
                >
                  {formatCurrency(breakdown.projectedNet)}
                </span>
              </div>
            {/if}
          </div>
        {/if}
      </article>
    {/if}
  </div>
  {#if activeType && ontypeclick}
    <p class="text-xs text-slate-500">{m.summary_type_filter_hint()}</p>
  {/if}
</div>
