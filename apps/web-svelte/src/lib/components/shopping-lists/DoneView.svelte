<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { fetchShoppingItemCategories } from "$lib/services/shopping-item-categories";
  import type { ShoppingListWithItems } from "$lib/types";
  import { formatCurrency } from "$lib/utils";
  import { createQuery } from "@tanstack/svelte-query";
  import { Copy } from "lucide-svelte";
  import { groupShoppingListItems } from "./group-items";

  let {
    list,
    onDuplicate,
    duplicating = false,
  }: {
    list: ShoppingListWithItems;
    onDuplicate: () => void;
    duplicating?: boolean;
  } = $props();

  const itemCategoriesQuery = createQuery(() => ({
    queryKey: ["shopping_item_categories"],
    queryFn: fetchShoppingItemCategories,
    staleTime: 5 * 60_000,
  }));

  const grouped = $derived(
    groupShoppingListItems(list.shopping_list_items, {
      knownCategories: itemCategoriesQuery.data ?? [],
      sortItems: false,
    })
  );
</script>

{#if list.total_amount != null}
  {#if list.linked_transaction_id}
    <a
      href={`/transactions?txId=${list.linked_transaction_id}`}
      class="block rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/10 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:outline-none"
    >
      <p class="text-xs tracking-wide text-emerald-300/80 uppercase">
        {m.shopping_list_completed_tx_created()}
      </p>
      <p class="mt-0.5 tabular-nums">{formatCurrency(list.total_amount, "PLN")}</p>
    </a>
  {:else}
    <div class="rounded-lg border border-white/10 bg-slate-900/50 px-3 py-2 text-sm text-slate-200">
      <p class="text-xs tracking-wide text-slate-400 uppercase">
        {m.shopping_list_completed_total()}
      </p>
      <p class="mt-0.5 tabular-nums">{formatCurrency(list.total_amount, "PLN")}</p>
    </div>
  {/if}
{/if}

{#if grouped.length > 0}
  <div class="space-y-2 opacity-80">
    {#each grouped as { category, items, completed } (category)}
      <section class="space-y-2 rounded-2xl border border-white/5 bg-slate-900/30 p-3">
        <div class="flex items-center gap-2 text-slate-300">
          <span class="min-w-0 flex-1 truncate font-medium">{category}</span>
          <span
            class="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400 tabular-nums"
          >
            {completed}/{items.length}
          </span>
        </div>
        <ul class="space-y-1">
          {#each items as item (item.id)}
            <li
              class="flex min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2"
            >
              <span class="min-w-0 flex-1 truncate text-sm text-slate-500 line-through">
                {item.name}
              </span>
              {#if item.quantity != null}
                <span class="shrink-0 text-xs text-slate-500"
                  >{item.quantity}{item.unit ? ` ${item.unit}` : ""}</span
                >
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
{/if}

<button
  type="button"
  onclick={onDuplicate}
  disabled={duplicating}
  aria-label={m.shopping_list_archived_duplicate()}
  class="fixed right-4 z-40 flex h-11 items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-200 backdrop-blur transition-colors hover:bg-emerald-500/20 hover:text-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
  style="bottom: calc(5.75rem + env(safe-area-inset-bottom));"
>
  <Copy size={16} strokeWidth={2} aria-hidden="true" />
  <span>{m.shopping_list_archived_duplicate()}</span>
</button>
