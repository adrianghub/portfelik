<script lang="ts">
  import { Tag, X, Check, Search } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import * as m from "$lib/paraglide/messages";
  import type { Category } from "$lib/types";
  import { cn } from "$lib/utils";

  interface Props {
    categories: Category[];
    selectedId: string | undefined;
    onchange: (id: string | undefined) => void;
  }

  let { categories, selectedId, onchange }: Props = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");
  let open = $state(false);
  let search = $state("");

  const selected = $derived(categories.find((c) => c.id === selectedId));

  const filtered = $derived.by(() => {
    const q = search.trim().toLocaleLowerCase("pl");
    if (!q) return categories;
    return categories.filter((c) => c.name.toLocaleLowerCase("pl").includes(q));
  });

  function pick(id: string | undefined) {
    onchange(id);
    open = false;
    search = "";
  }

  function clickOutside(e: MouseEvent) {
    if (!open || !isDesktop.current) return;
    const t = e.target as HTMLElement;
    if (!t.closest("[data-category-filter]")) open = false;
  }
</script>

{#snippet list()}
  <div class="relative mb-1.5">
    <Search
      size={14}
      aria-hidden="true"
      class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500"
    />
    <input
      type="text"
      bind:value={search}
      placeholder={m.transactions_category_search()}
      aria-label={m.transactions_category_search()}
      class="w-full rounded-lg border border-white/10 bg-slate-900/60 py-2 pr-3 pl-8 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
    />
  </div>
  <ul class="max-h-72 space-y-0.5 overflow-y-auto">
    <li>
      <button
        type="button"
        onclick={() => pick(undefined)}
        class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/5"
      >
        {m.transactions_filter_all_categories()}
        {#if !selectedId}
          <Check size={15} class="text-emerald-400" aria-hidden="true" />
        {/if}
      </button>
    </li>
    {#each filtered as cat (cat.id)}
      <li>
        <button
          type="button"
          onclick={() => pick(cat.id)}
          class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors hover:bg-white/5"
        >
          <span class="flex min-w-0 items-center gap-2">
            <span class="truncate">{cat.name}</span>
            <span
              class={cn(
                "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                cat.type === "income"
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "bg-rose-500/10 text-rose-300"
              )}
            >
              {cat.type === "income" ? m.common_income() : m.common_expense()}
            </span>
          </span>
          {#if selectedId === cat.id}
            <Check size={15} class="shrink-0 text-emerald-400" aria-hidden="true" />
          {/if}
        </button>
      </li>
    {/each}
    {#if filtered.length === 0}
      <li class="px-3 py-2 text-sm text-slate-500">{m.combobox_empty()}</li>
    {/if}
  </ul>
{/snippet}

<svelte:window onclick={clickOutside} />

<div class="relative shrink-0" data-category-filter>
  {#if selected}
    <div
      class="flex h-9 items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 pr-1 pl-3 text-sm text-emerald-200"
    >
      <button
        type="button"
        onclick={() => (open = !open)}
        class="flex items-center gap-1.5 focus-visible:outline-none"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Tag size={13} strokeWidth={1.8} aria-hidden="true" />
        {selected.name}
      </button>
      <button
        type="button"
        onclick={() => pick(undefined)}
        class="rounded-full p-1 text-emerald-200/80 transition-colors hover:bg-emerald-500/20 hover:text-emerald-100"
        aria-label={m.transactions_category_clear()}
      >
        <X size={14} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
  {:else}
    <button
      type="button"
      onclick={() => (open = !open)}
      class="flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3.5 text-sm font-medium text-slate-300 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <Tag size={14} strokeWidth={1.8} aria-hidden="true" />
      {m.transactions_filter_category()}
    </button>
  {/if}

  {#if open && isDesktop.current}
    <div
      class="absolute top-11 left-0 z-50 w-60 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/95 p-2 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur"
      role="dialog"
      aria-label={m.transactions_category_filter_label()}
    >
      {@render list()}
    </div>
  {/if}
</div>

{#if !isDesktop.current}
  <Sheet {open} onclose={() => (open = false)} title={m.transactions_category_filter_label()}>
    {@render list()}
  </Sheet>
{/if}
