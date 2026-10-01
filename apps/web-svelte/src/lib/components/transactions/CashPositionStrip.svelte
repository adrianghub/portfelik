<script lang="ts">
  import CashBalanceSummary from "$lib/components/CashBalanceSummary.svelte";
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
    loading?: boolean;
    error?: boolean;
    onRetry?: () => void;
  }
  let {
    live,
    forecast,
    upcomingIncome = 0,
    upcomingExpenses = 0,
    hasAnchor,
    anchor,
    anchorReady = true,
    loading = false,
    error = false,
    onRetry,
  }: Props = $props();

  const queryClient = useQueryClient();

  let editOpen = $state(false);
  let openingAmount = $state("");
  let asOfDate = $state("");
  const normalizedOpeningAmount = $derived(openingAmount.replace(/\s/g, "").replace(",", "."));
  const openingValid = $derived(
    /^-?\d+(\.\d{1,2})?$/.test(normalizedOpeningAmount) &&
      Math.abs(Number(normalizedOpeningAmount)) <= 9999999999.99
  );
  const dateValid = $derived(!!asOfDate && asOfDate <= localDateIso());
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
    if (saveMutation.isPending) return false;
    if (editDirty && !window.confirm(m.common_unsaved_changes_confirm())) return false;
    editOpen = false;
  }

  const saveMutation = createSvelteMutation(() => ({
    mutationFn: async () => {
      await upsertPrivateCashPosition({
        opening_amount: Number(normalizedOpeningAmount),
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

{#if loading}
  <div
    class="h-48 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"
    aria-hidden="true"
  ></div>
{:else if error}
  <section
    class="rounded-2xl border border-rose-500/20 bg-slate-900/60 p-4"
    data-testid="transaction-cash-position"
    aria-label={m.cash_position_label()}
  >
    <p class="text-sm text-rose-300" role="alert">{m.cash_position_load_error()}</p>
    <button
      type="button"
      onclick={onRetry}
      class="focus-visible:ring-accent text-accent mt-2 inline-flex min-h-11 items-center text-sm focus-visible:ring-2 focus-visible:outline-none"
      >{m.common_retry()}</button
    >
  </section>
{:else if hasAnchor}
  <section
    class="rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3"
    aria-label={m.cash_position_label()}
    data-testid="transaction-cash-position"
  >
    <CashBalanceSummary
      {live}
      {forecast}
      {upcomingIncome}
      {upcomingExpenses}
      anchorDate={anchor?.as_of_date}
    />
    <button
      type="button"
      onclick={openEdit}
      class="focus-visible:ring-accent text-accent mt-2 inline-flex min-h-11 items-center text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      >{m.cash_position_edit_balance()}</button
    >
  </section>
{:else}
  <button
    type="button"
    onclick={openEdit}
    class="focus-visible:ring-accent min-h-11 text-sm font-medium text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
    >{m.cash_position_set_hint()}</button
  >
{/if}

<Sheet open={editOpen} onclose={requestClose} title={m.cash_position_label()}>
  <form
    class="space-y-4"
    onsubmit={(e) => {
      e.preventDefault();
      if (!session.userId || saveMutation.isPending || !openingValid || !dateValid) return;
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
        required
        max={localDateIso()}
      />
      {#if !dateValid}<p class="text-xs text-rose-300" role="alert">
          {m.cash_position_date_error()}
        </p>{/if}
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="cash-opening-amount">
        {m.net_worth_cash_position_label()}
      </label>
      <input
        id="cash-opening-amount"
        type="text"
        inputmode="decimal"
        required
        aria-invalid={!openingValid}
        aria-describedby={!openingValid ? "cash-amount-error" : undefined}
        bind:value={openingAmount}
        placeholder="0"
        class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
      />
      {#if !openingValid}<p id="cash-amount-error" class="text-xs text-rose-300">
          {m.error_invalid_amount()}
        </p>{/if}
      <p class="text-xs text-slate-500">{m.net_worth_cash_position_hint()}</p>
      {#if hasAnchor && !loading && !error}
        <p class="text-xs text-slate-400">
          {m.net_worth_cash_current_hint({ amount: formatCurrency(live) })}
        </p>
      {/if}
    </div>
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={requestClose}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={saveMutation.isPending || !asOfDate || !openingValid || !dateValid}
        class="bg-accent hover:bg-accent/90 flex-1 rounded-full py-2 text-sm font-medium text-slate-950 disabled:opacity-50"
      >
        {m.common_save()}
      </button>
    </div>
  </form>
</Sheet>
