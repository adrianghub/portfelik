<script lang="ts">
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import { requireSessionUserId, session } from "$lib/auth/session.svelte";
  import { localDateIso } from "$lib/date-local";
  import * as m from "$lib/paraglide/messages";
  import { qk } from "$lib/query-keys";
  import { upsertPrivateCashPosition } from "$lib/services/cash-position";
  import { toastError } from "$lib/toast-error";
  import type { CashPosition } from "$lib/types";
  import { formatCurrency } from "$lib/utils";
  import { createMutation as createSvelteMutation, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";

  interface Props {
    live: number;
    forecast: number;
    upcomingIncome?: number;
    upcomingExpenses?: number;
    hasAnchor: boolean;
    anchor: CashPosition | null;
    /** Wait until the anchor query has settled before opening the edit sheet. */
    anchorReady?: boolean;
  }
  let {
    live,
    forecast,
    upcomingIncome = 0,
    upcomingExpenses = 0,
    hasAnchor,
    anchor,
    anchorReady = true,
  }: Props = $props();

  const queryClient = useQueryClient();
  const showForecast = $derived(Math.abs(forecast - live) >= 0.01);

  let editOpen = $state(false);
  let forecastOpen = $state(false);
  let openingAmount = $state("");
  let asOfDate = $state("");
  let initialOpeningAmount = $state("");
  let initialAsOfDate = $state("");
  const editDirty = $derived(
    openingAmount !== initialOpeningAmount || asOfDate !== initialAsOfDate
  );

  function openEdit() {
    if (!anchorReady) return;
    openingAmount = anchor ? String(anchor.opening_amount) : "";
    asOfDate = anchor?.as_of_date ?? localDateIso();
    initialOpeningAmount = openingAmount;
    initialAsOfDate = asOfDate;
    editOpen = true;
  }

  function requestClose() {
    if (saveMutation.isPending) return;
    if (editDirty && !window.confirm(m.common_unsaved_changes_confirm())) return;
    editOpen = false;
  }

  const saveMutation = createSvelteMutation(() => ({
    mutationFn: async () => {
      await upsertPrivateCashPosition({
        opening_amount: openingAmount === "" ? 0 : Number(openingAmount),
        as_of_date: asOfDate,
      });
    },
    onSuccess: async () => {
      editOpen = false;
      toast.success(m.cash_position_toast_saved());
      const u = requireSessionUserId();
      await queryClient.invalidateQueries({ queryKey: qk.cashPosition(u) });
      await queryClient.invalidateQueries({ queryKey: qk.transactions.list(u, "cash-history") });
    },
    onError: (err) => toastError(err),
  }));
</script>

{#if hasAnchor}
  <div class="rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3">
    <button
      type="button"
      onclick={openEdit}
      class="w-full text-left transition-colors"
      aria-label={m.cash_position_label()}
    >
      <p class="text-eyebrow text-slate-400">{m.cash_position_label()}</p>
      <p class="text-2xl font-semibold text-slate-100 tabular-nums">{formatCurrency(live)}</p>
    </button>
    {#if showForecast}
      <button
        type="button"
        class="focus-visible:ring-accent mt-1 text-xs text-slate-400 tabular-nums focus-visible:ring-2 focus-visible:outline-none"
        aria-expanded={forecastOpen}
        onclick={() => (forecastOpen = !forecastOpen)}
      >
        {m.cash_position_forecast({ amount: formatCurrency(forecast) })}
      </button>
      {#if forecastOpen}
        <dl class="mt-3 space-y-1 border-t border-white/5 pt-3 text-sm">
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-slate-400">{m.cash_position_today()}</dt>
            <dd class="font-medium text-slate-100 tabular-nums">{formatCurrency(live)}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-slate-400">{m.cash_position_upcoming_out()}</dt>
            <dd class="text-rose-300 tabular-nums">−{formatCurrency(upcomingExpenses)}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-slate-400">{m.cash_position_upcoming_in()}</dt>
            <dd class="text-emerald-300 tabular-nums">+{formatCurrency(upcomingIncome)}</dd>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-slate-300">{m.cash_position_forecast_result()}</dt>
            <dd class="font-medium text-slate-100 tabular-nums">{formatCurrency(forecast)}</dd>
          </div>
        </dl>
      {/if}
    {/if}
  </div>
{:else}
  <button
    type="button"
    onclick={openEdit}
    class="focus-visible:ring-accent text-sm font-medium text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
  >
    {m.cash_position_set_hint()}
  </button>
{/if}

<Sheet open={editOpen} onclose={requestClose} title={m.cash_position_label()}>
  <form
    class="space-y-4"
    onsubmit={(e) => {
      e.preventDefault();
      if (!session.userId || saveMutation.isPending) return;
      void saveMutation.mutateAsync().catch(() => {
        // onError already toasted
      });
    }}
  >
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="cash-as-of-date">
        {m.cash_position_as_of_label()}
      </label>
      <DayPicker
        id="cash-as-of-date"
        bind:value={asOfDate}
        label={m.cash_position_as_of_label()}
        showLabel={false}
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="cash-opening-amount">
        {m.net_worth_cash_position_label()}
      </label>
      <input
        id="cash-opening-amount"
        type="number"
        min="0"
        step="0.01"
        bind:value={openingAmount}
        placeholder="0"
        class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
      />
      <p class="text-xs text-slate-500">{m.net_worth_cash_position_hint()}</p>
      {#if hasAnchor}
        <p class="text-xs text-slate-400">
          {m.net_worth_cash_current_hint({ amount: formatCurrency(live) })}
        </p>
      {/if}
    </div>
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (editOpen = false)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={saveMutation.isPending || !asOfDate}
        class="bg-accent hover:bg-accent/90 flex-1 rounded-full py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
      >
        {m.common_save()}
      </button>
    </div>
  </form>
</Sheet>
