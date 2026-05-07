<script lang="ts">
  import type { Category } from "$lib/types";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    categories: Category[];
    selectedId: string | undefined;
    onchange: (id: string | undefined) => void;
  }
  let { categories, selectedId, onchange }: Props = $props();

  function handleChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    onchange(val || undefined);
  }
</script>

<label class="flex items-center gap-2">
  <span class="sr-only">{m.transactions_filter_category_label()}</span>
  <select
    value={selectedId ?? ""}
    onchange={handleChange}
    class="min-h-[40px] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 focus:ring-2 focus:ring-zinc-900 focus:ring-offset-1 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
  >
    <option value="">{m.transactions_filter_all_categories()}</option>
    {#each categories as cat (cat.id)}
      <option value={cat.id}>{cat.name}</option>
    {/each}
  </select>
</label>
