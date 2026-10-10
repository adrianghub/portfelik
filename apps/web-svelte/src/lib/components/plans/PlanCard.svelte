<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { deriveDebtDisplayBalance } from "$lib/services/plan-debt";
  import { todayIso } from "$lib/services/plans";
  import type { PlanDebtTerms, PlanSummary } from "$lib/types";
  import PlanMark from "$lib/components/plans/PlanMark.svelte";
  import { formatCurrency, formatDate } from "$lib/utils";
  import { MoreVertical, Pencil, Trash2, Users } from "lucide-svelte";

  interface Props {
    plan: PlanSummary;
    debtTerms?: PlanDebtTerms;
    /** Paid linked expense payments — same inputs as the plan detail balance. */
    linkedExpenses?: { amount: number; date: string }[];
    groupName?: string;
    onedit?: (plan: PlanSummary) => void;
    ondelete?: (id: string) => void;
  }

  let { plan, debtTerms, linkedExpenses = [], groupName, onedit, ondelete }: Props = $props();

  const kind = $derived(plan.kind ?? "save");
  const debtBalance = $derived(
    debtTerms ? deriveDebtDisplayBalance(debtTerms, plan.start_date, linkedExpenses, todayIso()) : 0
  );
  const isUpcoming = $derived(plan.bucket === "upcoming");
  const saveOnTrack = $derived(
    kind === "save" &&
      plan.bucket === "active" &&
      plan.monthlyNeeded != null &&
      plan.monthlyNeeded > 0 &&
      plan.monthlyActual != null &&
      plan.monthlyActualBasis === "current-month" &&
      plan.monthlyActual >= plan.monthlyNeeded - 0.01
  );
  const hasActions = $derived(!!onedit || !!ondelete);

  let menuOpen = $state(false);
  let buttonRef = $state<HTMLButtonElement | null>(null);
  let menuStyle = $state("");

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function closeMenu() {
    menuOpen = false;
  }

  function menuBottomLimit(menuLeft: number, menuRight: number): number {
    if (window.innerWidth >= 768) return window.innerHeight;
    let limit = window.innerHeight;
    const nav = document.querySelector(".mobile-bottom-nav");
    if (nav instanceof HTMLElement) {
      const top = nav.getBoundingClientRect().top;
      if (top > 0 && top < limit) limit = top;
    }
    const fab = document.querySelector(".mobile-floating-action");
    if (fab instanceof HTMLElement) {
      const box = fab.getBoundingClientRect();
      const overlaps = menuRight > box.left && menuLeft < box.right;
      if (overlaps && box.top > 0 && box.top < limit) limit = box.top;
    }
    return limit;
  }

  function toggleMenu() {
    if (menuOpen) {
      menuOpen = false;
      return;
    }
    if (!buttonRef) return;
    const r = buttonRef.getBoundingClientRect();
    const menuWidth = 176;
    const count = [onedit, ondelete].filter(Boolean).length;
    const estHeight = 44 * count + 8;
    const left = Math.max(8, r.right - menuWidth);
    const below = r.bottom + 4;
    const limit = menuBottomLimit(left, left + menuWidth);
    const openUp = below + estHeight > limit - 8 && r.top - estHeight > 8;
    const top = openUp ? Math.max(8, r.top - estHeight - 4) : below;
    menuStyle = `position:fixed; top:${top}px; left:${left}px; min-width:${menuWidth}px;`;
    menuOpen = true;
  }

  $effect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef?.contains(target)) return;
      const menuEl = document.querySelector(`[data-plan-menu="${plan.id}"][role="menu"]`);
      if (menuEl?.contains(target)) return;
      menuOpen = false;
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  });
</script>

<div
  class="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur"
>
  <div class="flex items-stretch">
    <div class="min-w-0 flex-1 p-4">
      <div class="flex items-start gap-3">
        <PlanMark {kind} name={plan.icon} />

        <a
          href="/plans/{plan.id}"
          class="hover:text-accent min-w-0 flex-1 rounded-lg transition-colors"
        >
          <span class="block truncate leading-tight font-semibold text-slate-100">{plan.name}</span>
          {#if isUpcoming || saveOnTrack || (plan.group_id && groupName)}
            <div class="mt-1 flex flex-wrap items-center gap-1.5">
              {#if isUpcoming}
                <span
                  class="shrink-0 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300 uppercase"
                >
                  {m.plan_card_upcoming_badge()}
                </span>
              {/if}
              {#if saveOnTrack}
                <span
                  class="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 uppercase"
                >
                  {m.plan_save_on_track_badge()}
                </span>
              {/if}
              {#if plan.group_id && groupName}
                <span
                  class="border-accent/20 bg-accent/10 text-accent inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
                >
                  <Users size={10} strokeWidth={2} aria-hidden="true" />
                  {groupName}
                </span>
              {/if}
            </div>
          {/if}
          {#if kind === "save" && plan.target_amount != null}
            <p class="mt-0.5 text-xs text-slate-400">
              {m.plan_save_saved({
                saved: formatCurrency(plan.savedAmount),
                target: formatCurrency(plan.target_amount),
              })}
            </p>
            {#if plan.end_date && plan.monthlyNeeded != null && plan.monthlyNeeded > 0}
              <p class="mt-0.5 text-xs text-slate-500">
                {m.plan_save_pace({
                  date: formatDate(plan.end_date),
                  amount: formatCurrency(plan.monthlyNeeded),
                })}
              </p>
            {/if}
          {:else if kind === "debt" && debtTerms}
            <p class="mt-0.5 text-xs text-slate-400">{formatCurrency(debtBalance)}</p>
          {:else if kind === "spend" && plan.budget_amount != null}
            <p class="mt-0.5 text-xs text-slate-400">
              {m.plan_card_spend_budget({ amount: formatCurrency(plan.budget_amount) })}
            </p>
          {/if}
        </a>
      </div>
    </div>

    {#if hasActions}
      <div class="flex shrink-0 items-stretch" data-plan-menu={plan.id}>
        <button
          bind:this={buttonRef}
          type="button"
          onclick={toggleMenu}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          class="flex w-11 items-center justify-center border-l border-white/5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
          aria-label={m.plan_actions()}
        >
          <MoreVertical size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
        {#if menuOpen}
          <div
            use:portal
            role="menu"
            data-plan-menu={plan.id}
            style={menuStyle}
            class="z-50 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur"
          >
            {#if onedit}
              <button
                type="button"
                role="menuitem"
                onclick={() => {
                  closeMenu();
                  onedit?.(plan);
                }}
                class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/5"
              >
                <Pencil size={15} strokeWidth={1.8} aria-hidden="true" />
                {m.common_edit()}
              </button>
            {/if}
            {#if ondelete}
              <button
                type="button"
                role="menuitem"
                onclick={() => {
                  closeMenu();
                  ondelete?.(plan.id);
                }}
                class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-rose-300 transition-colors hover:bg-rose-500/10"
              >
                <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                {m.common_delete()}
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>
