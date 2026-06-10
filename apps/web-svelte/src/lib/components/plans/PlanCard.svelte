<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import {
    debtDisplayBalance,
    estimateInterestAccruedSince,
  } from "$lib/services/debt-amortization";
  import { todayIso } from "$lib/services/plans";
  import type { PlanDebtTerms, PlanSummary } from "$lib/types";
  import { getPlanEmoji } from "$lib/utils/plan-emoji";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { polishPluralForm } from "$lib/utils/polish-plural";
  import { CalendarDays, MoreVertical, Pencil, Sparkles, Trash2, Users } from "lucide-svelte";

  interface Props {
    plan: PlanSummary;
    debtTerms?: PlanDebtTerms;
    categoryName?: string;
    groupName?: string;
    onedit?: (plan: PlanSummary) => void;
    ondelete?: (id: string) => void;
  }

  let { plan, debtTerms, categoryName, groupName, onedit, ondelete }: Props = $props();

  const kind = $derived(plan.kind ?? "spend");
  const savePct = $derived(
    plan.target_amount != null && plan.target_amount > 0
      ? Math.min(100, Math.round((plan.savedAmount / plan.target_amount) * 100))
      : 0
  );
  // Canonical display balance (daily accrual unless payments are linked) so the card
  // matches the plan detail headline and the net-worth Kredyty line.
  const debtBalance = $derived(
    debtTerms
      ? debtDisplayBalance({
          currentBalance: Number(debtTerms.current_balance),
          annualRate: Number(debtTerms.annual_rate),
          anchorDateIso: debtTerms.updated_at.slice(0, 10),
          asOfDateIso: todayIso(),
          hasLinkedPayments: plan.spentAmount > 0.01,
        })
      : 0
  );
  const debtPaid = $derived(
    debtTerms ? Math.max(0, Number(debtTerms.original_amount) - debtBalance) : 0
  );
  const debtPaidPct = $derived(
    debtTerms && debtTerms.original_amount > 0
      ? Math.min(100, Math.max(0, Math.round((debtPaid / Number(debtTerms.original_amount)) * 100)))
      : 0
  );
  const debtInterestSinceStart = $derived(
    debtTerms
      ? estimateInterestAccruedSince(
          {
            originalAmount: Number(debtTerms.original_amount),
            currentBalance: debtBalance,
            annualRate: Number(debtTerms.annual_rate),
          },
          plan.start_date,
          todayIso()
        )
      : 0
  );

  const emoji = $derived(
    getPlanEmoji(categoryName, plan.name) || (kind === "debt" ? "🏦" : kind === "save" ? "🎯" : "")
  );
  const spentRatio = $derived(
    plan.budget_amount != null && plan.budget_amount > 0
      ? Math.min(1, plan.spentAmount / plan.budget_amount)
      : 0
  );
  const spentPct = $derived(Math.round(spentRatio * 100));
  const isUpcoming = $derived(plan.bucket === "upcoming");
  const periodLabel = $derived(
    isUpcoming
      ? `${m.plan_card_planned_from({ date: formatDate(plan.start_date) })} · ${m.plan_card_planned_until({ date: formatDate(plan.end_date) })}`
      : `${formatDate(plan.start_date)} - ${formatDate(plan.end_date)}`
  );
  const saveOnTrack = $derived(
    kind === "save" &&
      plan.bucket === "active" &&
      plan.monthlyNeeded != null &&
      plan.monthlyNeeded > 0 &&
      plan.monthlyActual != null &&
      plan.monthlyActual >= plan.monthlyNeeded - 0.01
  );
  // "historical-average" pace is an estimate from past deposits, not a demonstrated
  // current-month rate — don't assert on-track confidently from it.
  const saveOnTrackEstimate = $derived(
    saveOnTrack && plan.monthlyActualBasis === "historical-average"
  );
  const saveOnTrackConfident = $derived(saveOnTrack && !saveOnTrackEstimate);
  const hasActions = $derived(!!onedit || !!ondelete);

  function suggestionLabel(count: number): string {
    const form = polishPluralForm(count);
    if (form === "one") return m.plan_card_suggestions_one({ count });
    if (form === "few") return m.plan_card_suggestions_few({ count });
    return m.plan_card_suggestions_many({ count });
  }

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
    const openUp = below + estHeight > window.innerHeight && r.top - estHeight > 8;
    const top = openUp ? r.top - estHeight - 4 : below;
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
        <div
          class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-800 text-xl"
          aria-hidden="true"
        >
          {#if emoji}
            {emoji}
          {:else}
            <span class="text-sm font-semibold text-slate-400">
              {plan.name.charAt(0).toUpperCase()}
            </span>
          {/if}
        </div>

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
              {#if saveOnTrackConfident}
                <span
                  class="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 uppercase"
                >
                  {m.plan_save_on_track_badge()}
                </span>
              {:else if saveOnTrackEstimate}
                <span
                  class="shrink-0 rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-300 normal-case"
                  title={m.plan_save_on_track_estimate_badge()}
                >
                  {m.plan_save_on_track_badge()} · {m.plan_save_on_track_estimate_badge()}
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
          <p class="mt-0.5 flex items-center gap-1 truncate text-xs text-slate-400">
            <CalendarDays size={11} strokeWidth={1.8} aria-hidden="true" />
            {#if categoryName}{categoryName} ·
            {/if}{periodLabel}
          </p>
        </a>
      </div>

      {#if kind === "save" && plan.target_amount != null}
        <div class="mt-3">
          <div class="h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
            <div class="bg-accent-gradient h-full rounded-full" style="width: {savePct}%"></div>
          </div>
          <div class="mt-1.5 flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-400">
              {m.plan_save_saved({
                saved: formatCurrency(plan.savedAmount),
                target: formatCurrency(plan.target_amount),
              })}
            </span>
            <span class="text-accent font-semibold tabular-nums">{savePct}%</span>
          </div>
        </div>
      {:else if kind === "debt" && debtTerms}
        <div class="mt-3">
          <div class="h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
            <div class="bg-accent-gradient h-full rounded-full" style="width: {debtPaidPct}%"></div>
          </div>
          <div class="mt-1.5 flex items-center justify-between gap-2 text-xs">
            <span class="min-w-0 truncate text-slate-400">
              {m.plan_debt_card_progress({
                paid: formatCurrency(debtPaid),
                total: formatCurrency(Number(debtTerms.original_amount)),
              })} · {formatCurrency(Number(debtTerms.monthly_payment))}/mies
            </span>
            <span class="text-accent shrink-0 font-semibold tabular-nums">{debtPaidPct}%</span>
          </div>
          {#if debtInterestSinceStart > 0.01}
            <p class="mt-1 truncate text-xs text-slate-500">
              {m.plan_debt_interest_paid_since({
                date: formatDate(plan.start_date),
                amount: formatCurrency(debtInterestSinceStart),
              })}
            </p>
          {/if}
        </div>
      {:else if plan.budget_amount != null}
        <div class="mt-3">
          <div class="h-1.5 overflow-hidden rounded-full bg-slate-800" aria-hidden="true">
            <div
              class="bg-accent-gradient h-full rounded-full transition-[width] duration-500"
              style="width: {Math.max(spentPct, plan.spentAmount > 0 ? 2 : 0)}%"
            ></div>
          </div>
          <div class="mt-1.5 flex items-center justify-between gap-2 text-xs">
            <span class="text-slate-400">
              {m.plan_card_spent_of_budget({
                spent: formatCurrency(plan.spentAmount),
                budget: formatCurrency(plan.budget_amount),
              })}
            </span>
            <span
              class={cn(
                "shrink-0 font-semibold tabular-nums",
                spentPct >= 90 ? "text-amber-400" : "text-accent"
              )}
            >
              {spentPct}%
            </span>
          </div>
        </div>
      {:else}
        <div class="mt-3 flex items-center justify-between gap-2 text-xs">
          <span class="text-slate-400"
            >{m.plan_metric_spent()}: {formatCurrency(plan.spentAmount)}</span
          >
          <span class="text-slate-400"
            >{m.plan_metric_income()}: {formatCurrency(plan.incomeAmount)}</span
          >
        </div>
      {/if}

      {#if kind === "spend" && plan.eligibleCount > 0}
        <div
          class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3"
        >
          <span
            class="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400"
          >
            <Sparkles size={10} strokeWidth={2} aria-hidden="true" />
            {suggestionLabel(plan.eligibleCount)}
          </span>
          <a
            href="/plans/{plan.id}/settle"
            class="text-accent rounded-full px-2 py-1 text-xs font-semibold transition-colors hover:bg-white/5"
          >
            {m.plan_card_settle_link()} →
          </a>
        </div>
      {/if}
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
