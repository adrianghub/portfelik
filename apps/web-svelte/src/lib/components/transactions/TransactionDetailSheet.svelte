<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { TransactionWithCategory } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { Edit, ShoppingCart, Trash2, X } from "lucide-svelte";

  interface Props {
    transaction: TransactionWithCategory | null;
    currentUserId?: string | null;
    onclose: () => void;
    onedit?: (tx: TransactionWithCategory) => void;
    ondelete?: (id: string) => void;
  }
  let { transaction, currentUserId, onclose, onedit, ondelete }: Props = $props();

  const isOwner = $derived(
    !!currentUserId && !!transaction && transaction.user_id === currentUserId
  );

  const statusClass: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    draft: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    upcoming: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    overdue: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
  };

  const statusLabel: Record<string, string> = {
    paid: m.transactions_status_paid(),
    draft: m.transactions_status_draft(),
    upcoming: m.transactions_status_upcoming(),
    overdue: m.transactions_status_overdue(),
  };

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if transaction}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-40 bg-black/20"
    role="presentation"
    onclick={onclose}
    aria-hidden="true"
  ></div>

  <!-- Sheet -->
  <aside
    class="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-xl dark:bg-zinc-900"
    aria-label={m.transaction_detail_title()}
  >
    <div
      class="flex items-center justify-between border-b border-zinc-100 px-5 py-4 dark:border-zinc-800"
    >
      <h2 class="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {transaction.description}
        {#if transaction.is_recurring}
          <span class="ml-1 text-sm font-normal text-zinc-400" title="Cykliczna">↻</span>
        {/if}
      </h2>
      <button
        type="button"
        onclick={onclose}
        class="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
        aria-label={m.common_close()}
      >
        <X size={18} />
      </button>
    </div>

    <div class="flex-1 space-y-5 overflow-y-auto px-5 py-5">
      <!-- Amount -->
      <div>
        <p
          class="mb-1 text-xs font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500"
        >
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
          <dt class="text-xs font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
            {m.transactions_col_date()}
          </dt>
          <dd class="mt-0.5 text-zinc-900 dark:text-zinc-100">{formatDate(transaction.date)}</dd>
        </div>
        <div>
          <dt class="text-xs font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
            {m.transactions_col_status()}
          </dt>
          <dd class="mt-0.5">
            <span
              class={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                statusClass[transaction.status] ?? "bg-zinc-100 text-zinc-500"
              )}
            >
              {statusLabel[transaction.status] ?? transaction.status}
            </span>
          </dd>
        </div>
        <div>
          <dt class="text-xs font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
            {m.transactions_col_category()}
          </dt>
          <dd class="mt-0.5 text-zinc-900 dark:text-zinc-100">{transaction.category_name}</dd>
        </div>
        {#if transaction.is_recurring && transaction.recurring_day}
          <div>
            <dt
              class="text-xs font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500"
            >
              {m.transaction_form_recurring_day()}
            </dt>
            <dd class="mt-0.5 text-zinc-900 dark:text-zinc-100">
              {transaction.recurring_day}. {m.transaction_detail_recurring_day()}
            </dd>
          </div>
        {/if}
      </dl>

      <!-- Linked shopping list -->
      {#if transaction.shopping_list_id}
        <div>
          <p
            class="mb-1 text-xs font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500"
          >
            {m.nav_shopping_lists()}
          </p>
          <a
            href="/shopping-lists/{transaction.shopping_list_id}"
            class="inline-flex items-center gap-1.5 text-sm text-zinc-700 transition-colors hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
          >
            <ShoppingCart size={14} />
            {m.transaction_detail_show_shopping_list()}
          </a>
        </div>
      {/if}
    </div>

    {#if isOwner && (onedit || ondelete)}
      <div class="flex gap-2 border-t border-zinc-100 px-5 py-4 dark:border-zinc-800">
        {#if onedit}
          <button
            type="button"
            onclick={() => {
              onedit(transaction!);
              onclose();
            }}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-700"
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
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-50 py-2 text-sm font-medium text-rose-700 transition-colors hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-400 dark:hover:bg-rose-900"
          >
            <Trash2 size={14} />
            {m.common_delete()}
          </button>
        {/if}
      </div>
    {/if}
  </aside>
{/if}
