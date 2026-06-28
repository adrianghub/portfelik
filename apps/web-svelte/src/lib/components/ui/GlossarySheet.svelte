<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { GLOSSARY_ENTRIES, searchGlossary } from "$lib/content/glossary";

  interface Props {
    open: boolean;
    onclose: () => void;
    initialQuery?: string;
  }

  let { open, onclose, initialQuery = "" }: Props = $props();
  let query = $state("");

  $effect(() => {
    if (open) query = initialQuery;
  });

  const results = $derived(searchGlossary(query));
</script>

<Dialog {open} {onclose} title={m.glossary_title()}>
  <div class="space-y-4">
    <label class="sr-only" for="glossary-search">{m.glossary_search_placeholder()}</label>
    <Input id="glossary-search" bind:value={query} placeholder={m.glossary_search_placeholder()} />
    <ul class="max-h-[min(60vh,28rem)] space-y-3 overflow-y-auto pr-1">
      {#each results as entry (entry.id)}
        <li class="rounded-xl border border-white/5 bg-slate-900/50 px-4 py-3">
          <h3 class="font-semibold text-slate-100">{entry.term}</h3>
          <p class="mt-1 text-sm text-slate-300">{entry.short}</p>
          {#if entry.long}
            <p class="mt-2 text-xs leading-relaxed text-slate-400">{entry.long}</p>
          {/if}
        </li>
      {:else}
        <li class="py-6 text-center text-sm text-slate-400">
          {#if query.trim() === ""}
            {GLOSSARY_ENTRIES.length} pojęć
          {:else}
            —
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</Dialog>
