<script lang="ts">
  import ShoppingListItemQuickAdd from "./ShoppingListItemQuickAdd.svelte";
  import ProgressBar from "$lib/components/ui/ProgressBar.svelte";
  import { motionDuration } from "$lib/motion";
  import * as m from "$lib/paraglide/messages";
  import { fetchShoppingItemCategories } from "$lib/services/shopping-item-categories";
  import {
    createShoppingListItem,
    setAllShoppingListItemsCompleted,
    updateShoppingListItem,
  } from "$lib/services/shopping-lists";
  import type { ShoppingListItem, ShoppingListWithItems } from "$lib/types";
  import { cn } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { Check, CheckCheck, ChevronDown, Square } from "lucide-svelte";
  import { onMount } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { toast } from "svelte-sonner";
  import { flip } from "svelte/animate";
  import { slide } from "svelte/transition";
  import { groupShoppingListItems } from "./group-items";

  let {
    list,
    onComplete,
  }: {
    list: ShoppingListWithItems;
    onComplete: () => void;
  } = $props();

  const queryClient = useQueryClient();
  const listKey = $derived(["shopping_list", list.id] as const);

  const itemCategoriesQuery = createQuery(() => ({
    queryKey: ["shopping_item_categories"],
    queryFn: fetchShoppingItemCategories,
    staleTime: 5 * 60_000,
  }));

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
  const itemDone = $derived(list.shopping_list_items.filter((i) => i.completed).length);

  const grouped = $derived(
    groupShoppingListItems(list.shopping_list_items, {
      knownCategories: itemCategoriesQuery.data ?? [],
    })
  );

  function toggleCategory(category: string) {
    if (collapsedCategories.has(category)) collapsedCategories.delete(category);
    else collapsedCategories.add(category);
  }

  const toggleMutation = createMutation(() => ({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      updateShoppingListItem(itemId, { completed }),
    onMutate: async ({ itemId, completed }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.map((it) =>
            it.id === itemId ? { ...it, completed } : it
          ),
        });
      }
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

  const forgotItemMutation = createMutation(() => ({
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
    onSuccess: () => toast.success(m.toast_shopping_list_item_added()),
    onError: () => toast.error(m.toast_error()),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  const hasUncheckedItems = $derived(itemDone < itemTotal);

  const bulkToggleMutation = createMutation(() => ({
    mutationFn: (completed: boolean) => setAllShoppingListItemsCompleted(list.id, completed),
    onMutate: async (completed) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.map((it) => ({ ...it, completed })),
        });
      }
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

  function toggleItem(item: ShoppingListItem) {
    toggleMutation.mutate({ itemId: item.id, completed: !item.completed });
  }
  function rowKeydown(e: KeyboardEvent, item: ShoppingListItem) {
    if (e.currentTarget !== e.target) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleItem(item);
    }
  }
</script>

<p class="text-xs text-emerald-300/80">{m.shopping_list_shopping_mode_hint()}</p>

{#if itemTotal > 0}
  <div class="mt-2 space-y-1">
    <p class="text-xs text-slate-400">
      {m.shopping_list_progress({ completed: itemDone, total: itemTotal })}
    </p>
    <ProgressBar
      value={itemDone}
      max={itemTotal}
      label={m.shopping_list_progress({ completed: itemDone, total: itemTotal })}
    />
  </div>
{/if}

{#if itemTotal > 1}
  <div class="flex items-center justify-end gap-1">
    <button
      type="button"
      onclick={() => bulkToggleMutation.mutate(hasUncheckedItems)}
      disabled={bulkToggleMutation.isPending}
      class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-slate-400 opacity-60 transition hover:bg-white/5 hover:text-slate-200 hover:opacity-100"
    >
      {#if hasUncheckedItems}
        <CheckCheck size={13} strokeWidth={1.8} aria-hidden="true" />
        {m.shopping_list_items_bulk_check_all()}
      {:else}
        <Square size={13} strokeWidth={1.8} aria-hidden="true" />
        {m.shopping_list_items_bulk_uncheck_all()}
      {/if}
    </button>
  </div>
{/if}

{#if grouped.length === 0}
  <p class="rounded-xl border border-white/5 bg-slate-900/40 px-3 py-4 text-sm text-slate-500">
    {m.shopping_list_items_search_empty()}
  </p>
{:else}
  <div class="space-y-2">
    {#each grouped as { category, items, done, completed } (category)}
      {@const collapsed = collapsedCategories.has(category)}
      <section
        class={cn(
          "space-y-2 rounded-2xl border p-2 transition-colors",
          done ? "border-white/5 bg-slate-900/25 opacity-75" : "border-white/5 bg-slate-900/45"
        )}
      >
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
            <span
              class={cn(
                "min-w-0 flex-1 truncate font-medium",
                done && "text-slate-500 line-through"
              )}
            >
              {category}
            </span>
          </button>
          <span
            class={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-xs tabular-nums",
              done
                ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                : "border-white/10 text-slate-400"
            )}
          >
            {completed}/{items.length}
          </span>
        </div>
        {#if !collapsed}
          <ul class="space-y-1" transition:slide={{ duration: motionDuration(160) }}>
            {#each items as item (item.id)}
              <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
              <li
                animate:flip={{ duration: motionDuration(240) }}
                in:slide={{ duration: motionDuration(180) }}
                out:slide={{ duration: motionDuration(160) }}
                class="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:outline-none"
                role="button"
                tabindex={0}
                aria-label={item.completed
                  ? m.shopping_list_item_uncheck()
                  : m.shopping_list_item_check()}
                onclick={() => toggleItem(item)}
                onkeydown={(e) => rowKeydown(e, item)}
              >
                <div
                  class={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                    item.completed ? "border-emerald-400/60 bg-emerald-400/20" : "border-white/15"
                  )}
                  aria-hidden="true"
                >
                  {#if item.completed}
                    <Check size={11} strokeWidth={3} class="text-emerald-300" />
                  {/if}
                </div>
                <span
                  class={cn(
                    "min-w-0 flex-1 truncate text-sm",
                    item.completed ? "text-slate-500 line-through" : "text-slate-100"
                  )}
                >
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
        {/if}
      </section>
    {/each}
  </div>
{/if}

<div class="rounded-2xl border border-white/5 bg-slate-900/45 p-3">
  <p class="mb-2 text-xs text-slate-400">{m.shopping_list_forgot_item_hint()}</p>
  <ShoppingListItemQuickAdd
    fixedCategory={null}
    compact
    placeholder={m.shopping_list_forgot_item_placeholder()}
    disabled={forgotItemMutation.isPending}
    onsubmit={({ name, quantity, unit, category }) =>
      forgotItemMutation.mutate({ name, quantity, unit, category })}
  />
</div>

<button
  type="button"
  onclick={onComplete}
  disabled={itemTotal === 0}
  title={itemTotal === 0 ? m.shopping_list_requires_items() : m.shopping_list_complete_title()}
  aria-label={m.shopping_list_complete_title()}
  class="mobile-floating-action bg-accent-gradient fixed right-4 bottom-(--mobile-action-bottom) z-40 flex h-12 w-12 items-center justify-center rounded-full text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] backdrop-blur transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
>
  <Check size={16} strokeWidth={2} aria-hidden="true" />
</button>
