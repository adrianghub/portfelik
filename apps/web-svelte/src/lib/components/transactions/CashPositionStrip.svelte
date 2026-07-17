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
    hasAnchor: boolean;
    anchor: CashPosition | null;
    /** Wait until the anchor query has settled before opening the edit sheet. */
    anchorReady?: boolean;
  }
  let { live, forecast, hasAnchor, anchor, anchorReady = true }: Props = $props();

  const queryClient = useQueryClient();
  const showForecast = $derived(Math.abs(forecast - live) >= 0.01);

  let editOpen = $state(false);
  let openingAmount = $state("");
  let asOfDate = $state("");

  function openEdit() {
    if (!anchorReady) return;
    openingAmount = anchor ? String(anchor.opening_amount) : "";
    asOfDate = anchor?.as_of_date ?? localDateIso();
    editOpen = true;
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

<button
  type="button"
  onclick={openEdit}
  class="w-full rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3 text-left transition-colors hover:border-white/10 hover:bg-slate-900/80"
  aria-label={m.cash_position_label()}
>
  <div class="flex items-baseline justify-between gap-3">
    <div class="min-w-0">
      <p class="text-eyebrow text-slate-400">{m.cash_position_label()}</p>
      {#if hasAnchor}
        <p class="text-2xl font-semibold text-slate-100 tabular-nums">{formatCurrency(live)}</p>
      {:else}
        <p class="mt-1 text-xs text-slate-400">{m.cash_position_set_hint()}</p>
      {/if}
    </div>
    {#if hasAnchor && showForecast}
      <p class="text-xs text-slate-400 tabular-nums">
        {m.cash_position_forecast({ amount: formatCurrency(forecast) })}
      </p>
    {/if}
  </div>
  {#if hasAnchor}
    <p class="mt-2 text-[11px] text-slate-500">{m.cash_position_scope_hint()}</p>
  {/if}
</button>
<p class="mt-1.5 px-1 text-[11px]">
  <a href="/plans" class="text-accent/80 hover:text-accent font-medium">
    {m.cash_position_net_worth_link()}
  </a>
</p>

<Sheet open={editOpen} onclose={() => (editOpen = false)} title={m.cash_position_label()}>
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
        {m.plans_net_worth_as_of_label()}
      </label>
      <DayPicker
        id="cash-as-of-date"
        bind:value={asOfDate}
        label={m.plans_net_worth_as_of_label()}
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
