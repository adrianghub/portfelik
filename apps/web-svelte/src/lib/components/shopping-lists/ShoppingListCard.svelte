<script lang="ts">
  import ProgressRing from "$lib/components/ui/ProgressRing.svelte";
  import * as m from "$lib/paraglide/messages";
  import type { ShoppingListSummary } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { Calendar, Copy, Pencil, Trash2, Users } from "lucide-svelte";

  interface Props {
    list: ShoppingListSummary;
    variant?: "active" | "upcoming" | "archived";
    ondelete?: (id: string) => void;
    onduplicate?: (id: string) => void;
    onedit?: (list: ShoppingListSummary) => void;
  }
  let { list, variant, ondelete, onduplicate, onedit }: Props = $props();

  const ratio = $derived(list.item_total > 0 ? list.item_completed / list.item_total : 0);
  const progress = $derived(list.item_total > 0 ? Math.round(ratio * 100) : null);

  const effectiveVariant = $derived(variant ?? list.bucket);
  const isUpcoming = $derived(effectiveVariant === "upcoming");
  const isArchived = $derived(effectiveVariant === "archived");
  const isShopping = $derived(list.mode === "shopping");

  function parseLocalDate(date: string): Date {
    const [year, month, day] = date.split("-").map(Number);
    if (!year || !month || !day) return new Date(date);
    return new Date(year, month - 1, day);
  }

  function plannedHeadline(date: string): string {
    const d = parseLocalDate(date);
    if (Number.isNaN(d.getTime())) return date;
    return new Intl.DateTimeFormat("pl-PL", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(d);
  }

  const modeLabel = $derived(
    list.mode === "planning"
      ? m.shopping_list_mode_planning()
      : list.mode === "shopping"
        ? m.shopping_list_mode_shopping()
        : m.shopping_list_mode_done()
  );
</script>

<div
  class={cn(
    "relative flex items-stretch overflow-hidden rounded-2xl border border-white/5 backdrop-blur",
    isArchived ? "bg-slate-900/40 opacity-70" : "bg-slate-900/60"
  )}
>
  {#if list.item_total > 0 && isShopping}
    <span
      class="bg-accent-gradient absolute top-0 left-0 h-0.75 rounded-r-full shadow-[0_0_8px_var(--color-accent-glow)] transition-[width] duration-500 ease-out"
      style="width: {Math.max(ratio * 100, 4)}%;"
      aria-hidden="true"
    ></span>
  {/if}
  <a href="/shopping-lists/{list.id}" class="flex-1 p-4 transition-colors hover:bg-white/5">
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <span class={cn("truncate font-medium", isArchived ? "text-slate-300" : "text-slate-100")}
          >{isUpcoming ? plannedHeadline(list.planned_for) : list.name}</span
        >
        {#if list.group_id && !isArchived}
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
        {#if list.item_total > 0 && isShopping}
          <ProgressRing
            value={ratio}
            label={`${list.item_completed} z ${list.item_total} (${progress}%)`}
          />
        {/if}
        {#if !isArchived}
          <span
            class={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              isUpcoming && "border border-sky-400/20 bg-sky-400/10 text-sky-300",
              list.bucket === "active" &&
                list.mode === "shopping" &&
                "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
              list.bucket === "active" &&
                list.mode === "planning" &&
                "border border-blue-400/20 bg-blue-400/10 text-blue-200"
            )}
          >
            {modeLabel}
          </span>
        {/if}
      </div>
    </div>
    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
      {#if isUpcoming}
        <span class="inline-flex items-center gap-1 text-sky-300/80">
          <Calendar size={11} strokeWidth={2} aria-hidden="true" />
          {list.name}
        </span>
      {:else if isArchived}
        <span>{formatDate(list.completed_at ?? list.updated_at)}</span>
      {/if}
      {#if list.item_total > 0}
        {#if isUpcoming || isArchived}
          <span aria-hidden="true">·</span>
        {/if}
        <span>
          {#if isShopping || isArchived}
            {list.item_completed}/{list.item_total}
          {:else}
            {list.item_total}
          {/if}
        </span>
      {/if}
      {#if list.total_amount != null}
        <span aria-hidden="true">·</span>
        <span>{formatCurrency(list.total_amount)}</span>
      {/if}
    </div>
  </a>
  {#if onedit && !isArchived}
    <button
      onclick={() => onedit(list)}
      class="border-l border-white/5 px-3 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
      aria-label={m.shopping_list_edit()}
    >
      <Pencil size={15} strokeWidth={1.8} aria-hidden="true" />
    </button>
  {/if}
  {#if isArchived && list.linked_transaction_id}
    <a
      href="/transactions?txId={list.linked_transaction_id}"
      class="flex items-center border-l border-white/5 px-3 text-xs text-emerald-400/80 transition-colors hover:bg-white/5 hover:text-emerald-300"
      onclick={(e) => e.stopPropagation()}
    >
      {m.shopping_list_linked_transaction()}
    </a>
  {/if}
  {#if onduplicate}
    <button
      onclick={() => onduplicate(list.id)}
      class="border-l border-white/5 px-3 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
      aria-label={isArchived ? m.shopping_list_archived_duplicate() : m.shopping_list_duplicate()}
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
