<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { TransactionWithCategory } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { Users } from "lucide-svelte";

  interface Props {
    transactions: TransactionWithCategory[];
    currentUserId?: string | null;
    onedit?: (tx: TransactionWithCategory) => void;
    ondelete?: (id: string) => void;
    onrowclick?: (tx: TransactionWithCategory) => void;
    emptyLabel?: string;
    selectedIds?: Set<string>;
  }
  let { transactions, currentUserId, onedit, ondelete, onrowclick, emptyLabel, selectedIds = $bindable(new Set<string>()) }: Props = $props();

  const isShared = (tx: TransactionWithCategory) => !!currentUserId && tx.user_id !== currentUserId;

  const allSelected = $derived(transactions.length > 0 && transactions.every((tx) => selectedIds.has(tx.id)));
  const someSelected = $derived(transactions.some((tx) => selectedIds.has(tx.id)));

  $effect(() => {
    void transactions;
    selectedIds = new Set<string>();
  });

  function toggleAll() {
    if (allSelected) {
      selectedIds = new Set<string>();
    } else {
      selectedIds = new Set(transactions.map((tx) => tx.id));
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  const statusLabel: Record<string, string> = {
    paid: m.transactions_status_paid(),
    draft: m.transactions_status_draft(),
    upcoming: m.transactions_status_upcoming(),
    overdue: m.transactions_status_overdue(),
  };

  const statusClass: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    draft: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
    upcoming: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400",
    overdue: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-400",
  };
</script>

{#if transactions.length === 0}
  <p class="py-12 text-center text-sm text-zinc-400 dark:text-zinc-500">
    {emptyLabel ?? m.transactions_empty()}
  </p>
{:else}
  <!-- Mobile card list -->
  <ul class="space-y-1.5 sm:hidden" aria-label={m.transactions_title()}>
    {#each transactions as tx (tx.id)}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <li
        class="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
        class:cursor-pointer={!!onrowclick}
        class:ring-2={selectedIds.has(tx.id)}
        class:ring-zinc-400={selectedIds.has(tx.id)}
        role={onrowclick ? "button" : undefined}
        tabindex={onrowclick ? 0 : undefined}
        onclick={() => onrowclick?.(tx)}
        onkeydown={(e) => {
          if (e.key === "Enter" || e.key === " ") onrowclick?.(tx);
        }}
      >
        <div class="flex items-start justify-between gap-3">
          {#if ondelete}
            <button
              type="button"
              onclick={(e) => { e.stopPropagation(); toggleOne(tx.id); }}
              class="mt-0.5 shrink-0 flex h-4 w-4 items-center justify-center rounded border border-zinc-300 transition-colors dark:border-zinc-600 {selectedIds.has(tx.id) ? 'border-zinc-900 bg-zinc-900 dark:border-zinc-200 dark:bg-zinc-200' : 'hover:border-zinc-500'}"
              aria-label={m.transactions_select_all()}
            >
              {#if selectedIds.has(tx.id)}
                <svg class="h-2.5 w-2.5 text-white dark:text-zinc-900" viewBox="0 0 10 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 4 7 9 1" /></svg>
              {/if}
            </button>
          {/if}
          <span
            class="min-w-0 flex-1 truncate text-sm leading-snug font-medium text-zinc-900 dark:text-zinc-100"
          >
            {tx.description}
            {#if tx.is_recurring}
              <span class="ml-1 text-xs text-zinc-400" aria-label="cykliczna">↻</span>
            {/if}
            {#if isShared(tx)}
              <span
                class="ml-1 inline-flex items-center gap-0.5 rounded border border-zinc-200 px-1 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
              >
                <Users size={9} />
              </span>
            {/if}
          </span>
          <span
            class={cn(
              "shrink-0 text-sm font-semibold tabular-nums",
              tx.type === "income" ? "text-emerald-600" : "text-rose-600"
            )}
          >
            {tx.type === "income" ? "+" : "−"}{formatCurrency(tx.amount, tx.currency)}
          </span>
        </div>
        <div class="mt-1.5 flex flex-wrap items-center gap-2">
          <span class="text-xs text-zinc-400 dark:text-zinc-500">{formatDate(tx.date)}</span>
          <span class="text-xs text-zinc-300 dark:text-zinc-600" aria-hidden="true">·</span>
          <span class="text-xs text-zinc-400 dark:text-zinc-500">{tx.category_name}</span>
          <span
            class={cn(
              "ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              statusClass[tx.status] ??
                "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            )}
          >
            {statusLabel[tx.status] ?? tx.status}
          </span>
          {#if onedit || ondelete}
            <div class="ml-1 flex gap-1">
              {#if onedit}
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    onedit(tx);
                  }}
                  class="p-1 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                  aria-label={m.common_edit()}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
                  >
                </button>
              {/if}
              {#if ondelete}
                <button
                  onclick={(e) => {
                    e.stopPropagation();
                    ondelete(tx.id);
                  }}
                  class="p-1 text-zinc-400 transition-colors hover:text-rose-600 dark:text-zinc-500"
                  aria-label={m.common_delete()}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    ><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path
                      d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                    /></svg
                  >
                </button>
              {/if}
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  <!-- Desktop table -->
  <div
    class="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white sm:block dark:border-zinc-700 dark:bg-zinc-900"
  >
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800">
          {#if ondelete}
            <th scope="col" class="w-10 pl-4 py-3">
              <button
                type="button"
                onclick={toggleAll}
                class="flex h-4 w-4 items-center justify-center rounded border border-zinc-300 transition-colors dark:border-zinc-600 {allSelected ? 'border-zinc-900 bg-zinc-900 dark:border-zinc-200 dark:bg-zinc-200' : someSelected ? 'border-zinc-900 bg-zinc-400 dark:border-zinc-400 dark:bg-zinc-500' : 'hover:border-zinc-500'}"
                aria-label={allSelected ? m.transactions_deselect_all() : m.transactions_select_all()}
              >
                {#if allSelected}
                  <svg class="h-2.5 w-2.5 text-white dark:text-zinc-900" viewBox="0 0 10 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 4 7 9 1" /></svg>
                {:else if someSelected}
                  <svg class="h-2.5 w-2.5 text-white dark:text-zinc-900" viewBox="0 0 10 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="1" y1="1" x2="9" y2="1" /></svg>
                {/if}
              </button>
            </th>
          {/if}
          <th
            scope="col"
            class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >{m.transactions_col_date()}</th
          >
          <th
            scope="col"
            class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >{m.transactions_col_description()}</th
          >
          <th
            scope="col"
            class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >{m.transactions_col_category()}</th
          >
          <th
            scope="col"
            class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >{m.transactions_col_status()}</th
          >
          <th
            scope="col"
            class="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >{m.transactions_col_amount()}</th
          >
          {#if onedit || ondelete}
            <th scope="col" class="px-4 py-3"></th>
          {/if}
        </tr>
      </thead>
      <tbody>
        {#each transactions as tx (tx.id)}
          <tr
            class="border-b border-zinc-50 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
            class:cursor-pointer={!!onrowclick}
            class:bg-zinc-50={selectedIds.has(tx.id)}
            class:dark:bg-zinc-800={selectedIds.has(tx.id)}
            role={onrowclick ? "button" : undefined}
            tabindex={onrowclick ? 0 : undefined}
            onclick={() => onrowclick?.(tx)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") onrowclick?.(tx);
            }}
          >
            {#if ondelete}
              <td class="w-10 pl-4 py-3">
                <button
                  type="button"
                  onclick={(e) => { e.stopPropagation(); toggleOne(tx.id); }}
                  class="flex h-4 w-4 items-center justify-center rounded border border-zinc-300 transition-colors dark:border-zinc-600 {selectedIds.has(tx.id) ? 'border-zinc-900 bg-zinc-900 dark:border-zinc-200 dark:bg-zinc-200' : 'hover:border-zinc-500'}"
                  aria-label={m.transactions_select_all()}
                >
                  {#if selectedIds.has(tx.id)}
                    <svg class="h-2.5 w-2.5 text-white dark:text-zinc-900" viewBox="0 0 10 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 4 7 9 1" /></svg>
                  {/if}
                </button>
              </td>
            {/if}
            <td class="px-4 py-3 whitespace-nowrap text-zinc-500 dark:text-zinc-400"
              >{formatDate(tx.date)}</td
            >
            <td class="max-w-xs truncate px-4 py-3 text-zinc-900 dark:text-zinc-100">
              {tx.description}
              {#if tx.is_recurring}
                <span class="ml-1 text-xs text-zinc-400 dark:text-zinc-500" aria-label="cykliczna"
                  >↻</span
                >
              {/if}
              {#if isShared(tx)}
                <span
                  class="ml-1 inline-flex items-center gap-0.5 rounded border border-zinc-200 px-1 py-0.5 text-[10px] text-zinc-400 dark:border-zinc-700 dark:text-zinc-500"
                >
                  <Users size={10} />
                </span>
              {/if}
            </td>
            <td class="px-4 py-3 text-zinc-500 dark:text-zinc-400">{tx.category_name}</td>
            <td class="px-4 py-3">
              <span
                class={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  statusClass[tx.status] ?? "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                )}
              >
                {statusLabel[tx.status] ?? tx.status}
              </span>
            </td>
            <td
              class={cn(
                "px-4 py-3 text-right font-medium whitespace-nowrap tabular-nums",
                tx.type === "income" ? "text-emerald-600" : "text-rose-600"
              )}
            >
              {tx.type === "income" ? "+" : "−"}{formatCurrency(tx.amount, tx.currency)}
            </td>
            {#if onedit || ondelete}
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  {#if onedit}
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        onedit(tx);
                      }}
                      class="rounded p-1.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
                      aria-label={m.common_edit()}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
                      >
                    </button>
                  {/if}
                  {#if ondelete}
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        ondelete(tx.id);
                      }}
                      class="rounded p-1.5 text-zinc-400 transition-colors hover:text-rose-600 dark:hover:text-rose-400"
                      aria-label={m.common_delete()}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        ><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path
                          d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                        /></svg
                      >
                    </button>
                  {/if}
                </div>
              </td>
            {/if}
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
