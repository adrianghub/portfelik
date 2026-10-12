<script lang="ts">
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import { session, requireSessionUserId } from "$lib/auth/session.svelte";
  import { sumMoneyAmounts } from "$lib/money";
  import {
    settleSpendItem,
    spendItemFacingStatus,
    spendItemNeedsLink,
    summarizeSpendBudget,
  } from "$lib/plans/spend";
  import * as m from "$lib/paraglide/messages";
  import { qk } from "$lib/query-keys";
  import {
    cancelPlanItem,
    createPlanItem,
    fetchPlanItems,
    restorePlanItem,
    updatePlanItem,
    type PlanItem,
  } from "$lib/services/plan-items";
  import {
    fetchSpendSettlements,
    linkPlanTransaction,
    searchSpendPaymentCandidates,
    unlinkPlanTransaction,
  } from "$lib/services/plan-settlement";
  import { errorMessage } from "$lib/services/supabase-errors";
  import type { Plan } from "$lib/types";
  import { formatCurrency, formatDate } from "$lib/utils";
  import { createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { MoreHorizontal, Plus } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  let { plan, canManage }: { plan: Plan; canManage: boolean } = $props();

  const queryClient = useQueryClient();
  let label = $state("");
  let amount = $state("");
  let dueDate = $state("");
  let payee = $state("");
  let confirmed = $state(false);
  let editingId = $state<string | null>(null);
  let formOpen = $state(false);
  let formSnapshot = $state("");
  let actionMenuId = $state<string | null>(null);
  let saving = $state(false);
  let cancellingId = $state<string | null>(null);
  let linkingItemId = $state<string | null>(null);
  let paymentQuery = $state("");
  let linking = $state(false);
  let unlinkingId = $state<string | null>(null);

  $effect(() => {
    if (!dueDate.trim()) confirmed = false;
  });

  const itemsQuery = createQuery(() => ({
    queryKey: qk.planItems(session.userId ?? "", plan.id),
    queryFn: () => fetchPlanItems(plan.id),
    enabled: !!session.userId,
  }));

  const settlementQuery = createQuery(() => ({
    queryKey: qk.planSpendSettlements(session.userId ?? "", plan.id),
    queryFn: () => fetchSpendSettlements(plan.id),
    enabled: !!session.userId,
  }));

  const candidatesQuery = createQuery(() => ({
    queryKey: [...qk.planLinks(session.userId ?? "", plan.id), "candidates", paymentQuery],
    queryFn: () => searchSpendPaymentCandidates(paymentQuery),
    enabled: !!session.userId && linkingItemId !== null,
  }));

  const settlements = $derived(settlementQuery.data ?? []);
  const linkedTransactionIds = $derived(
    new Set(settlements.map((settlement) => settlement.transactionId))
  );
  const paymentCandidates = $derived(
    (candidatesQuery.data ?? []).filter((candidate) => !linkedTransactionIds.has(candidate.id))
  );

  function paymentsFor(itemId: string) {
    return settlements
      .filter((settlement) => settlement.planItemId === itemId)
      .map((settlement) => ({ amount: settlement.amount, counts: settlement.countsAsPaid }));
  }

  const paidTotal = $derived(
    sumMoneyAmounts(
      settlements.filter((row) => row.countsAsPaid).map((row) => ({ amount: row.amount }))
    )
  );
  const summary = $derived(
    summarizeSpendBudget(
      plan.budget_amount ?? 0,
      (itemsQuery.data ?? []).map((item) => ({
        amount: item.amount,
        status: item.status,
        settled: settleSpendItem(item.amount, paymentsFor(item.id)).settled,
      }))
    )
  );
  const activeItems = $derived(
    (itemsQuery.data ?? []).filter((item) => item.status !== "cancelled")
  );
  const cancelledItems = $derived(
    (itemsQuery.data ?? []).filter((item) => item.status === "cancelled")
  );
  const usedPct = $derived(
    summary.budget > 0 ? Math.min(100, Math.round((summary.planned / summary.budget) * 100)) : 0
  );

  function facingLabel(item: PlanItem): string {
    const facing = spendItemFacingStatus(
      item.status,
      settleSpendItem(item.amount, paymentsFor(item.id))
    );
    if (facing === "paid") return m.plan_item_status_paid();
    if (facing === "partial") return m.plan_item_status_partial();
    if (facing === "confirmed") return m.plan_item_status_confirmed();
    if (facing === "cancelled") return m.plan_item_status_cancelled();
    return m.plan_item_status_estimated();
  }

  function toastItemError(err: unknown) {
    const message = err instanceof Error ? err.message : "";
    if (message === "item_label_required") {
      toast.error(m.plan_item_label_required());
      return;
    }
    if (message === "item_amount_required") {
      toast.error(m.plan_item_amount_required());
      return;
    }
    if (message === "item_confirm_needs_date") {
      toast.error(m.plan_item_confirm_needs_date());
      return;
    }
    toast.error(errorMessage(err));
  }

  function currentSnapshot(): string {
    return JSON.stringify({ label, amount, dueDate, payee, confirmed });
  }

  function resetForm() {
    editingId = null;
    label = "";
    amount = "";
    dueDate = "";
    payee = "";
    confirmed = false;
    formOpen = false;
    formSnapshot = currentSnapshot();
  }

  function openAdd() {
    resetForm();
    formSnapshot = currentSnapshot();
    formOpen = true;
  }

  function requestCloseForm() {
    if (currentSnapshot() !== formSnapshot && !window.confirm(m.common_unsaved_changes_confirm())) {
      return;
    }
    resetForm();
  }

  function startEdit(item: PlanItem) {
    actionMenuId = null;
    editingId = item.id;
    label = item.label;
    amount = String(item.amount);
    dueDate = item.due_date ?? "";
    payee = item.payee ?? "";
    confirmed = item.status === "confirmed";
    formSnapshot = currentSnapshot();
    formOpen = true;
  }

  async function refreshItems() {
    const userId = requireSessionUserId();
    await queryClient.invalidateQueries({ queryKey: qk.planItems(userId, plan.id) });
    await queryClient.invalidateQueries({ queryKey: qk.planLinks(userId, plan.id) });
    await queryClient.invalidateQueries({ queryKey: qk.planSpendSettlements(userId, plan.id) });
    await queryClient.invalidateQueries({ queryKey: qk.planSpendCards(userId) });
    await queryClient.invalidateQueries({ queryKey: qk.spendForecast(userId) });
  }

  async function linkPayment(itemId: string, transactionId: string) {
    if (!canManage || linking) return;
    linking = true;
    try {
      await linkPlanTransaction(plan.id, transactionId, {
        planKind: "spend",
        planItemId: itemId,
      });
      paymentQuery = "";
      linkingItemId = null;
      toast.success(m.plan_item_linked());
      await refreshItems();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      linking = false;
    }
  }

  async function unlinkPayment(transactionId: string) {
    if (!canManage || unlinkingId) return;
    unlinkingId = transactionId;
    try {
      await unlinkPlanTransaction(plan.id, transactionId);
      toast.success(m.plan_item_unlinked());
      await refreshItems();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      unlinkingId = null;
    }
  }

  async function saveItem(event: SubmitEvent) {
    event.preventDefault();
    if (!canManage || saving) return;
    saving = true;
    const input = {
      label,
      amount: amount === "" ? null : Number(amount),
      dueDate,
      payee,
      confirmed,
    };
    const editedId = editingId;
    try {
      if (editedId) {
        await updatePlanItem(editedId, input);
        toast.success(m.plan_item_updated());
      } else {
        await createPlanItem(plan.id, input);
        toast.success(m.plan_item_added());
      }
      resetForm();
      await refreshItems();
    } catch (err) {
      toastItemError(err);
    } finally {
      saving = false;
    }
  }

  async function restoreItem(item: PlanItem) {
    if (!canManage || cancellingId) return;
    cancellingId = item.id;
    try {
      await restorePlanItem(item);
      toast.success(m.plan_item_restored());
      await refreshItems();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      cancellingId = null;
    }
  }

  async function cancelItem(id: string) {
    if (!canManage || cancellingId) return;
    cancellingId = id;
    try {
      await cancelPlanItem(id);
      toast.success(m.plan_item_cancelled());
      await refreshItems();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      cancellingId = null;
    }
  }
</script>

<section
  class="space-y-6 md:grid md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] md:items-start md:space-y-0 md:gap-x-10"
  aria-labelledby="spend-summary-heading"
>
  <div class="rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3">
    <div class="flex items-start justify-between gap-3">
      <h2 id="spend-summary-heading" class="text-sm text-slate-400">
        {m.plan_spend_budget_left_label()}
      </h2>
      <InfoTooltip label={m.plan_spend_rules_label()} text={m.plan_spend_rules()} />
    </div>
    <p class="mt-1 text-3xl font-semibold text-slate-100 tabular-nums">
      {#if summary.budgetLeft < 0}
        {m.plan_spend_over_budget({ amount: formatCurrency(Math.abs(summary.budgetLeft)) })}
      {:else}
        {formatCurrency(summary.budgetLeft)}
      {/if}
    </p>
    <p class="mt-1 text-sm text-slate-400">
      {m.plan_spend_in_plan({
        planned: formatCurrency(summary.planned),
        budget: formatCurrency(summary.budget),
      })}
    </p>
    <div
      class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"
      role="progressbar"
      aria-label={m.plan_spend_bar_label()}
      aria-valuenow={usedPct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        class="h-full rounded-full {summary.budgetLeft < 0 ? 'bg-rose-400' : 'bg-accent'}"
        style="width: {usedPct}%"
      ></div>
    </div>
    <p class="mt-2 text-sm text-slate-400">
      {m.plan_spend_paid()}
      {formatCurrency(paidTotal)}
      <span> · </span>
      <span class={summary.toPay > 0 ? "text-amber-300" : ""}>
        {m.plan_spend_to_pay()}
        {formatCurrency(summary.toPay)}
      </span>
    </p>
    {#if summary.orientational > 0}
      <p class="mt-1 text-xs text-slate-400">
        {m.plan_spend_orientational({ amount: formatCurrency(summary.orientational) })}
      </p>
    {/if}
  </div>

  <div class="space-y-2">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-sm font-semibold text-slate-100">{m.plan_spend_items()}</h3>
      {#if canManage}
        <button
          type="button"
          class="bg-accent-gradient focus-visible:ring-accent grid size-8 place-items-center rounded-full text-slate-900 focus-visible:ring-2 focus-visible:outline-none"
          aria-label={m.plan_item_add_open()}
          onclick={openAdd}
        >
          <Plus size={16} aria-hidden="true" />
        </button>
      {/if}
    </div>
    {#if itemsQuery.isError}
      <p class="text-sm text-rose-300">{m.error_generic()}</p>
    {:else if activeItems.length === 0 && cancelledItems.length === 0}
      <p class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-400">
        {m.plan_item_empty()}
      </p>
    {:else}
      <ul class="space-y-2">
        {#each activeItems as item (item.id)}
          {@const itemPayments = settlements.filter(
            (settlement) => settlement.planItemId === item.id
          )}
          {@const settlement = settleSpendItem(item.amount, paymentsFor(item.id))}
          <li
            class="space-y-3 rounded-xl border bg-slate-900/60 px-3 py-3 {editingId === item.id
              ? 'border-accent/40'
              : 'border-white/5'}"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <div class="flex items-baseline justify-between gap-3">
                  <p class="truncate font-medium text-slate-100">{item.label}</p>
                  <p class="shrink-0 text-sm font-semibold text-slate-100 tabular-nums">
                    {formatCurrency(item.amount)}
                  </p>
                </div>
                <p class="mt-0.5 text-xs text-slate-400">
                  {#if item.due_date}
                    {formatDate(item.due_date)} ·
                  {/if}
                  {facingLabel(item)}
                  {#if item.payee}
                    · {item.payee}
                  {/if}
                </p>
                {#if spendItemNeedsLink(item.status, settlement)}
                  <p class="mt-1 text-sm text-amber-300">
                    {m.plan_spend_to_pay()}
                    {formatCurrency(settlement.remaining)}
                  </p>
                {/if}
                {#if settlement.settled > 0}
                  <p class="mt-1 text-sm text-slate-300">
                    {m.plan_item_paid({ amount: formatCurrency(settlement.settled) })}
                  </p>
                {/if}
                {#if settlement.overpaid > 0}
                  <p class="mt-1 text-sm text-amber-200">
                    {m.plan_item_overpaid({ amount: formatCurrency(settlement.overpaid) })}
                  </p>
                {/if}
                {#if canManage && spendItemNeedsLink(item.status, settlement)}
                  <button
                    type="button"
                    class="focus-visible:ring-accent mt-2 rounded-full border border-emerald-400/40 px-3 py-1 text-sm font-semibold text-emerald-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
                    onclick={() => {
                      actionMenuId = null;
                      linkingItemId = linkingItemId === item.id ? null : item.id;
                      paymentQuery = "";
                    }}
                  >
                    {linkingItemId === item.id ? m.plan_item_link_close() : m.plan_item_link()}
                  </button>
                {/if}
              </div>
              {#if canManage}
                <div class="relative shrink-0">
                  <button
                    type="button"
                    class="focus-visible:ring-accent flex size-11 items-center justify-center rounded-full text-slate-400 hover:bg-white/5 hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
                    aria-haspopup="menu"
                    aria-expanded={actionMenuId === item.id}
                    aria-label={m.plan_item_actions()}
                    onclick={() => (actionMenuId = actionMenuId === item.id ? null : item.id)}
                  >
                    <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                  {#if actionMenuId === item.id}
                    <div
                      role="menu"
                      class="absolute top-11 right-0 z-20 w-48 overflow-hidden rounded-xl border border-white/10 bg-slate-900 py-1 shadow-xl"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        class="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
                        onclick={() => startEdit(item)}
                      >
                        {m.plan_item_edit()}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        class="block w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-white/5"
                        disabled={cancellingId === item.id}
                        onclick={() => {
                          actionMenuId = null;
                          void cancelItem(item.id);
                        }}
                      >
                        {m.plan_item_cancel()}
                      </button>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
            {#if itemPayments.length > 0}
              <ul class="space-y-1">
                {#each itemPayments as payment (payment.linkId)}
                  <li class="flex items-center justify-between gap-3 text-sm text-slate-300">
                    <span class="min-w-0 truncate">
                      {payment.description ?? m.plan_item_private_payment()}
                      · {formatDate(payment.paidOn)}
                      · {formatCurrency(payment.amount)}
                      {#if !payment.countsAsPaid}
                        · {m.plan_item_unpaid_link()}
                      {/if}
                    </span>
                    {#if canManage}
                      <button
                        type="button"
                        class="focus-visible:ring-accent shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                        disabled={unlinkingId === payment.transactionId}
                        onclick={() => unlinkPayment(payment.transactionId)}
                      >
                        {m.plan_item_unlink()}
                      </button>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
            {#if canManage && linkingItemId === item.id}
              <div class="space-y-2">
                <label class="text-xs font-medium text-slate-300" for="spend-payment-search">
                  {m.plan_item_link_search()}
                </label>
                <input
                  id="spend-payment-search"
                  type="search"
                  bind:value={paymentQuery}
                  class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 focus:ring-2 focus:outline-none"
                />
                {#if candidatesQuery.isPending}
                  <p class="text-xs text-slate-500">{m.common_loading()}</p>
                {:else if paymentCandidates.length === 0}
                  <p class="text-xs text-slate-500">{m.plan_item_link_empty()}</p>
                {:else}
                  <ul class="space-y-1">
                    {#each paymentCandidates as candidate (candidate.id)}
                      <li>
                        <button
                          type="button"
                          class="focus-visible:ring-accent flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                          disabled={linking}
                          onclick={() => linkPayment(item.id, candidate.id)}
                        >
                          <span class="min-w-0 truncate">
                            {candidate.description} · {formatDate(candidate.date)}
                          </span>
                          <span class="shrink-0">{formatCurrency(candidate.amount)}</span>
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
        {#each cancelledItems as item (item.id)}
          {@const itemPayments = settlements.filter(
            (settlement) => settlement.planItemId === item.id
          )}
          {@const settlement = settleSpendItem(item.amount, paymentsFor(item.id))}
          <li class="space-y-2 rounded-xl border border-white/5 px-3 py-3 text-slate-500">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate line-through">{item.label}</p>
                <p class="mt-0.5 text-xs">
                  {facingLabel(item)} · {formatCurrency(item.amount)}
                </p>
                {#if settlement.settled > 0}
                  <p class="mt-1 text-sm text-slate-300">
                    {m.plan_item_paid({ amount: formatCurrency(settlement.settled) })}
                  </p>
                {/if}
              </div>
              {#if canManage}
                <button
                  type="button"
                  class="focus-visible:ring-accent shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                  disabled={cancellingId === item.id}
                  onclick={() => restoreItem(item)}
                >
                  {m.plan_item_restore()}
                </button>
              {/if}
            </div>
            {#if itemPayments.length > 0}
              <ul class="space-y-1">
                {#each itemPayments as payment (payment.linkId)}
                  <li class="flex items-center justify-between gap-3 text-sm text-slate-400">
                    <span class="min-w-0 truncate">
                      {payment.description ?? m.plan_item_private_payment()}
                      · {formatDate(payment.paidOn)}
                      · {formatCurrency(payment.amount)}
                    </span>
                    {#if canManage}
                      <button
                        type="button"
                        class="focus-visible:ring-accent shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                        disabled={unlinkingId === payment.transactionId}
                        onclick={() => unlinkPayment(payment.transactionId)}
                      >
                        {m.plan_item_unlink()}
                      </button>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>

<Dialog
  open={formOpen}
  onclose={requestCloseForm}
  title={editingId ? m.plan_item_edit_heading() : m.plan_item_add()}
>
  <form class="space-y-3" onsubmit={saveItem}>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="spend-item-label">
        {m.plan_item_label()}
      </label>
      <input
        id="spend-item-label"
        type="text"
        required
        maxlength="120"
        bind:value={label}
        class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 focus:ring-2 focus:outline-none"
      />
    </div>
    <div class="grid gap-3 sm:grid-cols-2">
      <div class="space-y-1">
        <label class="text-xs font-medium text-slate-300" for="spend-item-amount">
          {m.plan_item_amount()}
        </label>
        <input
          id="spend-item-amount"
          type="number"
          min="0.01"
          step="0.01"
          required
          bind:value={amount}
          class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 focus:ring-2 focus:outline-none"
        />
      </div>
      <DayPicker
        id="spend-item-due"
        bind:value={dueDate}
        label={m.plan_item_due()}
        yearsPast={2}
        yearsAhead={5}
      />
    </div>
    <fieldset class="space-y-2">
      <legend class="flex items-center gap-1 text-xs font-medium text-slate-300">
        {m.plan_item_kind()}
        <InfoTooltip label={m.plan_item_kind_help_label()} text={m.plan_item_kind_help()} />
      </legend>
      <label class="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="radio"
          name="spend-item-kind"
          checked={!confirmed}
          onchange={() => (confirmed = false)}
        />
        {m.plan_item_status_estimated()}
      </label>
      <label class="flex items-center gap-2 text-sm text-slate-200">
        <input
          type="radio"
          name="spend-item-kind"
          checked={confirmed}
          disabled={!dueDate.trim() || saving}
          onchange={() => (confirmed = true)}
        />
        {m.plan_item_status_confirmed()}
      </label>
    </fieldset>
    <details class="rounded-xl border border-white/10 px-3 py-2">
      <summary class="min-h-11 cursor-pointer content-center text-sm text-slate-300">
        {m.plan_item_more_details()}
      </summary>
      <div class="space-y-1 py-2">
        <label class="text-xs font-medium text-slate-300" for="spend-item-payee">
          {m.plan_item_payee()}
        </label>
        <input
          id="spend-item-payee"
          type="text"
          maxlength="160"
          bind:value={payee}
          class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 focus:ring-2 focus:outline-none"
        />
      </div>
    </details>
    <div class="flex flex-wrap gap-2">
      <button
        type="submit"
        disabled={saving}
        class="bg-accent-gradient focus-visible:ring-accent min-h-11 rounded-full px-4 text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        {saving ? m.common_saving() : editingId ? m.plan_item_save() : m.plan_item_add()}
      </button>
      <button
        type="button"
        class="focus-visible:ring-accent min-h-11 rounded-full border border-white/10 px-4 text-sm text-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
        disabled={saving}
        onclick={requestCloseForm}
      >
        {m.plan_item_discard()}
      </button>
    </div>
  </form>
</Dialog>
