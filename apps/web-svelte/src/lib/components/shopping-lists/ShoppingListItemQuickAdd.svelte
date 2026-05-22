<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { ChevronDown, Plus } from "lucide-svelte";
  import { slide } from "svelte/transition";
  import ShoppingListSuggestions from "./ShoppingListSuggestions.svelte";

  interface Props {
    onsubmit: (payload: { name: string; quantity: number | null; unit: string | null }) => void;
    disabled?: boolean;
  }
  let { onsubmit, disabled = false }: Props = $props();

  let name = $state("");
  let quantity = $state<number | null>(null);
  let unit = $state("");
  let detailsOpen = $state(false);
  let inputFocused = $state(false);

  let suggestionRef = $state<{
    handleKeydown: (e: KeyboardEvent) => void;
    activeId: () => string | null;
  } | null>(null);

  function selectSuggestion(n: string, q: number | null, u: string | null) {
    name = n;
    if (q != null) quantity = q;
    if (u) unit = u;
    if (q != null || u) detailsOpen = true;
    inputFocused = false;
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onsubmit({
      name: trimmed,
      quantity: detailsOpen ? quantity : null,
      unit: detailsOpen && unit.trim() ? unit.trim() : null,
    });
    name = "";
    quantity = null;
    unit = "";
    detailsOpen = false;
    inputFocused = false;
  }
</script>

<form onsubmit={submit} class="relative space-y-2">
  <div class="flex items-stretch gap-2">
    <div class="relative flex-1">
      <input
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
          onselect={selectSuggestion}
          onescape={() => (inputFocused = false)}
        />
      {/if}
    </div>
    <button
      type="button"
      onclick={() => (detailsOpen = !detailsOpen)}
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
    <div
      id="shopping-list-item-details"
      transition:slide={{ duration: 150 }}
      class="grid grid-cols-[1fr_1fr] gap-2"
    >
      <input
        type="number"
        bind:value={quantity}
        step="0.01"
        min="0"
        placeholder={m.shopping_list_item_quantity()}
        class="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/40 focus:outline-none"
      />
      <input
        type="text"
        bind:value={unit}
        placeholder={m.shopping_list_item_unit()}
        class="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/40 focus:outline-none"
      />
    </div>
  {/if}
</form>
