<script lang="ts">
  import ProgressRing from "$lib/components/ui/ProgressRing.svelte";
  import * as m from "$lib/paraglide/messages";
  import type { ShoppingListSummary } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { Calendar, Copy, MoreVertical, Pencil, Trash2, Users } from "lucide-svelte";

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

  const showEdit = $derived(!!onedit && !isArchived);
  const showDuplicate = $derived(!!onduplicate);
  const showDelete = $derived(!!ondelete);
  const hasActions = $derived(showEdit || showDuplicate || showDelete);

  let menuOpen = $state(false);
  let buttonRef = $state<HTMLButtonElement | null>(null);
  let menuStyle = $state("");

  function closeMenu() {
    menuOpen = false;
  }

  // Render the menu in a body portal so the card's `overflow-hidden` (needed for
  // the rounded progress bar) cannot clip it, and anchor it to the kebab button.
  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function toggleMenu() {
    if (menuOpen) {
      menuOpen = false;
      return;
    }
    if (!buttonRef) return;
    const r = buttonRef.getBoundingClientRect();
    const MENU_W = 176;
    const estHeight = 44 * [showEdit, showDuplicate, showDelete].filter(Boolean).length + 8;
    const left = Math.max(8, r.right - MENU_W);
    const below = r.bottom + 4;
    const openUp = below + estHeight > window.innerHeight && r.top - estHeight > 8;
    const top = openUp ? r.top - estHeight - 4 : below;
    menuStyle = `position:fixed; top:${top}px; left:${left}px; min-width:${MENU_W}px;`;
    menuOpen = true;
  }

  function handleClickOutside(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (!target.closest(`[data-list-menu="${list.id}"]`)) menuOpen = false;
  }
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
  <a href="/plans/{list.id}" class="flex-1 p-4 transition-colors hover:bg-white/5">
    <div class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-2">
        <span class={cn("truncate font-medium", isArchived ? "text-slate-300" : "text-slate-100")}
          >{isUpcoming ? plannedHeadline(list.planned_for) : list.name}</span
        >
        {#if list.group_id && !isArchived}
          <span
            class="border-accent/20 bg-accent/10 text-accent inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
            title={m.group_badge_shared()}
          >
            <Users size={11} strokeWidth={2} aria-hidden="true" />
            {m.group_badge_shared()}
          </span>
        {/if}
      </div>
      {#if list.item_total > 0 && isShopping}
        <div class="flex shrink-0 items-center gap-2">
          <ProgressRing
            value={ratio}
            label={`${list.item_completed} z ${list.item_total} (${progress}%)`}
          />
        </div>
      {/if}
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
  {#if hasActions}
    <div class="flex items-stretch" data-list-menu={list.id}>
      <button
        bind:this={buttonRef}
        type="button"
        onclick={toggleMenu}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        class="flex w-11 items-center justify-center border-l border-white/5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200"
        aria-label={m.shopping_list_actions()}
      >
        <MoreVertical size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {#if menuOpen}
        <div
          use:portal
          role="menu"
          data-list-menu={list.id}
          style={menuStyle}
          class="z-50 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur"
        >
          {#if showEdit}
            <button
              type="button"
              role="menuitem"
              onclick={() => {
                closeMenu();
                onedit?.(list);
              }}
              class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/5"
            >
              <Pencil size={15} strokeWidth={1.8} aria-hidden="true" />
              {m.shopping_list_edit()}
            </button>
          {/if}
          {#if showDuplicate}
            <button
              type="button"
              role="menuitem"
              onclick={() => {
                closeMenu();
                onduplicate?.(list.id);
              }}
              class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/5"
            >
              <Copy size={15} strokeWidth={1.8} aria-hidden="true" />
              {isArchived ? m.shopping_list_archived_duplicate() : m.shopping_list_duplicate()}
            </button>
          {/if}
          {#if showDelete}
            <button
              type="button"
              role="menuitem"
              onclick={() => {
                closeMenu();
                ondelete?.(list.id);
              }}
              class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-rose-300 transition-colors hover:bg-rose-500/10"
            >
              <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
              {m.shopping_list_delete()}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<svelte:window
  onclick={handleClickOutside}
  onscroll={() => menuOpen && closeMenu()}
  onresize={() => menuOpen && closeMenu()}
/>
