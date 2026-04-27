<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { TransactionWithCategory } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";

  interface Props {
    transactions: TransactionWithCategory[];
    onedit?: (tx: TransactionWithCategory) => void;
    ondelete?: (id: string) => void;
  }
  let { transactions, onedit, ondelete }: Props = $props();

  const statusLabel: Record<string, string> = {
    paid: m.transactions_status_paid(),
    draft: m.transactions_status_draft(),
    upcoming: m.transactions_status_upcoming(),
    overdue: m.transactions_status_overdue(),
  };

  const statusClass: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700",
    draft: "bg-zinc-100 text-zinc-500",
    upcoming: "bg-blue-50 text-blue-700",
    overdue: "bg-rose-50 text-rose-700",
  };
</script>

{#if transactions.length === 0}
  <p class="py-12 text-center text-sm text-zinc-400">
    {m.transactions_empty()}
  </p>
{:else}
  <!-- Mobile card list -->
  <ul class="sm:hidden space-y-1.5" aria-label={m.transactions_title()}>
    {#each transactions as tx}
      <li class="rounded-xl border border-zinc-200 bg-white px-4 py-3">
        <div class="flex items-start justify-between gap-3">
          <span
            class="text-sm font-medium text-zinc-900 leading-snug flex-1 min-w-0 truncate"
          >
            {tx.description}
            {#if tx.is_recurring}
              <span class="ml-1 text-xs text-zinc-400" aria-label="cykliczna"
                >↻</span
              >
            {/if}
          </span>
          <span
            class={cn(
              "text-sm font-semibold tabular-nums shrink-0",
              tx.type === "income" ? "text-emerald-600" : "text-rose-600",
            )}
          >
            {tx.type === "income" ? "+" : "−"}{formatCurrency(
              tx.amount,
              tx.currency,
            )}
          </span>
        </div>
        <div class="mt-1.5 flex items-center gap-2 flex-wrap">
          <span class="text-xs text-zinc-400">{formatDate(tx.date)}</span>
          <span class="text-xs text-zinc-300" aria-hidden="true">·</span>
          <span class="text-xs text-zinc-400">{tx.category_name}</span>
          <span
            class={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ml-auto",
              statusClass[tx.status] ?? "bg-zinc-100 text-zinc-500",
            )}
          >
            {statusLabel[tx.status] ?? tx.status}
          </span>
          {#if onedit || ondelete}
            <div class="flex gap-1 ml-1">
              {#if onedit}
                <button
                  onclick={() => onedit(tx)}
                  class="p-1 text-zinc-400 hover:text-zinc-600 transition-colors"
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
                    ><path
                      d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
                    /></svg
                  >
                </button>
              {/if}
              {#if ondelete}
                <button
                  onclick={() => ondelete(tx.id)}
                  class="p-1 text-zinc-400 hover:text-rose-600 transition-colors"
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
                    ><path d="M3 6h18" /><path
                      d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                    /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg
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
    class="hidden sm:block rounded-xl border border-zinc-200 bg-white overflow-hidden"
  >
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-zinc-100 bg-zinc-50">
          <th
            scope="col"
            class="px-4 py-3 text-left text-xs font-medium text-zinc-500"
            >{m.transactions_col_date()}</th
          >
          <th
            scope="col"
            class="px-4 py-3 text-left text-xs font-medium text-zinc-500"
            >{m.transactions_col_description()}</th
          >
          <th
            scope="col"
            class="px-4 py-3 text-left text-xs font-medium text-zinc-500"
            >{m.transactions_col_category()}</th
          >
          <th
            scope="col"
            class="px-4 py-3 text-left text-xs font-medium text-zinc-500"
            >{m.transactions_col_status()}</th
          >
          <th
            scope="col"
            class="px-4 py-3 text-right text-xs font-medium text-zinc-500"
            >{m.transactions_col_amount()}</th
          >
          {#if onedit || ondelete}
            <th scope="col" class="px-4 py-3"></th>
          {/if}
        </tr>
      </thead>
      <tbody>
        {#each transactions as tx}
          <tr
            class="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors"
          >
            <td class="px-4 py-3 text-zinc-500 whitespace-nowrap"
              >{formatDate(tx.date)}</td
            >
            <td class="px-4 py-3 text-zinc-900 max-w-xs truncate">
              {tx.description}
              {#if tx.is_recurring}
                <span class="ml-1 text-xs text-zinc-400" aria-label="cykliczna"
                  >↻</span
                >
              {/if}
            </td>
            <td class="px-4 py-3 text-zinc-500">{tx.category_name}</td>
            <td class="px-4 py-3">
              <span
                class={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  statusClass[tx.status] ?? "bg-zinc-100 text-zinc-500",
                )}
              >
                {statusLabel[tx.status] ?? tx.status}
              </span>
            </td>
            <td
              class={cn(
                "px-4 py-3 text-right font-medium tabular-nums whitespace-nowrap",
                tx.type === "income" ? "text-emerald-600" : "text-rose-600",
              )}
            >
              {tx.type === "income" ? "+" : "−"}{formatCurrency(
                tx.amount,
                tx.currency,
              )}
            </td>
            {#if onedit || ondelete}
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-1">
                  {#if onedit}
                    <button
                      onclick={() => onedit(tx)}
                      class="p-1.5 text-zinc-400 hover:text-zinc-600 transition-colors rounded"
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
                        ><path
                          d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
                        /></svg
                      >
                    </button>
                  {/if}
                  {#if ondelete}
                    <button
                      onclick={() => ondelete(tx.id)}
                      class="p-1.5 text-zinc-400 hover:text-rose-600 transition-colors rounded"
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
                        ><path d="M3 6h18" /><path
                          d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
                        /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg
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
