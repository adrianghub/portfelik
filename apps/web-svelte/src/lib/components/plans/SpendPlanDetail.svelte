<script lang="ts">
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import { session, requireSessionUserId } from "$lib/auth/session.svelte";
  import { summarizeSpendBudget } from "$lib/plans/spend";
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
  import { errorMessage } from "$lib/services/supabase-errors";
  import type { Plan } from "$lib/types";
  import { formatCurrency, formatDate } from "$lib/utils";
  import { createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";

  let { plan, canManage }: { plan: Plan; canManage: boolean } = $props();

  const queryClient = useQueryClient();
  let label = $state("");
  let amount = $state("");
  let dueDate = $state("");
  let payee = $state("");
  let confirmed = $state(false);
  let editingId = $state<string | null>(null);
  let saving = $state(false);
  let cancellingId = $state<string | null>(null);
  let formEl = $state<HTMLFormElement | null>(null);

  $effect(() => {
    if (!dueDate.trim()) confirmed = false;
  });

  const itemsQuery = createQuery(() => ({
    queryKey: qk.planItems(session.userId ?? "", plan.id),
    queryFn: () => fetchPlanItems(plan.id),
    enabled: !!session.userId,
  }));

  const summary = $derived(summarizeSpendBudget(plan.budget_amount ?? 0, itemsQuery.data ?? []));
  const activeItems = $derived(
    (itemsQuery.data ?? []).filter((item) => item.status !== "cancelled")
  );
  const cancelledItems = $derived(
    (itemsQuery.data ?? []).filter((item) => item.status === "cancelled")
  );

  function itemStatusLabel(status: PlanItem["status"]): string {
    if (status === "planned") return m.plan_item_status_planned();
    if (status === "confirmed") return m.plan_item_status_confirmed();
    if (status === "cancelled") return m.plan_item_status_cancelled();
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

  function resetForm() {
    editingId = null;
    label = "";
    amount = "";
    dueDate = "";
    payee = "";
    confirmed = false;
  }

  function startEdit(item: PlanItem) {
    editingId = item.id;
    label = item.label;
    amount = String(item.amount);
    dueDate = item.due_date ?? "";
    payee = item.payee ?? "";
    confirmed = item.status === "confirmed";
    formEl?.scrollIntoView({ block: "nearest" });
  }

  async function refreshItems() {
    const userId = requireSessionUserId();
    await queryClient.invalidateQueries({ queryKey: qk.planItems(userId, plan.id) });
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

<section class="space-y-4" aria-labelledby="spend-summary-heading">
  <h2 id="spend-summary-heading" class="text-sm font-semibold text-slate-100">
    {m.plan_spend_summary()}
  </h2>
  <dl class="grid gap-3 sm:grid-cols-2">
    <div class="rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3">
      <dt class="text-xs text-slate-400">{m.plan_form_budget()}</dt>
      <dd class="mt-1 text-lg font-semibold text-slate-100">
        {formatCurrency(summary.budget)}
      </dd>
    </div>
    <div class="rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3">
      <dt class="text-xs text-slate-400">{m.plan_spend_planned()}</dt>
      <dd class="mt-1 text-lg font-semibold text-slate-100">
        {formatCurrency(summary.planned)}
      </dd>
    </div>
    <div class="rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3">
      <dt class="text-xs text-slate-400">{m.plan_spend_budget_left_label()}</dt>
      <dd class="mt-1 text-lg font-semibold text-slate-100">
        {#if summary.budgetLeft < 0}
          {m.plan_spend_over_budget({ amount: formatCurrency(Math.abs(summary.budgetLeft)) })}
        {:else}
          {formatCurrency(summary.budgetLeft)}
        {/if}
      </dd>
    </div>
    <div class="rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3">
      <dt class="text-xs text-slate-400">{m.plan_spend_to_pay()}</dt>
      <dd class="mt-1 text-lg font-semibold text-slate-100">{formatCurrency(summary.toPay)}</dd>
      {#if summary.orientational > 0}
        <p class="mt-1 text-xs text-slate-300">
          {m.plan_spend_orientational({ amount: formatCurrency(summary.orientational) })}
        </p>
      {/if}
      <p class="mt-1 text-xs text-slate-500">{m.plan_spend_to_pay_hint()}</p>
    </div>
  </dl>
  <p class="text-xs text-slate-400">{m.plan_spend_balance_hint()}</p>

  <div class="space-y-2">
    <h3 class="text-sm font-semibold text-slate-100">{m.plan_spend_items()}</h3>
    {#if itemsQuery.isError}
      <p class="text-sm text-rose-300">{m.error_generic()}</p>
    {:else if activeItems.length === 0 && cancelledItems.length === 0}
      <p class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-400">
        {m.plan_item_empty()}
      </p>
    {:else}
      <ul class="space-y-2">
        {#each activeItems as item (item.id)}
          <li
            class="flex items-start justify-between gap-3 rounded-xl border bg-slate-900/60 px-3 py-3 {editingId ===
            item.id
              ? 'border-accent/40'
              : 'border-white/5'}"
          >
            <div class="min-w-0">
              <p class="truncate font-medium text-slate-100">{item.label}</p>
              <p class="mt-0.5 text-xs text-slate-400">
                {itemStatusLabel(item.status)}
                {#if item.due_date}
                  · {formatDate(item.due_date)}
                {/if}
                {#if item.payee}
                  · {item.payee}
                {/if}
              </p>
              {#if item.status === "confirmed"}
                <p class="mt-1 text-sm text-slate-200">
                  {m.plan_spend_to_pay()}
                  {formatCurrency(item.amount)}
                </p>
              {:else}
                <p class="mt-1 text-sm text-slate-200">{formatCurrency(item.amount)}</p>
              {/if}
            </div>
            {#if canManage}
              <div class="flex shrink-0 flex-col gap-2">
                <button
                  type="button"
                  class="focus-visible:ring-accent rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                  disabled={cancellingId === item.id}
                  onclick={() => startEdit(item)}
                >
                  {m.plan_item_edit()}
                </button>
                <button
                  type="button"
                  class="focus-visible:ring-accent rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
                  disabled={cancellingId === item.id}
                  onclick={() => cancelItem(item.id)}
                >
                  {m.plan_item_cancel()}
                </button>
              </div>
            {/if}
          </li>
        {/each}
        {#each cancelledItems as item (item.id)}
          <li
            class="flex items-start justify-between gap-3 rounded-xl border border-white/5 px-3 py-3 text-slate-500"
          >
            <div class="min-w-0">
              <p class="truncate line-through">{item.label}</p>
              <p class="mt-0.5 text-xs">
                {itemStatusLabel(item.status)} · {formatCurrency(item.amount)}
              </p>
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
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if canManage}
    <form
      bind:this={formEl}
      class="space-y-3 rounded-2xl border border-white/5 bg-slate-900/40 p-4"
      onsubmit={saveItem}
    >
      <h3 class="text-sm font-semibold text-slate-100">
        {editingId ? m.plan_item_edit_heading() : m.plan_item_add()}
      </h3>
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
      <p class="text-xs text-slate-500">{m.plan_item_due_hint()}</p>
      <div class="space-y-1">
        <label class="flex items-center gap-2 text-sm text-slate-200" for="spend-item-confirmed">
          <input
            id="spend-item-confirmed"
            type="checkbox"
            bind:checked={confirmed}
            disabled={!dueDate.trim() || saving}
          />
          {m.plan_item_confirmed()}
        </label>
        <p class="text-xs text-slate-500">{m.plan_item_confirmed_hint()}</p>
      </div>
      <div class="space-y-1">
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
      <div class="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={saving}
          class="bg-accent-gradient focus-visible:ring-accent rounded-full px-4 py-2 text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        >
          {saving ? m.common_saving() : editingId ? m.plan_item_save() : m.plan_item_add()}
        </button>
        {#if editingId}
          <button
            type="button"
            class="focus-visible:ring-accent rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
            disabled={saving}
            onclick={resetForm}
          >
            {m.plan_item_discard()}
          </button>
        {/if}
      </div>
    </form>
  {/if}
</section>
