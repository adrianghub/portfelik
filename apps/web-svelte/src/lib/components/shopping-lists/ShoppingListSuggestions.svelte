<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { fetchShoppingListItemHistory } from "$lib/services/shopping-lists";

  interface Suggestion {
    name: string;
    quantity: number | null;
    unit: string | null;
  }

  interface Props {
    query: string;
    onselect: (name: string, quantity: number | null, unit: string | null) => void;
  }
  let { query, onselect }: Props = $props();

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
      } else {
        map.set(key, {
          name: item.name,
          quantity: item.quantity ?? null,
          unit: item.unit ?? null,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  });

  const suggestions = $derived.by(() => {
    if (!query) return ranked.slice(0, 5);
    const q = query.toLowerCase();
    return ranked.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 5);
  });

  let activeIndex = $state(-1);

  $effect(() => {
    void query;
    activeIndex = -1;
  });

  export function handleKeydown(e: KeyboardEvent) {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, suggestions.length - 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      const s = suggestions[activeIndex];
      onselect(s.name, s.quantity, s.unit);
    }
  }
</script>

{#if suggestions.length > 0}
  <ul
    class="absolute top-full right-0 left-0 z-30 mt-1 max-h-36 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-md dark:border-zinc-700 dark:bg-zinc-900"
    role="listbox"
  >
    {#each suggestions as s, i (s.name)}
      <li role="option" aria-selected={i === activeIndex}>
        <button
          type="button"
          class="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800 {i === activeIndex ? 'bg-zinc-50 dark:bg-zinc-800' : ''}"
          onclick={() => onselect(s.name, s.quantity, s.unit)}
          onmouseenter={() => (activeIndex = i)}
        >
          <span class="truncate text-zinc-900 dark:text-white">{s.name}</span>
          {#if s.quantity != null || s.unit}
            <span class="ml-2 shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
              {s.quantity != null ? s.quantity : ""}{s.unit ? ` ${s.unit}` : ""}
            </span>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}
