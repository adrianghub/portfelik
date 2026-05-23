<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { DEFAULT_SHOPPING_LIST_UNIT, SHOPPING_LIST_UNIT_OPTIONS } from "$lib/shopping-list-units";
  import { ChevronDown } from "lucide-svelte";

  interface Props {
    value?: string;
    id?: string;
    label?: string;
    placeholder?: string;
    showLabel?: boolean;
  }

  let {
    value = $bindable(DEFAULT_SHOPPING_LIST_UNIT),
    id = "shopping-list-unit",
    label = m.shopping_list_item_unit(),
    placeholder = m.shopping_list_item_unit_placeholder(),
    showLabel = true,
  }: Props = $props();

  let open = $state(false);
  let activeIndex = $state(-1);
  let inputRef = $state<HTMLInputElement | null>(null);

  const suggestions = $derived.by(() => {
    const query = value.trim().toLowerCase();
    if (!open) return [] as string[];
    if (!query || SHOPPING_LIST_UNIT_OPTIONS.some((unit) => unit.toLowerCase() === query)) {
      return [...SHOPPING_LIST_UNIT_OPTIONS];
    }
    return SHOPPING_LIST_UNIT_OPTIONS.filter((unit) => unit.toLowerCase().includes(query));
  });

  $effect(() => {
    void value;
    activeIndex = suggestions.length > 0 ? Math.min(activeIndex, suggestions.length - 1) : -1;
  });

  function optionId(index: number) {
    return `${id}-option-${index}`;
  }

  function closeList() {
    open = false;
    activeIndex = -1;
  }

  function selectUnit(unit: string) {
    value = unit;
    closeList();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        closeList();
      }
      return;
    }

    if (suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      open = true;
      activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      open = true;
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === "Enter" && open && activeIndex >= 0) {
      e.preventDefault();
      selectUnit(suggestions[activeIndex]);
    }
  }
</script>

<div class="relative min-w-0 space-y-1">
  {#if showLabel}
    <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for={id}>{label}</label>
  {/if}
  <div class="relative">
    <input
      bind:this={inputRef}
      {id}
      type="text"
      bind:value
      autocomplete="off"
      role="combobox"
      aria-controls={`${id}-options`}
      aria-expanded={open && suggestions.length > 0}
      aria-autocomplete="list"
      aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
      onfocus={() => (open = true)}
      onblur={() => setTimeout(() => closeList(), 120)}
      onkeydown={handleKeydown}
      {placeholder}
      class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
    />
    <ChevronDown
      size={14}
      aria-hidden="true"
      class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-500"
    />
    {#if open && suggestions.length > 0}
      <ul
        id={`${id}-options`}
        class="absolute top-full right-0 left-0 z-30 mt-1 max-h-36 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/95 shadow-md backdrop-blur"
        role="listbox"
      >
        {#each suggestions as unit, index (unit)}
          <li role="option" id={optionId(index)} aria-selected={index === activeIndex}>
            <button
              type="button"
              class={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 ${
                index === activeIndex ? "bg-white/5" : ""
              }`}
              onclick={() => selectUnit(unit)}
              onmouseenter={() => (activeIndex = index)}
            >
              <span class="truncate text-slate-100">{unit}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
