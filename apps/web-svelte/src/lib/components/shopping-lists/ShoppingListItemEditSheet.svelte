<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { normalizeShoppingListCategory } from "$lib/shopping-list-categories";
  import { DEFAULT_SHOPPING_LIST_UNIT, normalizeShoppingListUnit } from "$lib/shopping-list-units";
  import type { ShoppingListItem } from "$lib/types";
  import { X } from "lucide-svelte";
  import { untrack } from "svelte";
  import ShoppingListCategoryCombobox from "./ShoppingListCategoryCombobox.svelte";
  import ShoppingListUnitCombobox from "./ShoppingListUnitCombobox.svelte";

  interface Props {
    item: ShoppingListItem;
    onclose: () => void;
    onsave: (updates: {
      name: string;
      quantity: number | null;
      unit: string | null;
      category: string | null;
    }) => void;
    saving?: boolean;
  }
  let { item, onclose, onsave, saving = false }: Props = $props();

  let name = $state(untrack(() => item.name));
  let quantity = $state<number | null>(untrack(() => item.quantity ?? null));
  let unit = $state(untrack(() => item.unit ?? DEFAULT_SHOPPING_LIST_UNIT));
  let category = $state(untrack(() => item.category ?? ""));

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onsave({
      name: trimmed,
      quantity,
      unit: normalizeShoppingListUnit(unit),
      category: normalizeShoppingListCategory(category),
    });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div
  class="fixed inset-0 z-60 bg-slate-950/70 backdrop-blur-sm"
  role="presentation"
  onclick={onclose}
  aria-hidden="true"
></div>

<aside
  class="fixed inset-x-0 bottom-0 z-70 flex max-h-[90vh] flex-col rounded-t-2xl border-t border-white/5 bg-slate-950/95 shadow-[0_0_60px_rgba(16,185,129,0.08)] backdrop-blur sm:inset-y-0 sm:right-0 sm:left-auto sm:max-w-sm sm:rounded-none sm:border-l"
  aria-label={m.shopping_list_item_rename_title()}
>
  <div class="flex items-center justify-between border-b border-white/5 px-5 py-4">
    <h2 class="text-base font-semibold text-slate-100">
      {m.shopping_list_item_rename_title()}
    </h2>
    <button
      type="button"
      onclick={onclose}
      class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
      aria-label={m.common_close()}
    >
      <X size={18} />
    </button>
  </div>

  <form onsubmit={submit} class="space-y-3 px-5 py-4">
    <input
      type="text"
      bind:value={name}
      placeholder={m.shopping_list_item_name()}
      class="w-full rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/40 focus:outline-none"
    />
    <div class="grid grid-cols-2 gap-2">
      <input
        id="qty"
        type="number"
        bind:value={quantity}
        step="0.5"
        min="0"
        inputmode="decimal"
        placeholder={m.shopping_list_item_quantity()}
        class="w-full min-w-0 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/40 focus:outline-none"
      />
      <ShoppingListUnitCombobox bind:value={unit} placeholder={m.shopping_list_item_unit()} />
    </div>
    <ShoppingListCategoryCombobox bind:value={category} id="edit-item-category" />
    <button
      type="submit"
      disabled={saving || !name.trim()}
      class="w-full rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
    >
      {m.common_save()}
    </button>
  </form>
</aside>
