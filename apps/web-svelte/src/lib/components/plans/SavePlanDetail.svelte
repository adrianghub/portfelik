<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { PlanSettlementProgress } from "$lib/services/plan-settlement";
  import {
    addCalendarMonths,
    derivePlanBucket,
    savePlanDeadlineAnchor,
    savePlanSliderMonths,
  } from "$lib/services/plans";
  import type { Plan } from "$lib/types";
  import { formatCurrency, formatDate } from "$lib/utils";
  import { page } from "$app/stores";
  import PlanForwardNav from "$lib/components/plans/PlanForwardNav.svelte";
  import { planSettleHref } from "$lib/utils/plan-routes";

  interface Props {
    plan: Plan;
    progress: PlanSettlementProgress;
    onAdjust?: (
      patch: Partial<{ target_amount: number; end_date: string }>
    ) => void | Promise<void>;
    adjusting?: boolean;
  }

  let { plan, progress, onAdjust, adjusting = false }: Props = $props();

  const target = $derived(plan.target_amount ?? 0);
  const saved = $derived(progress.savedAmount);
  const pct = $derived(target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0);
  const gap = $derived(
    progress.monthlyNeeded != null && progress.monthlyActual != null
      ? progress.monthlyNeeded - progress.monthlyActual
      : null
  );
  const onTrack = $derived(gap == null || gap <= 0);
  const settleHref = $derived(planSettleHref(plan.id, $page.url.searchParams));

  let sliderTarget = $state(60000);
  let sliderMonths = $state(12);

  const isUpcoming = $derived(derivePlanBucket(plan) === "upcoming");
  const deadlineAnchor = $derived(savePlanDeadlineAnchor(plan));
  const sliderEndPreview = $derived(addCalendarMonths(deadlineAnchor, sliderMonths));
  const sliderMinMonths = $derived(isUpcoming ? 1 : 3);

  $effect(() => {
    sliderTarget = plan.target_amount ?? 60000;
    const months = savePlanSliderMonths(plan);
    sliderMonths = Math.max(sliderMinMonths, months);
  });

  // Let the typed value exceed the slider range; the slider track grows to match.
  const sliderTargetMax = $derived(Math.max(200_000, sliderTarget));
  const sliderMaxMonths = $derived(Math.max(60, sliderMonths));

  function emitTargetAdjust() {
    onAdjust?.({ target_amount: sliderTarget });
  }

  function emitDeadlineAdjust() {
    onAdjust?.({ end_date: sliderEndPreview });
  }

  function onTargetInput(event: Event) {
    const raw = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    sliderTarget = Math.min(1_000_000, Math.max(100, Math.round(raw)));
    emitTargetAdjust();
  }

  function onMonthsInput(event: Event) {
    const raw = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    sliderMonths = Math.min(120, Math.max(sliderMinMonths, Math.round(raw)));
    emitDeadlineAdjust();
  }
</script>

<section
  class="rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_10%_20%,rgba(45,212,191,0.15),transparent_40%)] p-5"
  aria-label={plan.name}
>
  <div class="flex items-start gap-4">
    <div
      class="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-slate-800"
      style="background: conic-gradient(var(--color-accent) {pct}%, rgb(30 41 59) {pct}%)"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span
        class="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-lg font-bold text-emerald-400"
      >
        {pct}%
      </span>
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex flex-wrap items-center gap-2">
        <p class="text-eyebrow text-slate-400">{m.plan_kind_save()}</p>
        {#if onTrack && saved > 0}
          <span
            class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 uppercase"
          >
            {m.plan_save_on_track_badge()}
          </span>
        {/if}
      </div>
      <p class="text-accent text-2xl font-semibold tabular-nums">
        {formatCurrency(saved)}
      </p>
      <p class="text-sm text-slate-400">
        {m.plan_save_saved({ saved: formatCurrency(saved), target: formatCurrency(target) })}
      </p>
      {#if saved <= 0}
        <p class="mt-1 text-xs text-slate-500">{m.plan_save_empty_hint()}</p>
      {/if}
    </div>
  </div>

  {#if onAdjust}
    <div class="mt-5 space-y-4 rounded-xl border border-white/5 bg-slate-900/40 p-3">
      <div>
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>{m.plan_save_slider_target()}</span>
          <span class="text-slate-200 tabular-nums">{formatCurrency(sliderTarget)}</span>
        </div>
        <div class="mt-2 flex items-center gap-3">
          <input
            type="range"
            min="5000"
            max={sliderTargetMax}
            step="1000"
            bind:value={sliderTarget}
            onchange={emitTargetAdjust}
            disabled={adjusting}
            class="accent-accent min-w-0 flex-1"
            aria-label={m.plan_save_slider_target()}
          />
          <input
            type="number"
            min="100"
            max="1000000"
            step="500"
            value={sliderTarget}
            onchange={onTargetInput}
            disabled={adjusting}
            aria-label={m.plan_save_slider_target()}
            class="w-28 rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-right text-sm text-slate-100 tabular-nums"
          />
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>{m.plan_save_slider_deadline()}</span>
          <span class="text-slate-200">
            {#if isUpcoming}
              {m.plan_save_slider_months_duration({ count: sliderMonths })}
            {:else}
              {m.plan_save_slider_months({ count: sliderMonths })}
            {/if}
          </span>
        </div>
        <p class="mt-0.5 text-[11px] text-slate-500 tabular-nums">
          {m.plan_save_slider_period({
            from: formatDate(deadlineAnchor),
            to: formatDate(sliderEndPreview),
          })}
        </p>
        <div class="mt-2 flex items-center gap-3">
          <input
            type="range"
            min={sliderMinMonths}
            max={sliderMaxMonths}
            step="1"
            bind:value={sliderMonths}
            onchange={emitDeadlineAdjust}
            disabled={adjusting}
            class="accent-accent min-w-0 flex-1"
            aria-label={m.plan_save_slider_deadline()}
          />
          <input
            type="number"
            min={sliderMinMonths}
            max="120"
            step="1"
            value={sliderMonths}
            onchange={onMonthsInput}
            disabled={adjusting}
            aria-label={m.plan_save_slider_deadline()}
            class="w-20 rounded-lg border border-white/10 bg-slate-900/60 px-2 py-1.5 text-right text-sm text-slate-100 tabular-nums"
          />
        </div>
      </div>
    </div>
  {/if}

  <div class="mt-5 grid gap-2 sm:grid-cols-2">
    {#if progress.monthlyNeeded != null}
      <div class="rounded-xl border border-white/5 bg-slate-900/50 px-3 py-2.5">
        <p class="text-eyebrow text-slate-500">{m.plan_save_monthly_needed_label()}</p>
        <p class="mt-1 text-sm font-semibold text-slate-100 tabular-nums">
          {m.plan_save_monthly_needed({ amount: formatCurrency(progress.monthlyNeeded) })}
        </p>
      </div>
    {/if}
    {#if progress.monthlyActual != null}
      <div class="rounded-xl border border-white/5 bg-slate-900/50 px-3 py-2.5">
        <p class="text-eyebrow text-slate-500">{m.plan_save_monthly_actual_label()}</p>
        <p class="mt-1 text-sm font-semibold text-emerald-300 tabular-nums">
          {m.plan_save_monthly_actual({ amount: formatCurrency(progress.monthlyActual) })}
        </p>
        {#if progress.monthlyActualBasis === "historical-average"}
          <p class="mt-1 text-[11px] text-slate-500">{m.plan_save_on_track_estimate_badge()}</p>
        {/if}
      </div>
    {/if}
  </div>

  {#if progress.monthsRemaining != null && progress.monthsRemaining <= 1}
    <p
      class="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200"
    >
      {m.plan_save_deadline_urgent()}
    </p>
  {:else if !onTrack && gap != null && gap > 0}
    <p
      class="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200"
    >
      {m.plan_save_gap_warning({ amount: formatCurrency(gap) })}
    </p>
  {:else if onTrack && saved > 0}
    <p class="text-accent mt-4 text-sm font-medium">{m.plan_save_on_track()}</p>
  {/if}

  <div class="mt-5">
    <PlanForwardNav href={settleHref} title={m.plan_save_link_cta()} variant="action" />
  </div>
</section>
