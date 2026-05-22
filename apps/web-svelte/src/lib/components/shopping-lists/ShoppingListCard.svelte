<script lang="ts">
  import ProgressRing from "$lib/components/ui/ProgressRing.svelte";
  import * as m from "$lib/paraglide/messages";
  import type { ShoppingListSummary } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { Copy, Pencil, Trash2, Users } from "lucide-svelte";

  interface Props {
    list: ShoppingListSummary;
    ondelete?: (id: string) => void;
    onduplicate?: (id: string) => void;
    onedit?: (list: ShoppingListSummary) => void;
  }
  let { list, ondelete, onduplicate, onedit }: Props = $props();

  const ratio = $derived(list.item_total > 0 ? list.item_completed / list.item_total : 0);
  const progress = $derived(list.item_total > 0 ? Math.round(ratio * 100) : null);
</script>

<div
  class="relative flex items-stretch overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur"
>
  {#if list.item_total > 0}
    <span
      class="bg-accent-gradient absolute top-0 left-0 h-[3px] rounded-r-full shadow-[0_0_8px_var(--color-accent-glow)] transition-[width] duration-500 ease-out"
      style="width: {Math.max(ratio * 100, 4)}%; opacity: {list.status === 'completed' ? 0.45 : 1};"
      aria-hidden="true"
    ></span>
  {/if}
  <a href="/shopping-lists/{list.id}" class="flex-1 p-4 transition-colors hover:bg-white/5">
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <span class="truncate font-medium text-slate-100">{list.name}</span>
        {#if list.group_id}
          <span
            class="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-emerald-300 uppercase"
            title={m.group_badge_shared()}
          >
            <Users size={11} strokeWidth={2} aria-hidden="true" />
            {m.group_badge_shared()}
          </span>
        {/if}
      </div>
      <div class="flex shrink-0 items-center gap-2">
        {#if list.item_total > 0 && list.status === "active"}
          <ProgressRing
            value={ratio}
            label={`${list.item_completed} z ${list.item_total} (${progress}%)`}
          />
        {/if}
        <span
          class={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
            list.status === "active"
              ? "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
              : "border border-white/10 bg-slate-800/60 text-slate-400"
          )}
        >
          {list.status === "active"
            ? m.shopping_lists_status_active()
            : m.shopping_lists_status_completed()}
        </span>
      </div>
    </div>
    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
      <span>{formatDate(list.created_at)}</span>
      {#if list.item_total > 0}
        <span aria-hidden="true">·</span>
        <span>{list.item_completed}/{list.item_total}</span>
      {/if}
      {#if list.total_amount != null}
        <span aria-hidden="true">·</span>
        <span>{formatCurrency(list.total_amount)}</span>
      {/if}
    </div>
  </a>
  {#if onedit}
    <button
      onclick={() => onedit(list)}
      class="border-l border-white/5 px-3 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
      aria-label={m.shopping_list_edit()}
    >
      <Pencil size={15} strokeWidth={1.8} aria-hidden="true" />
    </button>
  {/if}
  {#if onduplicate}
    <button
      onclick={() => onduplicate(list.id)}
      class="border-l border-white/5 px-3 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
      aria-label={m.shopping_list_duplicate()}
    >
      <Copy size={15} strokeWidth={1.8} aria-hidden="true" />
    </button>
  {/if}
  {#if ondelete}
    <button
      onclick={() => ondelete(list.id)}
      class="border-l border-white/5 px-3 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
      aria-label={m.shopping_list_delete()}
    >
      <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
    </button>
  {/if}
</div>
