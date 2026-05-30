<script lang="ts">
  import ShoppingListCategoryCombobox from "./ShoppingListCategoryCombobox.svelte";
  import ShoppingListItemEditSheet from "./ShoppingListItemEditSheet.svelte";
  import ShoppingListItemQuickAdd from "./ShoppingListItemQuickAdd.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { motionDuration } from "$lib/motion";
  import * as m from "$lib/paraglide/messages";
  import {
    normalizeShoppingListCategory,
    SHOPPING_LIST_CATEGORY_FALLBACK,
  } from "$lib/shopping-list-categories";
  import {
    createShoppingItemCategory,
    fetchShoppingItemCategories,
  } from "$lib/services/shopping-item-categories";
  import {
    createShoppingListItem,
    deleteAllShoppingListItems,
    deleteShoppingListItem,
    updateShoppingListItem,
    updateShoppingListItemsCategory,
  } from "$lib/services/shopping-lists";
  import type { ShoppingListItem, ShoppingListWithItems } from "$lib/types";
  import { cn } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { ChevronDown, ListPlus, Pencil, Play, Plus, Trash2 } from "lucide-svelte";
  import { onMount, tick } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { toast } from "svelte-sonner";
  import { flip } from "svelte/animate";
  import { slide } from "svelte/transition";
  import { groupShoppingListItems, itemCategoryName } from "./group-items";

  let {
    list,
    onStartShopping,
    startingShopping = false,
  }: {
    list: ShoppingListWithItems;
    onStartShopping: () => void;
    startingShopping?: boolean;
  } = $props();

  const queryClient = useQueryClient();
  const listKey = $derived(["shopping_list", list.id] as const);

  const itemCategoriesQuery = createQuery(() => ({
    queryKey: ["shopping_item_categories"],
    queryFn: fetchShoppingItemCategories,
    staleTime: 5 * 60_000,
  }));

  let itemSearch = $state("");
  let editTarget = $state<ShoppingListItem | null>(null);
  let bulkDeleteConfirm = $state(false);
  let newSectionCategory = $state("");
  let removeCategoryTarget = $state<{ category: string; items: ShoppingListItem[] } | null>(null);
  const draftCategories = new SvelteSet<string>();

  const collapseStorageKey = $derived(`shopping_list_collapsed_categories:${list.id}`);
  const collapsedCategories = new SvelteSet<string>();
  let collapseStateLoaded = $state(false);

  onMount(() => {
    try {
      const raw = localStorage.getItem(collapseStorageKey);
      collapsedCategories.clear();
      for (const category of raw ? (JSON.parse(raw) as string[]) : []) {
        collapsedCategories.add(category);
      }
    } catch {
      collapsedCategories.clear();
    }
    collapseStateLoaded = true;
  });

  $effect(() => {
    if (!collapseStateLoaded || typeof localStorage === "undefined") return;
    localStorage.setItem(collapseStorageKey, JSON.stringify(Array.from(collapsedCategories)));
  });

  const itemTotal = $derived(list.shopping_list_items.length);
  const grouped = $derived(
    groupShoppingListItems(list.shopping_list_items, {
      search: itemSearch,
      draftCategories,
      knownCategories: itemCategoriesQuery.data ?? [],
    })
  );

  function toggleCategory(category: string) {
    if (collapsedCategories.has(category)) collapsedCategories.delete(category);
    else collapsedCategories.add(category);
  }

  function allItemsInCategory(category: string): ShoppingListItem[] {
    return list.shopping_list_items.filter((item) => itemCategoryName(item) === category);
  }

  async function addCategorySection(e?: SubmitEvent) {
    e?.preventDefault();
    const category =
      normalizeShoppingListCategory(newSectionCategory) ?? SHOPPING_LIST_CATEGORY_FALLBACK;
    draftCategories.add(category);
    collapsedCategories.delete(category);
    newSectionCategory = "";
    await tick();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();

    const exists = (itemCategoriesQuery.data ?? []).some((c) => c.name === category);
    if (category !== SHOPPING_LIST_CATEGORY_FALLBACK && !exists) {
      try {
        await createShoppingItemCategory({
          name: category,
          position: itemCategoriesQuery.data?.length ?? 0,
        });
        await queryClient.invalidateQueries({ queryKey: ["shopping_item_categories"] });
      } catch {
        // Section still works locally even if persisting fails.
      }
    }
  }

  function removeDraftCategory(category: string) {
    draftCategories.delete(category);
    collapsedCategories.delete(category);
  }

  function requestRemoveCategory(category: string) {
    const items = allItemsInCategory(category);
    if (items.length === 0) {
      removeDraftCategory(category);
      return;
    }
    removeCategoryTarget = { category, items };
  }

  // Mutations
  const addItemMutation = createMutation(() => ({
    mutationFn: (input: {
      name: string;
      quantity: number | null;
      unit: string | null;
      category: string | null;
    }) =>
      createShoppingListItem({
        shopping_list_id: list.id,
        position: list.shopping_list_items.length + 1,
        ...input,
      }),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      const tempId = "__optimistic_" + crypto.randomUUID();
      const tempItem: ShoppingListItem = {
        id: tempId,
        shopping_list_id: list.id,
        name: input.name,
        quantity: input.quantity,
        unit: input.unit,
        category: input.category,
        completed: false,
        position: (previous?.shopping_list_items.length ?? 0) + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: [...previous.shopping_list_items, tempItem],
        });
      }
      return { previous, tempId };
    },
    onSuccess: (real, _vars, ctx) => {
      const cur = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (cur && ctx?.tempId) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...cur,
          shopping_list_items: cur.shopping_list_items.map((i) => (i.id === ctx.tempId ? real : i)),
        });
      }
      toast.success(m.toast_shopping_list_item_added());
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  const renameMutation = createMutation(() => ({
    mutationFn: (args: {
      id: string;
      updates: {
        name: string;
        quantity: number | null;
        unit: string | null;
        category: string | null;
      };
    }) => updateShoppingListItem(args.id, args.updates),
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.map((it) =>
            it.id === args.id ? { ...it, ...args.updates } : it
          ),
        });
      }
      editTarget = null;
      return { previous };
    },
    onSuccess: () => toast.success(m.toast_shopping_list_item_renamed()),
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  const deleteItemMutation = createMutation(() => ({
    mutationFn: (item: ShoppingListItem) => deleteShoppingListItem(item.id),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.filter((it) => it.id !== item.id),
        });
      }
      return { previous };
    },
    onSuccess: (_d, item) => {
      toast.success(m.toast_shopping_list_item_deleted(), {
        action: {
          label: m.common_undo(),
          onClick: () => restoreDeletedItem(item),
        },
        duration: 6000,
      });
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  async function restoreDeletedItem(item: ShoppingListItem) {
    try {
      await createShoppingListItem({
        shopping_list_id: item.shopping_list_id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        position: item.position,
      });
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    } catch {
      toast.error(m.toast_error());
    }
  }

  const bulkDeleteMutation = createMutation(() => ({
    mutationFn: () => deleteAllShoppingListItems(list.id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: [],
        });
      }
      bulkDeleteConfirm = false;
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  const removeCategoryMutation = createMutation(() => ({
    mutationFn: ({ itemIds }: { category: string; itemIds: string[] }) =>
      updateShoppingListItemsCategory(itemIds, null),
    onMutate: async ({ category, itemIds }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.map((item) =>
            itemIds.includes(item.id) ? { ...item, category: null } : item
          ),
        });
      }
      removeDraftCategory(category);
      removeCategoryTarget = null;
      return { previous };
    },
    onSuccess: () => toast.success(m.shopping_list_category_removed()),
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  function saveEdit(updates: {
    name: string;
    quantity: number | null;
    unit: string | null;
    category: string | null;
  }) {
    if (!editTarget) return;
    renameMutation.mutate({ id: editTarget.id, updates });
  }

  function confirmRemoveCategory() {
    if (!removeCategoryTarget) return;
    removeCategoryMutation.mutate({
      category: removeCategoryTarget.category,
      itemIds: removeCategoryTarget.items.map((item) => item.id),
    });
  }

  function categoryToStoredValue(category: string): string | null {
    return normalizeShoppingListCategory(category);
  }
</script>

<p class="text-xs text-emerald-300/80">{m.shopping_list_planning_mode_hint()}</p>

<form
  onsubmit={addCategorySection}
  class="space-y-2 rounded-2xl border border-white/5 bg-slate-900/50 p-3"
>
  <p class="text-xs text-slate-400">{m.shopping_list_category_section_hint()}</p>
  <div class="flex items-start gap-2">
    <ShoppingListCategoryCombobox
      bind:value={newSectionCategory}
      showLabel={false}
      id="new-shopping-list-section"
      placeholder={m.shopping_list_category_section_placeholder()}
    />
    <button
      type="submit"
      disabled={!newSectionCategory.trim()}
      class="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
    >
      <Plus size={14} aria-hidden="true" />
      <span class="hidden sm:inline">{m.shopping_list_category_section_submit()}</span>
    </button>
  </div>
</form>

{#if itemTotal === 0 && grouped.length === 0 && draftCategories.size === 0}
  <EmptyState title={m.shopping_list_items_empty()} body={m.shopping_list_items_empty_hint()}>
    {#snippet icon()}
      <ListPlus size={28} strokeWidth={1.4} />
    {/snippet}
  </EmptyState>
{/if}

{#if itemTotal > 0 || grouped.length > 0}
  {#if itemTotal > 5}
    <input
      type="search"
      bind:value={itemSearch}
      placeholder={m.shopping_list_items_search_placeholder()}
      class="w-full rounded-lg border border-white/5 bg-slate-900/40 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/30 focus:ring-1 focus:ring-emerald-400/20 focus:outline-none"
    />
  {/if}

  {#if itemTotal > 1}
    <div class="flex items-center justify-end gap-1 text-slate-500">
      <button
        type="button"
        onclick={() => (bulkDeleteConfirm = true)}
        class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs opacity-60 transition hover:bg-rose-500/10 hover:text-rose-300 hover:opacity-100"
      >
        <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
        {m.shopping_list_items_bulk_delete_all()}
      </button>
    </div>
  {/if}

  {#if grouped.length === 0}
    <p class="rounded-xl border border-white/5 bg-slate-900/40 px-3 py-4 text-sm text-slate-500">
      {m.shopping_list_items_search_empty()}
    </p>
  {:else}
    <div class="space-y-2">
      {#each grouped as { category, items } (category)}
        {@const collapsed = collapsedCategories.has(category)}
        <section class="space-y-2 rounded-2xl border border-white/5 bg-slate-900/45 p-2">
          <div class="flex items-center gap-1 rounded-xl text-slate-200">
            <button
              type="button"
              onclick={() => toggleCategory(category)}
              class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
              aria-expanded={!collapsed}
              aria-label={m.shopping_list_category_toggle({ category })}
            >
              <ChevronDown
                size={15}
                strokeWidth={1.8}
                class={cn("shrink-0 transition-transform", collapsed && "-rotate-90")}
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1 truncate font-medium">{category}</span>
            </button>
            <span
              class="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-xs text-slate-400 tabular-nums"
            >
              {items.length}
            </span>
            {#if category !== SHOPPING_LIST_CATEGORY_FALLBACK || items.length === 0}
              <button
                type="button"
                onclick={() => requestRemoveCategory(category)}
                disabled={removeCategoryMutation.isPending}
                class="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                aria-label={m.shopping_list_category_remove({ category })}
                title={m.shopping_list_category_remove({ category })}
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            {/if}
          </div>
          {#if !collapsed}
            <ul class="space-y-1" transition:slide={{ duration: motionDuration(160) }}>
              {#each items as item (item.id)}
                <li
                  animate:flip={{ duration: motionDuration(240) }}
                  in:slide={{ duration: motionDuration(180) }}
                  out:slide={{ duration: motionDuration(160) }}
                  class="flex min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2"
                >
                  <span class="min-w-0 flex-1 truncate text-sm text-slate-100">{item.name}</span>
                  {#if item.quantity != null}
                    <span class="shrink-0 text-xs text-slate-500"
                      >{item.quantity}{item.unit ? ` ${item.unit}` : ""}</span
                    >
                  {/if}
                  <button
                    type="button"
                    onclick={() => (editTarget = item)}
                    class="shrink-0 rounded-md p-1 text-slate-500 opacity-60 transition hover:bg-white/5 hover:text-slate-200 hover:opacity-100"
                    aria-label={m.shopping_list_item_edit()}
                  >
                    <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onclick={() => deleteItemMutation.mutate(item)}
                    class="shrink-0 rounded-md p-1 text-slate-500 opacity-60 transition hover:bg-rose-500/10 hover:text-rose-300 hover:opacity-100"
                    aria-label={m.common_delete()}
                  >
                    <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
          {#if !collapsed}
            <div class="pt-1">
              <ShoppingListItemQuickAdd
                fixedCategory={categoryToStoredValue(category)}
                disabled={addItemMutation.isPending}
                onsubmit={({ name, quantity, unit, category: itemCategory }) =>
                  addItemMutation.mutate({
                    name,
                    quantity,
                    unit,
                    category: itemCategory,
                  })}
              />
            </div>
          {/if}
        </section>
      {/each}
    </div>
  {/if}
{/if}

<button
  type="button"
  onclick={onStartShopping}
  disabled={itemTotal === 0 || startingShopping}
  title={itemTotal === 0 ? m.shopping_list_requires_items() : m.shopping_list_start_shopping()}
  aria-label={m.shopping_list_start_shopping()}
  class="fixed right-4 z-40 flex h-11 items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-4 text-sm font-medium text-emerald-200 backdrop-blur transition-colors hover:bg-emerald-500/20 hover:text-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
  style="bottom: calc(5.75rem + env(safe-area-inset-bottom));"
>
  <Play size={16} strokeWidth={2} aria-hidden="true" />
  <span>{m.shopping_list_start_shopping()}</span>
</button>

<ConfirmDialog
  open={bulkDeleteConfirm}
  message={m.shopping_list_items_bulk_delete_confirm()}
  onconfirm={() => bulkDeleteMutation.mutate()}
  onclose={() => (bulkDeleteConfirm = false)}
/>

<ConfirmDialog
  open={!!removeCategoryTarget}
  message={m.shopping_list_category_remove_confirm({
    category: removeCategoryTarget?.category ?? "",
    count: removeCategoryTarget?.items.length ?? 0,
  })}
  onconfirm={confirmRemoveCategory}
  onclose={() => (removeCategoryTarget = null)}
  pending={removeCategoryMutation.isPending}
/>

{#if editTarget}
  <ShoppingListItemEditSheet
    item={editTarget}
    onclose={() => (editTarget = null)}
    onsave={saveEdit}
    saving={renameMutation.isPending}
  />
{/if}
