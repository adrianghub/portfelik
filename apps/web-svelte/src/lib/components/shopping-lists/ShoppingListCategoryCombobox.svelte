<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import {
    DEFAULT_SHOPPING_LIST_ITEM_CATEGORIES,
    SHOPPING_LIST_CATEGORY_FALLBACK,
  } from "$lib/shopping-list-categories";
  import { fetchShoppingItemCategories } from "$lib/services/shopping-item-categories";
  import { createQuery } from "@tanstack/svelte-query";
  import { ChevronDown } from "lucide-svelte";

  interface Props {
    value?: string;
    id?: string;
    label?: string;
    placeholder?: string;
    showLabel?: boolean;
  }

  let {
    value = $bindable(""),
    id = "shopping-list-category",
    label = m.shopping_list_item_category(),
    placeholder = m.shopping_list_item_category_placeholder(),
    showLabel = true,
  }: Props = $props();

  let open = $state(false);
  let activeIndex = $state(-1);
  let inputRef = $state<HTMLInputElement | null>(null);
  let dropAnchorY = $state(0);
  let dropLeft = $state(0);
  let dropWidth = $state(0);
  let dropMaxHeight = $state(240);
  let dropAbove = $state(false);

  const DROPDOWN_PREFERRED_PX = 240;
  const VIEWPORT_PADDING_PX = 8;
  const categoriesQuery = createQuery(() => ({
    queryKey: ["shopping_item_categories"],
    queryFn: fetchShoppingItemCategories,
    staleTime: 5 * 60_000,
  }));

  const categoryOptions = $derived.by(() => {
    const saved = categoriesQuery.data?.map((category) => category.name);
    const base = saved && saved.length > 0 ? saved : DEFAULT_SHOPPING_LIST_ITEM_CATEGORIES;
    return [...base, SHOPPING_LIST_CATEGORY_FALLBACK].filter(
      (name, index, all) => all.indexOf(name) === index
    );
  });

  const suggestions = $derived.by(() => {
    const query = value.trim().toLowerCase();
    if (!open) return [] as string[];
    if (!query) return categoryOptions;
    return categoryOptions.filter((c) => c.toLowerCase().includes(query));
  });

  function updateDropPosition() {
    if (!inputRef || typeof window === "undefined") return;
    const rect = inputRef.getBoundingClientRect();
    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewLeft = vv?.offsetLeft ?? 0;
    const viewHeight = vv?.height ?? window.innerHeight;
    const viewBottom = viewTop + viewHeight;
    const spaceBelow = viewBottom - rect.bottom - VIEWPORT_PADDING_PX;
    const spaceAbove = rect.top - viewTop - VIEWPORT_PADDING_PX;
    dropAbove = spaceBelow < DROPDOWN_PREFERRED_PX && spaceAbove > spaceBelow;
    const available = Math.max(80, dropAbove ? spaceAbove : spaceBelow);
    dropMaxHeight = Math.min(DROPDOWN_PREFERRED_PX, available);
    dropLeft = rect.left - viewLeft;
    dropWidth = rect.width;
    dropAnchorY = dropAbove ? rect.top - 4 : rect.bottom + 4;
  }

  $effect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const handler = () => {
      if (open) updateDropPosition();
    };
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    vv?.addEventListener("resize", handler);
    vv?.addEventListener("scroll", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
      vv?.removeEventListener("resize", handler);
      vv?.removeEventListener("scroll", handler);
    };
  });

  $effect(() => {
    void value;
    activeIndex = suggestions.length > 0 ? Math.min(activeIndex, suggestions.length - 1) : -1;
  });

  $effect(() => {
    if (open) updateDropPosition();
  });

  function optionId(index: number) {
    return `${id}-option-${index}`;
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function closeList() {
    open = false;
    activeIndex = -1;
  }

  function selectCategory(c: string) {
    value = c;
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
      selectCategory(suggestions[activeIndex]);
    }
  }
</script>

<div class="relative w-full min-w-0 space-y-1">
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
      onfocus={() => {
        open = true;
        updateDropPosition();
      }}
      oninput={updateDropPosition}
      onblur={() => setTimeout(() => closeList(), 150)}
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
        use:portal
        id={`${id}-options`}
        class="fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border border-white/10 bg-slate-900/95 shadow-md backdrop-blur"
        style="top: {dropAnchorY}px; left: {dropLeft}px; width: {dropWidth}px; max-height: {dropMaxHeight}px; transform: translateY({dropAbove
          ? '-100%'
          : '0'});"
        role="listbox"
        onpointerdown={(e) => e.preventDefault()}
      >
        {#each suggestions as category, index (category)}
          <li role="option" id={optionId(index)} aria-selected={index === activeIndex}>
            <button
              type="button"
              class={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-white/5 ${
                index === activeIndex ? "bg-white/5" : ""
              }`}
              onclick={() => selectCategory(category)}
              onmouseenter={() => (activeIndex = index)}
            >
              <span class="truncate text-slate-100">{category}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
