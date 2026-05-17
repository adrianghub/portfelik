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
    class="min-h-[40px] rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
  >
    <option value="">{m.transactions_filter_all_categories()}</option>
    {#each categories as cat (cat.id)}
      <option value={cat.id}>{cat.name}</option>
    {/each}
  </select>
</label>
