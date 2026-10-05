<script lang="ts">
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type { Category, TransactionType } from "$lib/types";
  import { normalizeTransactionText } from "$lib/import/transaction-text";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    categories: Category[];
    type: TransactionType;
    selectedId: string | null;
    suggestedId: string | null;
    recentIds: string[];
    onselect: (id: string | null) => void;
    oncreate: (name: string, type: TransactionType) => Promise<string | null>;
    onclose: () => void;
  }
  let { categories, type, selectedId, suggestedId, recentIds, onselect, oncreate, onclose }: Props =
    $props();
  let search = $state("");
  let pending = $state(false);
  let error = $state(false);
  const active = $derived(categories.filter((c) => !c.archived_at && c.type === type));
  const query = $derived(normalizeTransactionText(search).normalized);
  const matches = $derived(
    active.filter((c) => normalizeTransactionText(c.name).normalized.includes(query))
  );
  const suggested = $derived(active.find((c) => c.id === suggestedId));
  const recent = $derived(
    recentIds.flatMap((id) => active.filter((c) => c.id === id && id !== suggestedId))
  );
  const canCreate = $derived(
    query !== "" && !active.some((c) => normalizeTransactionText(c.name).normalized === query)
  );

  async function create() {
    if (pending || !canCreate) return;
    pending = true;
    error = false;
    try {
      const id = await oncreate(normalizeTransactionText(search).display, type);
      if (id) onselect(id);
      else error = true;
    } catch {
      error = true;
    } finally {
      pending = false;
    }
  }
</script>

{#snippet choice(category: Category)}
  <button
    type="button"
    class="focus-visible:ring-accent min-h-11 w-full rounded-xl px-3 py-3 text-left text-sm text-slate-100 hover:bg-white/5 focus-visible:ring-2"
    aria-pressed={category.id === selectedId}
    disabled={pending}
    onclick={() => onselect(category.id)}
  >
    {category.name}{#if category.id === selectedId}<span class="float-right" aria-hidden="true"
        >✓</span
      >{/if}
  </button>
{/snippet}

<Sheet
  open={true}
  onclose={() => {
    if (!pending) onclose();
  }}
  title={m.bank_review_header_category()}
>
  <div class="space-y-4">
    <input
      type="search"
      bind:value={search}
      aria-label={m.import_v2_category_search()}
      placeholder={m.import_v2_category_search()}
      disabled={pending}
      class="focus-visible:ring-accent min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-slate-100 focus-visible:ring-2"
    />
    {#if !query && suggested}
      <section aria-label={m.import_v2_category_suggested()}>
        <h3 class="mb-1 text-xs text-slate-400">{m.import_v2_category_suggested()}</h3>
        {@render choice(suggested)}
      </section>
    {/if}
    {#if !query && recent.length > 0}
      <section aria-label={m.import_v2_category_recent()}>
        <h3 class="mb-1 text-xs text-slate-400">{m.import_v2_category_recent()}</h3>
        {#each recent as category (category.id)}{@render choice(category)}{/each}
      </section>
    {/if}
    <section aria-label={m.import_v2_category_all()}>
      <h3 class="mb-1 text-xs text-slate-400">{m.import_v2_category_all()}</h3>
      {#each matches as category (category.id)}{@render choice(category)}{/each}
      {#if matches.length === 0}<p class="py-3 text-sm text-slate-400">
          {m.import_v2_category_empty()}
        </p>{/if}
    </section>
    {#if canCreate}
      <Button
        class="min-h-11 w-full"
        disabled={pending}
        loading={pending}
        onclick={() => void create()}>{m.import_v2_category_create({ name: search.trim() })}</Button
      >
    {/if}
    {#if error}<p role="alert" class="text-sm text-rose-300">{m.toast_error()}</p>{/if}
    <button
      type="button"
      class="min-h-11 w-full rounded-xl border border-white/10 px-3 py-3 text-left text-sm text-slate-300"
      disabled={pending}
      onclick={() => onselect(null)}>{m.bank_review_category_clear()}</button
    >
  </div>
</Sheet>
