<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { ShoppingListSummary } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";

  interface Props {
    list: ShoppingListSummary;
    ondelete?: (id: string) => void;
    onduplicate?: (id: string) => void;
    onedit?: (list: ShoppingListSummary) => void;
  }
  let { list, ondelete, onduplicate, onedit }: Props = $props();

  const progress = $derived(
    list.item_total > 0 ? Math.round((list.item_completed / list.item_total) * 100) : null
  );
</script>

<div class="flex items-stretch overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
  <a href="/shopping-lists/{list.id}" class="flex-1 p-4 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800">
    <div class="flex items-start justify-between gap-2">
      <span class="font-medium text-zinc-900 dark:text-white">{list.name}</span>
      <span
        class={cn(
          "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
          list.status === "active" ? "bg-blue-50 text-blue-700" : "bg-zinc-100 text-zinc-500"
        )}
      >
        {list.status === "active"
          ? m.shopping_lists_status_active()
          : m.shopping_lists_status_completed()}
      </span>
    </div>
    <div class="mt-1 flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
      <span>{formatDate(list.created_at)}</span>
      {#if list.item_total > 0}
        <span>·</span>
        <span>{list.item_completed}/{list.item_total}</span>
        {#if progress !== null && list.status === "active"}
          <span class="text-zinc-300">({progress}%)</span>
        {/if}
      {/if}
      {#if list.total_amount != null}
        <span>·</span>
        <span>{formatCurrency(list.total_amount)}</span>
      {/if}
    </div>
  </a>
  {#if onedit}
    <button
      onclick={() => onedit(list)}
      class="border-l border-zinc-100 px-3 text-zinc-300 transition-colors hover:bg-zinc-50 hover:text-zinc-600 dark:border-zinc-800 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-400"
      aria-label={m.shopping_list_edit()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg
      >
    </button>
  {/if}
  {#if onduplicate}
    <button
      onclick={() => onduplicate(list.id)}
      class="border-l border-zinc-100 px-3 text-zinc-300 transition-colors hover:bg-zinc-50 hover:text-zinc-600 dark:border-zinc-800 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-400"
      aria-label={m.shopping_list_duplicate()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path
          d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"
        /></svg
      >
    </button>
  {/if}
  {#if ondelete}
    <button
      onclick={() => ondelete(list.id)}
      class="border-l border-zinc-100 px-3 text-zinc-300 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:border-zinc-800 dark:text-zinc-600 dark:hover:bg-rose-950 dark:hover:text-rose-400"
      aria-label={m.shopping_list_delete()}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
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
