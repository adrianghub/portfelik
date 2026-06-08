<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { supabase } from "$lib/supabase";
  import { canManageTransaction } from "$lib/services/transaction-permissions";
  import type { GroupMemberRole, TransactionWithCategory } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { recurrenceSummary } from "$lib/recurrence";
  import { createQuery } from "@tanstack/svelte-query";
  import { ClipboardList, Edit, Trash2, X } from "lucide-svelte";

  interface Props {
    transaction: TransactionWithCategory | null;
    currentUserId?: string | null;
    groupRoles?: Map<string, GroupMemberRole>;
    onclose: () => void;
    onedit?: (tx: TransactionWithCategory) => void;
    ondelete?: (id: string) => void;
  }
  let {
    transaction,
    currentUserId,
    groupRoles = new Map(),
    onclose,
    onedit,
    ondelete,
  }: Props = $props();

  const canEdit = $derived(
    !!transaction && !!currentUserId && canManageTransaction(transaction, currentUserId, groupRoles)
  );
  const isSharedReadonly = $derived(
    !!transaction &&
      !!transaction.group_id &&
      !!currentUserId &&
      transaction.user_id !== currentUserId &&
      !canEdit
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
    queryKey: ["transaction-plan-link", transaction?.id],
    queryFn: async () => {
      if (!transaction) return null;
      const { data, error } = await supabase
        .from("plan_transaction_links")
        .select("plan_id, plans(name)")
        .eq("transaction_id", transaction.id)
        .maybeSingle();
      if (error) throw error;
      return data as { plan_id: string; plans: { name: string } | null } | null;
    },
    enabled: !!transaction,
  }));

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
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
        {transaction.description}
        {#if transaction.is_recurring}
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
        </div>
      {/if}
    </div>

    {#if isSharedReadonly}
      <p class="border-t border-white/5 px-5 py-4 text-xs text-slate-500">
        {m.transaction_shared_readonly_hint()}
      </p>
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
