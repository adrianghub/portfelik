<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { fetchShoppingListItemHistory } from "$lib/services/shopping-lists";
  import { inferShoppingListCategory } from "$lib/shopping-list-categories";
  import * as m from "$lib/paraglide/messages";
  import { Plus } from "lucide-svelte";

  interface Suggestion {
    name: string;
    quantity: number | null;
    unit: string | null;
    category: string | null;
  }

  interface Props {
    query: string;
    anchor?: HTMLElement | null;
    onselect: (
      name: string,
      quantity: number | null,
      unit: string | null,
      category: string | null
    ) => void;
    onescape?: () => void;
  }
  let { query, anchor = null, onselect, onescape }: Props = $props();

  const DROPDOWN_PREFERRED_PX = 180;
  const VIEWPORT_PADDING_PX = 8;
  let dropAnchorY = $state(0);
  let dropLeft = $state(0);
  let dropWidth = $state(0);
  let dropMaxHeight = $state(DROPDOWN_PREFERRED_PX);
  let dropAbove = $state(false);

  function updateDropPosition() {
    if (!anchor || typeof window === "undefined") return;
    const rect = anchor.getBoundingClientRect();
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

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  const historyQuery = createQuery(() => ({
    queryKey: ["shopping_list_item_history"],
    queryFn: fetchShoppingListItemHistory,
    staleTime: 5 * 60_000,
  }));

  const ranked = $derived.by(() => {
    if (!historyQuery.data) return [] as Suggestion[];
    const map = new Map<string, Suggestion & { count: number }>();
    for (const item of historyQuery.data) {
      const key = item.name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        if (item.quantity != null && existing.quantity == null) existing.quantity = item.quantity;
        if (item.unit && !existing.unit) existing.unit = item.unit;
        if (item.category && !existing.category) existing.category = item.category;
      } else {
        map.set(key, {
          name: item.name,
          quantity: item.quantity ?? null,
          unit: item.unit ?? null,
          category: item.category ?? inferShoppingListCategory(item.name),
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  });

  const trimmedQuery = $derived(query.trim());

  const suggestions = $derived.by(() => {
    if (!trimmedQuery) return [] as Suggestion[];
    const q = query.toLowerCase();
    return ranked.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5);
  });

  const optionCount = $derived(suggestions.length + (trimmedQuery ? 1 : 0));

  let activeIndex = $state(-1);

  $effect(() => {
    void query;
    activeIndex = -1;
  });

  $effect(() => {
    if (optionCount > 0) updateDropPosition();
  });

  $effect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    const handler = () => {
      if (suggestions.length > 0) updateDropPosition();
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

  function optionId(i: number) {
    return `shopping-list-suggestion-${i}`;
  }

  export function activeId(): string | null {
    return activeIndex >= 0 ? optionId(activeIndex) : null;
  }

  function createCurrent() {
    if (!trimmedQuery) return;
    onselect(trimmedQuery, null, null, inferShoppingListCategory(trimmedQuery));
  }

  export function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && onescape) {
      e.preventDefault();
      onescape();
      activeIndex = -1;
      return;
    }
    if (optionCount === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, optionCount - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const s = suggestions[activeIndex];
      if (s) onselect(s.name, s.quantity, s.unit, s.category);
      else createCurrent();
    }
  }
</script>

{#if optionCount > 0}
  <ul
    use:portal
    id="shopping-list-item-suggestions"
    class="fixed z-[100] overflow-y-auto overscroll-contain rounded-lg border border-white/10 bg-slate-900/95 shadow-md backdrop-blur"
    style="top: {dropAnchorY}px; left: {dropLeft}px; width: {dropWidth}px; max-height: {dropMaxHeight}px; transform: translateY({dropAbove
      ? '-100%'
      : '0'});"
    role="listbox"
    onpointerdown={(e) => e.preventDefault()}
  >
    {#if suggestions.length === 0}
      <li class="px-3 py-2 text-sm text-slate-500">{m.combobox_empty()}</li>
    {/if}
    {#each suggestions as s, i (s.name)}
      <li role="option" id={optionId(i)} aria-selected={i === activeIndex}>
        <button
          type="button"
          class="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/5 {i ===
          activeIndex
            ? 'bg-white/5'
            : ''}"
          onclick={() => onselect(s.name, s.quantity, s.unit, s.category)}
          onmouseenter={() => (activeIndex = i)}
        >
          <span class="min-w-0 truncate text-slate-100">{s.name}</span>
          <span class="ml-2 flex shrink-0 items-center gap-1 text-xs text-slate-500">
            {#if s.category}
              <span
                class="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400"
              >
                {s.category}
              </span>
            {/if}
            {#if s.quantity != null || s.unit}
              <span>{s.quantity != null ? s.quantity : ""}{s.unit ? ` ${s.unit}` : ""}</span>
            {/if}
          </span>
        </button>
      </li>
    {/each}
    {#if trimmedQuery}
      {@const createIndex = suggestions.length}
      <li role="option" id={optionId(createIndex)} aria-selected={createIndex === activeIndex}>
        <button
          type="button"
          class="text-accent hover:bg-accent/10 flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors {createIndex ===
          activeIndex
            ? 'bg-accent/10'
            : ''}"
          onclick={createCurrent}
          onmouseenter={() => (activeIndex = createIndex)}
        >
          <Plus size={14} class="shrink-0" aria-hidden="true" />
          <span class="min-w-0 truncate">{m.combobox_create({ value: trimmedQuery })}</span>
        </button>
      </li>
    {/if}
  </ul>
{/if}
