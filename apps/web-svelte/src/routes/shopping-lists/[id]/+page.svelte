<script lang="ts">
  import { page } from "$app/stores";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";
  import {
    fetchShoppingListById,
    updateShoppingListItem,
    createShoppingListItem,
    deleteShoppingListItem,
    completeShoppingList,
  } from "$lib/services/shopping-lists";
  import { fetchCategories } from "$lib/services/categories";
  import { formatCurrency, formatDate, cn } from "$lib/utils";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import ShoppingListSuggestions from "$lib/components/shopping-lists/ShoppingListSuggestions.svelte";
  import * as m from "$lib/paraglide/messages";

  const queryClient = useQueryClient();
  const id = $derived($page.params.id ?? "");

  const query = createQuery(() => ({
    queryKey: ["shopping_list", id],
    queryFn: () => fetchShoppingListById(id),
    enabled: !!id,
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  const expenseCategories = $derived(
    categoriesQuery.data?.filter((c) => c.type === "expense") ?? []
  );

  // Toggle item completed
  const toggleMutation = createMutation(() => ({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      updateShoppingListItem(itemId, { completed }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_list", id] });
    },
  }));

  // Add item
  let showAddItem = $state(false);
  let itemName = $state("");
  let itemQty = $state("");
  let itemUnit = $state("");
  let suggestionRef = $state<{ handleKeydown: (e: KeyboardEvent) => void } | null>(null);

  const addItemMutation = createMutation(() => ({
    mutationFn: () =>
      createShoppingListItem({
        shopping_list_id: id,
        name: itemName,
        quantity: itemQty ? parseFloat(itemQty) : null,
        unit: itemUnit || null,
        position: (query.data?.shopping_list_items.length ?? 0) + 1,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_list", id] });
      toast.success(m.toast_shopping_list_item_added());
      itemName = "";
      itemQty = "";
      itemUnit = "";
      showAddItem = false;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // Delete item
  const deleteItemMutation = createMutation(() => ({
    mutationFn: (itemId: string) => deleteShoppingListItem(itemId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_list", id] });
      toast.success(m.toast_shopping_list_item_deleted());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // Complete list — pre-fill category if list has one
  let showComplete = $state(false);
  let completeAmount = $state("");
  let completeCategoryId = $state("");

  $effect(() => {
    if (showComplete && query.data?.category_id) {
      completeCategoryId = query.data.category_id;
    }
  });

  const completeMutation = createMutation(() => ({
    mutationFn: () => completeShoppingList(id, parseFloat(completeAmount), completeCategoryId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_list", id] });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_shopping_list_completed());
      showComplete = false;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function submitAddItem(e: Event) {
    e.preventDefault();
    addItemMutation.mutate();
  }

  function submitComplete(e: Event) {
    e.preventDefault();
    completeMutation.mutate();
  }

  const isActive = $derived(query.data?.status === "active");
</script>

<div class="container mx-auto max-w-2xl space-y-4 px-4 py-6">
  <a
    href="/shopping-lists"
    class="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
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
      stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
    >
    {m.common_back()}
  </a>

  {#if query.isLoading}
    <div class="space-y-3">
      <div class="h-8 w-48 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"></div>
      <div class="space-y-2">
        {#each [0, 1, 2, 3, 4] as _, i (i)}
          <div class="h-12 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800"></div>
        {/each}
      </div>
    </div>
  {:else if query.isError}
    <p class="text-sm text-rose-600">{m.common_error_title()}</p>
  {:else if query.data}
    {@const list = query.data}
    <div class="flex items-start justify-between gap-2">
      <h1 class="text-xl font-semibold text-zinc-900 dark:text-white">{list.name}</h1>
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

    <div class="text-xs text-zinc-400 dark:text-zinc-500">{formatDate(list.created_at)}</div>

    {#if list.shopping_list_items.length === 0}
      <p class="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">{m.shopping_list_items_empty()}</p>
    {:else}
      <ul class="space-y-1">
        {#each list.shopping_list_items as item (item.id)}
          <li class="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
            {#if isActive}
              <button
                onclick={() =>
                  toggleMutation.mutate({ itemId: item.id, completed: !item.completed })}
                disabled={toggleMutation.isPending}
                class={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                  item.completed
                    ? "border-zinc-800 bg-zinc-800 dark:border-zinc-200 dark:bg-zinc-200"
                    : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-600 dark:hover:border-zinc-400"
                )}
                aria-label={item.completed
                  ? m.shopping_list_item_uncheck()
                  : m.shopping_list_item_check()}
              >
                {#if item.completed}
                  <svg
                    class="h-3 w-3 text-white dark:text-zinc-900"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
                  >
                {/if}
              </button>
            {:else}
              <div
                class={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  item.completed ? "border-zinc-800 bg-zinc-800 dark:border-zinc-200 dark:bg-zinc-200" : "border-zinc-300 dark:border-zinc-600"
                )}
              >
                {#if item.completed}
                  <svg
                    class="h-3 w-3 text-white dark:text-zinc-900"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"><polyline points="20 6 9 17 4 12" /></svg
                  >
                {/if}
              </div>
            {/if}
            <span
              class={cn(
                "flex-1 text-sm",
                item.completed ? "text-zinc-400 line-through dark:text-zinc-500" : "text-zinc-900 dark:text-white"
              )}
            >
              {item.name}
            </span>
            {#if item.quantity != null}
              <span class="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                {item.quantity}{item.unit ? ` ${item.unit}` : ""}
              </span>
            {/if}
            {#if isActive}
              <button
                onclick={() => deleteItemMutation.mutate(item.id)}
                disabled={deleteItemMutation.isPending}
                class="shrink-0 p-1 text-zinc-300 transition-colors hover:text-rose-500 dark:text-zinc-600 dark:hover:text-rose-400"
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
                  stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg
                >
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if isActive}
      <div class="flex gap-2">
        <button
          onclick={() => {
            showAddItem = true;
            itemName = "";
            itemQty = "";
            itemUnit = "";
          }}
          class="flex-1 rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
        >
          + {m.shopping_list_item_add()}
        </button>
        <button
          onclick={() => {
            showComplete = true;
            completeAmount = "";
            completeCategoryId = "";
          }}
          class="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
        >
          {m.shopping_list_complete_title()}
        </button>
      </div>
    {/if}

    {#if list.total_amount != null}
      <div
        class="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <span class="text-sm font-medium text-zinc-700 dark:text-zinc-200">{m.shopping_list_total()}</span>
        <span class="text-sm font-semibold text-zinc-900 dark:text-white">{formatCurrency(list.total_amount)}</span>
      </div>
    {/if}
  {/if}
</div>

<!-- Add item dialog -->
<Dialog open={showAddItem} onclose={() => (showAddItem = false)} title={m.shopping_list_item_add()}>
  <form onsubmit={submitAddItem} class="space-y-4">
    <div class="relative space-y-1">
      <label class="text-xs font-medium text-zinc-600 dark:text-zinc-300" for="item-name"
        >{m.shopping_list_item_name()}</label
      >
      <input
        id="item-name"
        type="text"
        required
        bind:value={itemName}
        autocomplete="off"
        onkeydown={(e) => suggestionRef?.handleKeydown(e)}
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:ring-white/10"
      />
      <ShoppingListSuggestions
        bind:this={suggestionRef}
        query={itemName}
        onselect={(name, qty, unit) => {
          itemName = name;
          itemQty = qty != null ? String(qty) : "";
          itemUnit = unit ?? "";
        }}
      />
    </div>
    <div class="flex gap-3">
      <div class="flex-1 space-y-1">
        <label class="text-xs font-medium text-zinc-600 dark:text-zinc-300" for="item-qty"
          >{m.shopping_list_item_quantity()}</label
        >
        <input
          id="item-qty"
          type="number"
          min="0"
          step="any"
          bind:value={itemQty}
          class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:ring-white/10"
        />
      </div>
      <div class="flex-1 space-y-1">
        <label class="text-xs font-medium text-zinc-600 dark:text-zinc-300" for="item-unit"
          >{m.shopping_list_item_unit()}</label
        >
        <input
          id="item-unit"
          type="text"
          bind:value={itemUnit}
          placeholder={m.shopping_list_item_unit_placeholder()}
          class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:ring-white/10"
        />
      </div>
    </div>
    {#if addItemMutation.isError}
      <p class="text-sm text-rose-600">{m.common_error_title()}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showAddItem = false)}
        class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={addItemMutation.isPending}
        class="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {addItemMutation.isPending ? m.common_saving() : m.common_add()}
      </button>
    </div>
  </form>
</Dialog>

<!-- Complete list dialog -->
<Dialog
  open={showComplete}
  onclose={() => (showComplete = false)}
  title={m.shopping_list_complete_title()}
>
  <form onsubmit={submitComplete} class="space-y-4">
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600 dark:text-zinc-300" for="comp-amount"
        >{m.shopping_list_complete_amount()}</label
      >
      <input
        id="comp-amount"
        type="number"
        min="0.01"
        step="0.01"
        required
        bind:value={completeAmount}
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:ring-white/10"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600 dark:text-zinc-300" for="comp-cat"
        >{m.shopping_list_complete_category()}</label
      >
      <select
        id="comp-cat"
        required
        bind:value={completeCategoryId}
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:ring-white/10"
      >
        <option value="">{m.transaction_form_select_category()}</option>
        {#each expenseCategories as cat (cat.id)}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>
    {#if completeMutation.isError}
      <p class="text-sm text-rose-600">{m.common_error_title()}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showComplete = false)}
        class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={completeMutation.isPending}
        class="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
      >
        {completeMutation.isPending ? m.common_saving() : m.shopping_list_complete_submit()}
      </button>
    </div>
  </form>
</Dialog>
