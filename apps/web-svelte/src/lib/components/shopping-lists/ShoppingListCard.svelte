<script lang="ts">
  import ProgressRing from "$lib/components/ui/ProgressRing.svelte";
  import * as m from "$lib/paraglide/messages";
  import type { ShoppingListSummary } from "$lib/types";
  import { getPlanEmoji } from "$lib/utils/plan-emoji";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { Calendar, Copy, MoreVertical, Pencil, Trash2, Users, Sparkles } from "lucide-svelte";

  interface Props {
    list: ShoppingListSummary;
    variant?: "active" | "upcoming" | "archived";
    categoryName?: string;
    groupName?: string;
    eligibleCount?: number;
    ondelete?: (id: string) => void;
    onduplicate?: (id: string) => void;
    onedit?: (list: ShoppingListSummary) => void;
  }
  let {
    list,
    variant,
    categoryName,
    groupName,
    eligibleCount = 0,
    ondelete,
    onduplicate,
    onedit,
  }: Props = $props();

  const checklistRatio = $derived(list.item_total > 0 ? list.item_completed / list.item_total : 0);
  const checklistProgress = $derived(list.item_total > 0 ? Math.round(checklistRatio * 100) : null);

  const effectiveVariant = $derived(variant ?? list.bucket);
  const isUpcoming = $derived(effectiveVariant === "upcoming");
  const isArchived = $derived(effectiveVariant === "archived");
  const isShopping = $derived(list.mode === "shopping");
  const isActive = $derived(effectiveVariant === "active");

  const financialRatio = $derived(
    list.total_amount != null && list.total_amount > 0
      ? Math.min(1, list.linkedAmount / list.total_amount)
      : 0
  );
  const financialPct = $derived(
    list.total_amount != null && list.total_amount > 0 ? Math.round(financialRatio * 100) : null
  );
  const hasFinancialProgress = $derived(list.total_amount != null && list.total_amount > 0);

  const emoji = $derived(getPlanEmoji(categoryName, list.name));

  function formatDateRange(started: string | null, plannedFor: string): string {
    if (!started) return formatDate(plannedFor);
    const s = new Date(started);
    const e = new Date(plannedFor);
    const sY = s.getFullYear();
    const eY = e.getFullYear();
    const sM = s.getMonth();
    const eM = e.getMonth();
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return formatDate(plannedFor);
    if (sY === eY && sM === eM) {
      const sd = s.getDate();
      const ed = e.getDate();
      const mon = new Intl.DateTimeFormat("pl-PL", { month: "short" }).format(s);
      return `${sd}–${ed} ${mon} ${sY}`;
    }
    const fromMon = new Intl.DateTimeFormat("pl-PL", { month: "short" }).format(s);
    const toMon = new Intl.DateTimeFormat("pl-PL", { month: "short" }).format(e);
    return `${fromMon} – ${toMon} ${eY}`;
  }

  const dateLabel = $derived(
    isUpcoming
      ? formatDate(list.planned_for)
      : formatDateRange(list.shopping_started_at, list.planned_for)
  );

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

  function suggestionCountLabel(count: number): string {
    if (count === 1) return m.plan_card_suggestions_one({ count });
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return m.plan_card_suggestions_few({ count });
    }
    return m.plan_card_suggestions_many({ count });
  }
</script>

<div
  class={cn(
    "relative flex flex-col overflow-hidden rounded-2xl border border-white/5 backdrop-blur",
    isArchived ? "bg-slate-900/40 opacity-70" : "bg-slate-900/60"
  )}
>
  <div class="flex items-stretch">
    <a href="/plans/{list.id}" class="flex-1 p-4 transition-colors hover:bg-white/5">
      <!-- Header row: avatar + name + group badge -->
      <div class="flex items-start gap-3">
        <!-- Emoji avatar -->
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xl"
          aria-hidden="true"
        >
          {#if emoji}
            {emoji}
          {:else}
            <span class="text-sm font-semibold text-slate-400">
              {list.name.charAt(0).toUpperCase()}
            </span>
          {/if}
        </div>

        <div class="min-w-0 flex-1">
          <!-- Name + group badge row -->
          <div class="flex items-center gap-2">
            <span
              class={cn(
                "truncate leading-tight font-semibold",
                isArchived ? "text-slate-300" : "text-slate-100"
              )}
            >
              {list.name}
            </span>
            {#if list.group_id && groupName && !isArchived}
              <span
                class="border-accent/20 bg-accent/10 text-accent inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
              >
                <Users size={10} strokeWidth={2} aria-hidden="true" />
                {groupName}
              </span>
            {/if}
          </div>
          <!-- Subtitle: category · date -->
          <p class="mt-0.5 truncate text-xs text-slate-400">
            {#if categoryName}{categoryName} ·
            {/if}{dateLabel}
          </p>
        </div>

        <!-- Checklist ring (shopping mode only) -->
        {#if list.item_total > 0 && isShopping}
          <ProgressRing
            value={checklistRatio}
            label={`${list.item_completed} z ${list.item_total} (${checklistProgress}%)`}
          />
        {/if}
      </div>

      <!-- Financial progress (active/archived with budget) -->
      {#if hasFinancialProgress && !isUpcoming}
        <div class="mt-3">
          <!-- Progress bar -->
          <div class="h-1 w-full overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
            <div
              class="bg-accent-gradient h-full rounded-full transition-[width] duration-500 ease-out"
              style="width: {Math.max(financialRatio * 100, financialRatio > 0 ? 2 : 0)}%"
            ></div>
          </div>
          <!-- Amount row -->
          <div class="mt-1.5 flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-400">
              {m.plan_card_wydano({
                amount: formatCurrency(list.linkedAmount),
                total: formatCurrency(list.total_amount!),
              })}
            </span>
            <span
              class={cn(
                "shrink-0 font-semibold tabular-nums",
                financialPct != null && financialPct >= 90 ? "text-amber-400" : "text-accent"
              )}
            >
              {financialPct}%
            </span>
          </div>
        </div>
      {:else if isUpcoming}
        <div class="mt-2 flex items-center gap-1 text-xs text-sky-300/80">
          <Calendar size={11} strokeWidth={2} aria-hidden="true" />
          <span>{formatDate(list.planned_for)}</span>
        </div>
      {:else if isArchived && !hasFinancialProgress}
        <p class="mt-1.5 text-xs text-slate-400">
          {formatDate(list.completed_at ?? list.updated_at)}
        </p>
      {/if}
    </a>

    {#if hasActions}
      <div class="flex items-stretch" data-list-menu={list.id}>
        <button
          bind:this={buttonRef}
          type="button"
          onclick={toggleMenu}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          class="flex w-11 items-center justify-center border-l border-white/5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
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

  {#if eligibleCount > 0 && isActive}
    <a
      href="/plans/{list.id}/settle"
      class="flex items-center justify-between gap-2 border-t border-white/5 px-4 py-2.5 text-xs transition-colors hover:bg-white/5"
    >
      <span
        class="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-400"
      >
        <Sparkles size={10} strokeWidth={2} aria-hidden="true" />
        {suggestionCountLabel(eligibleCount)}
      </span>
      <span class="text-accent font-medium">{m.plan_card_settle_link()} →</span>
    </a>
  {/if}
</div>

<svelte:window
  onclick={handleClickOutside}
  onscroll={() => menuOpen && closeMenu()}
  onresize={() => menuOpen && closeMenu()}
/>
