<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { supabase } from "$lib/supabase";
  import {
    canManageTransaction,
    isQuickSettleEligible,
  } from "$lib/services/transaction-permissions";
  import type { GroupMemberRole, Plan, TransactionWithCategory } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { recurrenceSummary } from "$lib/recurrence";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { Check, ClipboardList, Edit, Link2, Link2Off, Trash2, X } from "lucide-svelte";
  import { fetchPlans } from "$lib/services/plans";
  import { linkPlanTransaction, unlinkPlanTransaction } from "$lib/services/plan-settlement";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import { requireSessionUserId, session } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";

  interface Props {
    transaction: TransactionWithCategory | null;
    currentUserId?: string | null;
    groupRoles?: Map<string, GroupMemberRole>;
    onclose: () => void;
    onedit?: (tx: TransactionWithCategory) => void;
    ondelete?: (id: string) => void;
    oneditseries?: (tx: TransactionWithCategory) => void;
    oneditoccurrence?: (tx: TransactionWithCategory) => void;
    onskipoccurrence?: (tx: TransactionWithCategory) => void;
    onendseries?: (tx: TransactionWithCategory) => void;
    onsettle?: (tx: TransactionWithCategory) => void;
    settlePending?: boolean;
  }
  let {
    transaction,
    currentUserId,
    groupRoles = new Map(),
    onclose,
    onedit,
    ondelete,
    oneditseries,
    oneditoccurrence,
    onskipoccurrence,
    onendseries,
    onsettle,
    settlePending = false,
  }: Props = $props();
  const queryClient = useQueryClient();
  const uid = $derived(session.userId);

  const canEdit = $derived(
    !!transaction &&
      !transaction.projected &&
      !!currentUserId &&
      canManageTransaction(transaction, currentUserId, groupRoles)
  );
  const canManageSeries = $derived(
    !!transaction && !!currentUserId && canManageTransaction(transaction, currentUserId, groupRoles)
  );
  const isSeries = $derived(
    !!transaction &&
      (transaction.is_recurring || !!transaction.recurring_template_id || !!transaction.projected)
  );
  const isSeriesTemplate = $derived(
    !!transaction && transaction.is_recurring && !transaction.recurring_template_id
  );
  let openScope = $state<"edit" | "delete" | null>(null);
  const isSharedReadonly = $derived(
    !!transaction &&
      !!transaction.group_id &&
      !!currentUserId &&
      transaction.user_id !== currentUserId &&
      !canEdit
  );
  const canQuickSettle = $derived(
    !!transaction &&
      !!onsettle &&
      !transaction.projected &&
      isQuickSettleEligible(transaction.status) &&
      !!currentUserId &&
      canManageTransaction(transaction, currentUserId, groupRoles)
  );

  const statusClass: Record<string, string> = {
    paid: "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    draft: "border border-white/10 bg-slate-800/60 text-slate-400",
    upcoming: "border border-sky-400/20 bg-sky-400/10 text-sky-300",
    overdue: "border border-rose-400/20 bg-rose-400/10 text-rose-300",
  };

  const statusLabel: Record<string, string> = {
    paid: m.transactions_status_paid(),
    draft: m.transactions_status_draft(),
    upcoming: m.transactions_status_upcoming(),
    overdue: m.transactions_status_overdue(),
  };

  const planLinkQuery = createQuery(() => ({
    queryKey: uid
      ? qk.transactions.list(uid, "transaction-plan-link", transaction?.id)
      : ["user", "", "transactions", "transaction-plan-link", transaction?.id],
    queryFn: async () => {
      if (!transaction) return null;
      const { data, error } = await supabase
        .from("plan_transaction_links")
        .select("plan_id, plans(name)")
        .eq("transaction_id", transaction.id)
        .maybeSingle();
      if (error) throw error;
      return data as { plan_id: string; plans: { name: string; kind?: string } | null } | null;
    },
    enabled: !!transaction && !transaction.projected && !!uid,
  }));

  const plansQuery = createQuery(() => ({
    queryKey: uid ? qk.plans(uid) : ["user", "", "plans"],
    queryFn: fetchPlans,
    enabled:
      !!transaction && transaction.type === "expense" && transaction.status === "paid" && !!uid,
  }));

  const eligiblePlans = $derived.by(() => {
    if (!transaction || !currentUserId || planLinkQuery.data) return [];
    const txDate = transaction.date.slice(0, 10);
    return (plansQuery.data ?? []).filter((plan) => {
      if (txDate < plan.start_date || txDate > plan.end_date) return false;
      if (transaction.group_id) return plan.group_id === transaction.group_id;
      return plan.group_id === null && plan.user_id === currentUserId;
    });
  });
  let selectedPlanId = $state("");

  const linkMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!transaction || !selectedPlanId) throw new Error("plan_required");
      const plan = eligiblePlans.find((candidate) => candidate.id === selectedPlanId) as Plan;
      await linkPlanTransaction(plan.id, transaction.id, { planKind: plan.kind });
    },
    onSuccess: async () => {
      toast.success(m.plan_settle_linked());
      selectedPlanId = "";
      const u = requireSessionUserId();
      await queryClient.invalidateQueries({ queryKey: qk.transactions.all(u) });
      await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgress(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planDebtTermsList(u) });
    },
    onError: (error) => toastError(error),
  }));

  const unlinkPlanMutation = createMutation(() => ({
    mutationFn: async () => {
      if (!transaction || !planLinkQuery.data) return;
      const planId = planLinkQuery.data.plan_id;
      await unlinkPlanTransaction(planId, transaction.id);
    },
    onSuccess: async () => {
      toast.success(m.plan_settle_unlinked());
      const u = requireSessionUserId();
      await queryClient.invalidateQueries({ queryKey: qk.transactions.all(u) });
      await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgress(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planDebtTermsList(u) });
    },
    onError: (error) => toastError(error),
  }));

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }

  $effect(() => {
    void transaction?.id;
    openScope = null;
    selectedPlanId = "";
  });
</script>

<svelte:window onkeydown={handleKeydown} />

{#if transaction}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm"
    role="presentation"
    onclick={onclose}
    aria-hidden="true"
  ></div>

  <!-- Sheet -->
  <aside
    class="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-white/5 bg-slate-950/95 shadow-[0_0_60px_rgba(16,185,129,0.08)] backdrop-blur"
    aria-label={m.transaction_detail_title()}
  >
    <div class="flex items-center justify-between border-b border-white/5 px-5 py-4">
      <h2 class="text-base font-semibold text-slate-100">
        {transaction.counterparty?.trim() || transaction.description}
        {#if transaction.is_recurring || transaction.projected}
          <span class="ml-1 text-sm font-normal text-slate-400" title="Cykliczna">↻</span>
        {/if}
      </h2>
      <button
        type="button"
        onclick={onclose}
        class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
        aria-label={m.common_close()}
      >
        <X size={18} />
      </button>
    </div>

    <div class="flex-1 space-y-5 overflow-y-auto px-5 py-5">
      <!-- Amount -->
      <div>
        <p class="text-eyebrow mb-1 text-slate-400">
          {m.transactions_col_amount()}
        </p>
        <p
          class={cn(
            "text-2xl font-bold tabular-nums",
            transaction.type === "income" ? "text-emerald-600" : "text-rose-600"
          )}
        >
          {transaction.type === "income" ? "+" : "−"}{formatCurrency(
            transaction.amount,
            transaction.currency
          )}
        </p>
      </div>

      {#if transaction.counterparty?.trim() && transaction.description}
        <div>
          <p class="text-eyebrow mb-1 text-slate-400">{m.transaction_form_description()}</p>
          <p class="text-sm text-slate-100">{transaction.description}</p>
        </div>
      {/if}

      <!-- Meta grid -->
      <dl class="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
        <div>
          <dt class="text-eyebrow text-slate-400">
            {m.transactions_col_date()}
          </dt>
          <dd class="mt-0.5 text-slate-100">{formatDate(transaction.date)}</dd>
        </div>
        <div>
          <dt class="text-eyebrow text-slate-400">
            {m.transactions_col_status()}
          </dt>
          <dd class="mt-0.5">
            <span
              class={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                statusClass[transaction.status] ??
                  "border border-white/10 bg-slate-800/60 text-slate-400"
              )}
            >
              {statusLabel[transaction.status] ?? transaction.status}
            </span>
          </dd>
        </div>
        <div>
          <dt class="text-eyebrow text-slate-400">
            {m.transactions_col_category()}
          </dt>
          <dd class="mt-0.5 text-slate-100">{transaction.category_name}</dd>
        </div>
        {#if transaction.is_recurring && transaction.recurrence_frequency}
          <div>
            <dt class="text-eyebrow text-slate-400">
              {m.transaction_form_recurring()}
            </dt>
            <dd class="mt-0.5 text-slate-100">
              {recurrenceSummary({
                frequency: transaction.recurrence_frequency,
                interval: transaction.recurrence_interval,
                weekday: transaction.recurrence_weekday,
                day: transaction.recurring_day,
                month: transaction.recurrence_month,
              })}
            </dd>
          </div>
        {/if}
      </dl>

      {#if transaction.projected}
        <div class="rounded-xl border border-sky-400/20 bg-sky-400/10 p-3">
          <p class="text-sm font-medium text-sky-200">
            {m.transactions_projected_detail_title()}
          </p>
          <p class="mt-1 text-xs leading-relaxed text-sky-100/80">
            {m.transactions_projected_detail_body()}
          </p>
        </div>
      {:else if transaction.recurring_template_id}
        <div class="rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3">
          <p class="text-sm font-medium text-emerald-200">
            {m.transactions_recurring_occurrence_detail_title()}
          </p>
          <p class="mt-1 text-xs leading-relaxed text-emerald-100/80">
            {m.transactions_recurring_occurrence_detail_body()}
          </p>
        </div>
      {/if}

      {#if isSeries && canManageSeries}
        <div class="rounded-xl border border-white/5 bg-slate-900/40 p-3">
          <p class="text-eyebrow mb-2 text-slate-400">{m.transactions_series_title()}</p>
          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => (openScope = openScope === "edit" ? null : "edit")}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5"
            >
              <Edit size={14} />
              {m.transactions_series_edit()}
            </button>
            <button
              type="button"
              onclick={() => (openScope = openScope === "delete" ? null : "delete")}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 py-2 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-500/20"
            >
              <Trash2 size={14} />
              {m.transactions_series_delete()}
            </button>
          </div>

          {#if openScope === "edit"}
            <div class="mt-2 flex flex-col gap-1.5">
              {#if !isSeriesTemplate}
                <button
                  type="button"
                  onclick={() => {
                    oneditoccurrence?.(transaction);
                    onclose();
                  }}
                  class="rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/5"
                >
                  {m.transactions_series_scope_this()}
                </button>
              {/if}
              <button
                type="button"
                onclick={() => {
                  oneditseries?.(transaction);
                  onclose();
                }}
                class="rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/5"
              >
                {m.transactions_series_scope_all()}
              </button>
            </div>
          {/if}

          {#if openScope === "delete"}
            <div class="mt-2 flex flex-col gap-1.5">
              {#if !isSeriesTemplate}
                <button
                  type="button"
                  onclick={() => {
                    onskipoccurrence?.(transaction);
                    onclose();
                  }}
                  class="rounded-lg border border-rose-400/20 px-3 py-2 text-left text-sm text-rose-200 transition-colors hover:bg-rose-500/10"
                >
                  {m.transactions_series_scope_this()}
                </button>
              {/if}
              <button
                type="button"
                onclick={() => {
                  onendseries?.(transaction);
                  onclose();
                }}
                class="rounded-lg border border-rose-400/20 px-3 py-2 text-left text-sm text-rose-200 transition-colors hover:bg-rose-500/10"
              >
                {m.transactions_series_scope_following()}
              </button>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Linked plan -->
      {#if planLinkQuery.data}
        <div>
          <p class="text-eyebrow mb-1 text-slate-400">
            {m.nav_plans()}
          </p>
          <a
            href="/plans/{planLinkQuery.data.plan_id}"
            class="hover:text-accent inline-flex items-center gap-1.5 text-sm text-slate-200 transition-colors"
          >
            <ClipboardList size={14} />
            {planLinkQuery.data.plans?.name ?? m.transaction_detail_show_plan()}
          </a>
          <button
            type="button"
            onclick={() => unlinkPlanMutation.mutate()}
            disabled={unlinkPlanMutation.isPending}
            class="mt-2 flex items-center gap-1.5 text-xs font-medium text-rose-300 hover:underline disabled:opacity-50"
          >
            <Link2Off size={13} />
            {m.transaction_plan_unlink()}
          </button>
        </div>
      {:else if transaction.type === "expense" && transaction.status === "paid" && eligiblePlans.length > 0}
        <div class="space-y-2">
          <label for="transaction-plan" class="text-eyebrow block text-slate-400">
            {m.transaction_plan_link()}
          </label>
          <div class="flex gap-2">
            <select
              id="transaction-plan"
              bind:value={selectedPlanId}
              class="focus:border-accent/40 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none"
            >
              <option value="">{m.transaction_plan_choose()}</option>
              {#each eligiblePlans as plan (plan.id)}
                <option value={plan.id}>{plan.name}</option>
              {/each}
            </select>
            <button
              type="button"
              onclick={() => linkMutation.mutate()}
              disabled={!selectedPlanId || linkMutation.isPending}
              class="bg-accent-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-950 disabled:opacity-50"
              aria-label={m.transaction_plan_link()}
            >
              <Link2 size={16} />
            </button>
          </div>
        </div>
      {/if}
    </div>

    {#if isSharedReadonly}
      <p class="border-t border-white/5 px-5 py-4 text-xs text-slate-500">
        {m.transaction_shared_readonly_hint()}
      </p>
    {/if}

    {#if canQuickSettle}
      <div class="border-t border-white/5 px-5 py-4">
        <button
          type="button"
          disabled={settlePending}
          onclick={() => onsettle?.(transaction!)}
          class="focus-visible:ring-accent flex w-full items-center justify-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 py-2.5 text-sm font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/20 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
        >
          <Check size={14} strokeWidth={2.5} aria-hidden="true" />
          {settlePending ? m.common_saving() : m.transactions_quick_settle()}
        </button>
      </div>
    {/if}

    {#if canEdit && (onedit || ondelete)}
      <div class="flex gap-2 border-t border-white/5 px-5 py-4">
        {#if onedit}
          <button
            type="button"
            onclick={() => {
              onedit(transaction!);
              onclose();
            }}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
          >
            <Edit size={14} />
            {m.common_edit()}
          </button>
        {/if}
        {#if ondelete}
          <button
            type="button"
            onclick={() => {
              ondelete(transaction!.id);
              onclose();
            }}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 py-2 text-sm font-medium text-rose-300 backdrop-blur transition-colors hover:bg-rose-500/20"
          >
            <Trash2 size={14} />
            {m.common_delete()}
          </button>
        {/if}
      </div>
    {/if}
  </aside>
{/if}
