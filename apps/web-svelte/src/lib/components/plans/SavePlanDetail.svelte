<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { PlanSettlementProgress } from "$lib/services/plan-settlement";
  import { addCalendarMonths, calendarMonthsUntil, todayIso } from "$lib/services/plans";
  import type { Plan } from "$lib/types";
  import { formatCurrency } from "$lib/utils";
  import { ChevronRight } from "lucide-svelte";

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

  let sliderTarget = $state(60000);
  let sliderMonths = $state(12);

  $effect(() => {
    sliderTarget = plan.target_amount ?? 60000;
    sliderMonths = Math.max(3, calendarMonthsUntil(plan.end_date));
  });

  function emitTargetAdjust() {
    onAdjust?.({ target_amount: sliderTarget });
  }

  function emitDeadlineAdjust() {
    onAdjust?.({ end_date: addCalendarMonths(todayIso(), sliderMonths) });
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
    </div>
  </div>

  {#if onAdjust}
    <div class="mt-5 space-y-4 rounded-xl border border-white/5 bg-slate-900/40 p-3">
      <div>
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>{m.plan_save_slider_target()}</span>
          <span class="text-slate-200 tabular-nums">{formatCurrency(sliderTarget)}</span>
        </div>
        <input
          type="range"
          min="5000"
          max="200000"
          step="1000"
          bind:value={sliderTarget}
          onchange={emitTargetAdjust}
          disabled={adjusting}
          class="accent-accent mt-2 w-full"
        />
      </div>
      <div>
        <div class="flex items-center justify-between text-xs text-slate-400">
          <span>{m.plan_save_slider_deadline()}</span>
          <span class="text-slate-200">{m.plan_save_slider_months({ count: sliderMonths })}</span>
        </div>
        <input
          type="range"
          min="3"
          max="60"
          step="1"
          bind:value={sliderMonths}
          onchange={emitDeadlineAdjust}
          disabled={adjusting}
          class="accent-accent mt-2 w-full"
        />
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

  <a
    href="/plans/{plan.id}/settle"
    class="bg-accent-gradient focus-visible:ring-accent mt-5 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] focus-visible:ring-2 focus-visible:outline-none"
  >
    {m.plan_save_link_cta()}
    <ChevronRight size={18} aria-hidden="true" />
  </a>
</section>
