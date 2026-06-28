<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { track } from "$lib/analytics";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import {
    buildGlossaryEntries,
    glossaryEntryById,
    glossaryTermLabel,
    searchGlossary,
  } from "$lib/content/glossary";

  interface Props {
    open: boolean;
    onclose: () => void;
    initialQuery?: string;
    focusEntryId?: string;
    source?: "settings" | "tooltip";
  }

  let { open, onclose, initialQuery = "", focusEntryId, source = "settings" }: Props = $props();
  let query = $state("");

  const entries = $derived(buildGlossaryEntries());
  const results = $derived(searchGlossary(query, entries));

  $effect(() => {
    if (!open) return;
    if (focusEntryId) {
      const entry = glossaryEntryById(focusEntryId, entries);
      query = entry?.term ?? initialQuery;
    } else {
      query = initialQuery;
    }
    track("glossary_opened", {
      source,
      ...(focusEntryId ? { entry_id: focusEntryId } : {}),
    });
  });
</script>

<Dialog {open} {onclose} title={m.glossary_title()}>
  <div class="space-y-4">
    <label class="sr-only" for="glossary-search">{m.glossary_search_placeholder()}</label>
    <Input id="glossary-search" bind:value={query} placeholder={m.glossary_search_placeholder()} />
    <ul class="max-h-[min(60vh,28rem)] space-y-3 overflow-y-auto pr-1">
      {#each results as entry (entry.id)}
        <li
          id={`glossary-entry-${entry.id}`}
          class="rounded-xl border border-white/5 bg-slate-900/50 px-4 py-3"
        >
          <h3 class="font-semibold text-slate-100">{entry.term}</h3>
          <p class="mt-1 text-sm text-slate-300">{entry.short}</p>
          {#if entry.long}
            <p class="mt-2 text-xs leading-relaxed text-slate-400">{entry.long}</p>
          {/if}
          {#if entry.seeAlso && entry.seeAlso.length > 0}
            <p class="mt-2 text-xs text-slate-500">
              {m.glossary_see_also()}:
              {#each entry.seeAlso as relatedId, i (relatedId)}
                {#if i > 0},
                {/if}
                <button
                  type="button"
                  class="text-accent hover:underline"
                  onclick={() => {
                    const term = glossaryTermLabel(relatedId, entries);
                    if (term) query = term;
                  }}
                >
                  {glossaryTermLabel(relatedId, entries) ?? relatedId}
                </button>
              {/each}
            </p>
          {/if}
        </li>
      {:else}
        <li class="py-6 text-center text-sm text-slate-400">—</li>
      {/each}
    </ul>
    {#if query.trim() === ""}
      <p class="text-center text-xs text-slate-500">
        {m.glossary_count({ count: entries.length })}
      </p>
    {/if}
  </div>
</Dialog>
