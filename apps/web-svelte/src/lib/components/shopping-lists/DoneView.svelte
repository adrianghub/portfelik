<script lang="ts">
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import TransactionCategoryCombobox from "$lib/components/transactions/TransactionCategoryCombobox.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchShoppingItemCategories } from "$lib/services/shopping-item-categories";
  import { createTransaction } from "$lib/services/transactions";
  import type { ShoppingListWithItems } from "$lib/types";
  import { formatCurrency } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { Copy, Plus } from "lucide-svelte";
  import { toast } from "svelte-sonner";
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

  const queryClient = useQueryClient();

  const itemCategoriesQuery = createQuery(() => ({
    queryKey: ["shopping_item_categories"],
    queryFn: fetchShoppingItemCategories,
    staleTime: 5 * 60_000,
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  const expenseCategories = $derived(
    categoriesQuery.data?.filter((c) => c.type === "expense") ?? []
  );

  let showAddTx = $state(false);
  let addTxCategoryId = $state("");

  const addTxMutation = createMutation(() => ({
    mutationFn: () =>
      createTransaction({
        amount: list.total_amount!,
        type: "expense",
        description: list.name,
        date: new Date().toISOString().slice(0, 10),
        category_id: addTxCategoryId,
        shopping_list_id: list.id,
        group_id: list.group_id,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping-list", list.id] });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_shopping_list_tx_added());
      showAddTx = false;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function openAddTx() {
    addTxCategoryId = list.category_id ?? expenseCategories[0]?.id ?? "";
    showAddTx = true;
  }

  function submitAddTx(e: Event) {
    e.preventDefault();
    if (!addTxCategoryId) return;
    addTxMutation.mutate();
  }

  const grouped = $derived(
    groupShoppingListItems(list.shopping_list_items, {
      knownCategories: itemCategoriesQuery.data ?? [],
      sortItems: false,
    })
  );

  const canAddTx = $derived(
    list.total_amount != null && list.total_amount > 0 && !list.linked_transaction_id
  );
</script>

{#if list.total_amount != null}
  {#if list.linked_transaction_id}
    <a
      href={`/transactions?txId=${list.linked_transaction_id}`}
      class="border-accent/20 bg-accent/5 text-accent hover:bg-accent/10 focus-visible:ring-accent/40 block rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <p class="text-accent/80 text-xs tracking-wide uppercase">
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
      {#if canAddTx}
        <button
          type="button"
          onclick={openAddTx}
          class="border-accent/25 bg-accent/10 text-accent hover:bg-accent/20 mt-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
        >
          <Plus size={13} strokeWidth={2.2} aria-hidden="true" />
          {m.shopping_list_add_tx_cta()}
        </button>
      {/if}
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
              <span class="min-w-0 flex-1 truncate text-sm text-slate-400 line-through">
                {item.name}
              </span>
              {#if item.quantity != null}
                <span class="shrink-0 text-xs text-slate-400"
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
  class="mobile-floating-action border-accent/25 bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent focus-visible:ring-accent/40 fixed right-4 bottom-(--mobile-action-bottom) z-40 flex h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium backdrop-blur transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
>
  <Copy size={16} strokeWidth={2} aria-hidden="true" />
  <span>{m.shopping_list_archived_duplicate()}</span>
</button>

<Dialog open={showAddTx} onclose={() => (showAddTx = false)} title={m.shopping_list_add_tx_title()}>
  <form onsubmit={submitAddTx} class="space-y-4">
    <p class="text-sm text-slate-300">
      {formatCurrency(list.total_amount ?? 0, "PLN")} · {list.name}
    </p>
    <div class="space-y-1">
      <label class="text-eyebrow block text-slate-400" for="done-tx-cat">
        {m.transaction_form_category()}
      </label>
      <TransactionCategoryCombobox
        id="done-tx-cat"
        bind:categoryId={addTxCategoryId}
        categories={expenseCategories}
        required
      />
    </div>
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showAddTx = false)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={addTxMutation.isPending || !addTxCategoryId}
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
      >
        {addTxMutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>
