<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { SpendBudgetSummary } from "$lib/plans/spend";
  import { deriveDebtDisplayBalance } from "$lib/services/plan-debt";
  import { todayIso } from "$lib/services/plans";
  import type { PlanDebtTerms, PlanSummary } from "$lib/types";
  import PlanMark from "$lib/components/plans/PlanMark.svelte";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { MoreVertical, Pencil, Trash2 } from "lucide-svelte";

  interface Props {
    plan: PlanSummary;
    debtTerms?: PlanDebtTerms;
    /** Paid linked expense payments — same inputs as the plan detail balance. */
    linkedExpenses?: { amount: number; date: string }[];
    /** Existing budget math for a spend plan. Null until those rows have loaded. */
    spendSummary?: SpendBudgetSummary | null;
    groupName?: string;
    onedit?: (plan: PlanSummary) => void;
    ondelete?: (id: string) => void;
  }

  let {
    plan,
    debtTerms,
    linkedExpenses = [],
    spendSummary = null,
    groupName,
    onedit,
    ondelete,
  }: Props = $props();

  const kind = $derived(plan.kind ?? "save");
  const debtBalance = $derived(
    debtTerms ? deriveDebtDisplayBalance(debtTerms, plan.start_date, linkedExpenses, todayIso()) : 0
  );
  const hasActions = $derived(!!onedit || !!ondelete);
  const savePct = $derived(
    plan.target_amount != null && plan.target_amount > 0
      ? Math.min(100, Math.round((plan.savedAmount / plan.target_amount) * 100))
      : 0
  );
  const spendUsedPct = $derived(
    spendSummary != null && spendSummary.budget > 0
      ? Math.min(100, Math.round((spendSummary.planned / spendSummary.budget) * 100))
      : 0
  );

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

<div class="relative">
  <div class="flex items-stretch">
    <a
      href="/plans/{plan.id}"
      class="hover:text-accent grid min-w-0 flex-1 grid-cols-1 items-center gap-0.5 px-3 py-2.5 transition-colors md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-6 md:px-4"
    >
      <div class="min-w-0 md:col-start-1 md:row-start-1">
        <span class="flex min-w-0 items-center gap-2">
          <PlanMark {kind} name={plan.icon} size="sm" />
          <span class="truncate font-semibold text-slate-100">{plan.name}</span>
        </span>
        {#if kind === "save" && plan.end_date}
          <p class="mt-0.5 text-xs text-slate-400">{formatDate(plan.end_date)}</p>
        {:else if kind === "spend"}
          <p class="mt-0.5 text-xs text-slate-400">
            {formatDate(plan.start_date)} - {formatDate(plan.end_date)}
          </p>
        {/if}
      </div>
      {#if plan.group_id && groupName}
        <p class="truncate text-xs text-slate-400 md:col-start-1">{groupName}</p>
      {/if}
      {#if kind === "save" && plan.target_amount != null}
        <p class="text-xs text-slate-400 md:col-start-1">{m.plan_save_meaning()}</p>
        <p
          class="text-lg font-semibold whitespace-nowrap text-slate-100 tabular-nums md:col-start-2 md:row-span-3 md:row-start-1 md:self-center md:text-right md:text-2xl"
        >
          {formatCurrency(plan.savedAmount)}
        </p>
        <p class="flex items-center gap-2 text-sm text-slate-300 md:col-start-1">
          {m.plan_save_of_target({ target: formatCurrency(plan.target_amount) })}
          <span
            class="h-1 w-16 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-label={m.plan_save_saved_label()}
            aria-valuenow={savePct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span class="bg-accent block h-full rounded-full" style="width: {savePct}%"></span>
          </span>
        </p>
      {:else if kind === "debt" && debtTerms}
        <p class="text-xs text-slate-400 md:col-start-1">{m.plan_debt_remaining_hero()}</p>
        <p
          class="text-lg font-semibold whitespace-nowrap text-slate-100 tabular-nums md:col-start-2 md:row-span-3 md:row-start-1 md:self-center md:text-right md:text-2xl"
        >
          {formatCurrency(debtBalance)}
        </p>
        {#if Number(debtTerms.monthly_payment) > 0}
          <p class="text-sm text-slate-300 md:col-start-1">
            {m.plan_debt_card_installment({
              amount: formatCurrency(Number(debtTerms.monthly_payment)),
            })}
          </p>
        {/if}
      {:else if kind === "spend" && spendSummary}
        <p class="text-xs text-slate-400 md:col-start-1">{m.plan_spend_budget_left_label()}</p>
        <p
          class="text-lg font-semibold whitespace-nowrap text-slate-100 tabular-nums md:col-start-2 md:row-span-3 md:row-start-1 md:self-center md:text-right md:text-2xl"
        >
          {#if spendSummary.budgetLeft < 0}
            {m.plan_spend_over_budget({
              amount: formatCurrency(Math.abs(spendSummary.budgetLeft)),
            })}
          {:else}
            {formatCurrency(spendSummary.budgetLeft)}
          {/if}
        </p>
        <p class="flex items-center gap-2 text-sm text-slate-300 md:col-start-1">
          {#if spendSummary.toPay > 0}
            <span class="text-amber-300">
              {m.plan_spend_to_pay()}
              {formatCurrency(spendSummary.toPay)}
            </span>
          {:else}
            {m.plan_spend_in_plan({
              planned: formatCurrency(spendSummary.planned),
              budget: formatCurrency(spendSummary.budget),
            })}
          {/if}
          <span
            class="h-1 w-16 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-label={m.plan_spend_bar_label()}
            aria-valuenow={spendUsedPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              class={cn(
                "block h-full rounded-full",
                spendSummary.budgetLeft < 0 ? "bg-rose-400" : "bg-accent"
              )}
              style="width: {spendUsedPct}%"
            ></span>
          </span>
        </p>
      {/if}
    </a>

    {#if hasActions}
      <div class="flex shrink-0 items-stretch" data-plan-menu={plan.id}>
        <button
          bind:this={buttonRef}
          type="button"
          onclick={toggleMenu}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          class="flex w-10 items-center justify-center self-center text-slate-400 transition-colors hover:text-slate-200"
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
