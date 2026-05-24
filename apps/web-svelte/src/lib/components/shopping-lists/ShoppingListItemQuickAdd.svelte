<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import {
    inferShoppingListCategory,
    normalizeShoppingListCategory,
  } from "$lib/shopping-list-categories";
  import { DEFAULT_SHOPPING_LIST_UNIT, normalizeShoppingListUnit } from "$lib/shopping-list-units";
  import { ChevronDown, Plus } from "lucide-svelte";
  import { slide } from "svelte/transition";
  import ShoppingListCategoryCombobox from "./ShoppingListCategoryCombobox.svelte";
  import ShoppingListSuggestions from "./ShoppingListSuggestions.svelte";
  import ShoppingListUnitCombobox from "./ShoppingListUnitCombobox.svelte";

  interface Props {
    onsubmit: (payload: {
      name: string;
      quantity: number | null;
      unit: string | null;
      category: string | null;
    }) => void;
    disabled?: boolean;
    fixedCategory?: string | null;
  }
  let { onsubmit, disabled = false, fixedCategory = undefined }: Props = $props();

  let name = $state("");
  let quantity = $state<number | null>(null);
  let unit = $state(DEFAULT_SHOPPING_LIST_UNIT);
  let category = $state("");
  let detailsOpen = $state(false);
  let inputFocused = $state(false);
  let nameInputRef = $state<HTMLInputElement | null>(null);

  let suggestionRef = $state<{
    handleKeydown: (e: KeyboardEvent) => void;
    activeId: () => string | null;
  } | null>(null);

  const inferredCategory = $derived(inferShoppingListCategory(name));

  function selectSuggestion(n: string, q: number | null, u: string | null, c: string | null) {
    name = n;
    quantity = q;
    unit = u ?? DEFAULT_SHOPPING_LIST_UNIT;
    category =
      fixedCategory !== undefined
        ? (fixedCategory ?? "")
        : (c ?? inferShoppingListCategory(n) ?? "");
    if (q != null || u || category) detailsOpen = true;
    inputFocused = false;
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onsubmit({
      name: trimmed,
      quantity: detailsOpen ? quantity : null,
      unit: detailsOpen ? normalizeShoppingListUnit(unit) : null,
      category:
        fixedCategory !== undefined
          ? normalizeShoppingListCategory(fixedCategory)
          : normalizeShoppingListCategory(detailsOpen ? category : inferredCategory),
    });
    name = "";
    quantity = null;
    unit = DEFAULT_SHOPPING_LIST_UNIT;
    category = "";
    detailsOpen = false;
    inputFocused = false;
  }

  function toggleDetails() {
    detailsOpen = !detailsOpen;
    if (!detailsOpen) return;
    if (!unit.trim()) unit = DEFAULT_SHOPPING_LIST_UNIT;
    if (fixedCategory !== undefined) category = fixedCategory ?? "";
    else if (!category.trim() && inferredCategory) category = inferredCategory;
  }
</script>

<form onsubmit={submit} class="relative space-y-2">
  <div class="flex items-stretch gap-2">
    <div class="relative flex-1">
      <input
        bind:this={nameInputRef}
        type="text"
        bind:value={name}
        onfocus={() => (inputFocused = true)}
        onblur={() => setTimeout(() => (inputFocused = false), 120)}
        onkeydown={(e) => suggestionRef?.handleKeydown(e)}
        placeholder={m.shopping_list_item_name()}
        role="combobox"
        aria-controls="shopping-list-item-suggestions"
        aria-expanded={inputFocused && name.trim().length > 0}
        aria-autocomplete="list"
        class="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/40 focus:outline-none"
      />
      {#if inputFocused && name.trim().length > 0}
        <ShoppingListSuggestions
          bind:this={suggestionRef}
          query={name}
          anchor={nameInputRef}
          onselect={selectSuggestion}
          onescape={() => (inputFocused = false)}
        />
      {/if}
    </div>
    <button
      type="button"
      onclick={toggleDetails}
      aria-expanded={detailsOpen}
      aria-controls="shopping-list-item-details"
      class="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-slate-900/60 px-3 text-xs text-slate-300 transition-colors hover:bg-white/5"
    >
      <ChevronDown size={14} class={detailsOpen ? "rotate-180" : ""} />
      <span class="hidden sm:inline">{m.shopping_list_item_details_toggle()}</span>
    </button>
    <button
      type="submit"
      disabled={disabled || !name.trim()}
      class="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
    >
      <Plus size={14} />
      {m.shopping_list_item_add()}
    </button>
  </div>

  {#if detailsOpen}
    <div id="shopping-list-item-details" transition:slide={{ duration: 150 }} class="space-y-2">
      <div class="grid grid-cols-2 gap-2">
        <input
          type="number"
          bind:value={quantity}
          step="0.01"
          min="0"
          inputmode="decimal"
          placeholder={m.shopping_list_item_quantity()}
          class="w-full min-w-0 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/40 focus:outline-none"
        />
        <ShoppingListUnitCombobox bind:value={unit} showLabel={false} />
      </div>
      {#if fixedCategory === undefined}
        <ShoppingListCategoryCombobox bind:value={category} />
      {/if}
    </div>
  {/if}
</form>
