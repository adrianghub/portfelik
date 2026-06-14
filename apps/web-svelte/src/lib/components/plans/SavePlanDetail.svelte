<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { PlanSettlementProgress } from "$lib/services/plan-settlement";
  import type { Plan } from "$lib/types";
  import { formatCurrency } from "$lib/utils";
  import { page } from "$app/stores";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
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

  // Inline adjust mirrors the plan creation form: a currency input for the target and a
  // DayPicker for the deadline. No sliders - keeps the edit affordance consistent app-wide.
  let editTarget = $state(0);
  let editEndDate = $state("");

  $effect(() => {
    editTarget = plan.target_amount ?? 0;
    editEndDate = plan.end_date;
  });

  function onTargetInput(event: Event) {
    const raw = Number((event.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    editTarget = Math.min(1_000_000, Math.max(100, Math.round(raw)));
    onAdjust?.({ target_amount: editTarget });
  }

  function onDeadlineChange(value: string) {
    if (!value) return;
    editEndDate = value;
    onAdjust?.({ end_date: value });
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
        <p class="mt-1 text-xs text-slate-400">{m.plan_save_empty_hint()}</p>
      {/if}
    </div>
  </div>

  {#if onAdjust}
    <div
      class="mt-5 grid gap-3 rounded-xl border border-white/5 bg-slate-900/40 p-3 sm:grid-cols-2"
    >
      <div class="space-y-1">
        <label class="text-xs font-medium text-slate-300" for="save-target-{plan.id}">
          {m.plan_save_slider_target()}
        </label>
        <div class="relative">
          <input
            id="save-target-{plan.id}"
            type="number"
            min="100"
            max="1000000"
            step="500"
            value={editTarget}
            onchange={onTargetInput}
            disabled={adjusting}
            aria-label={m.plan_save_slider_target()}
            class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 py-2 pr-9 pl-3.5 text-sm text-slate-100 tabular-nums backdrop-blur focus:ring-2 focus:outline-none disabled:opacity-50"
          />
          <span
            class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500"
          >
            zł
          </span>
        </div>
      </div>
      <DayPicker
        id="save-deadline-{plan.id}"
        value={editEndDate}
        onchange={onDeadlineChange}
        disabled={adjusting}
        label={m.plan_save_slider_deadline()}
        yearsPast={100}
        yearsAhead={15}
      />
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
