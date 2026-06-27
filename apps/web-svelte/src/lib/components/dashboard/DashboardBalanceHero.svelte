<script lang="ts">
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import type { CategoryInsight } from "$lib/services/spending-insight";
  import {
    categoryRingSegments,
    categorySharePct,
    topSpendingCategories,
  } from "$lib/services/spending-category-display";
  import type { MonthlySummary } from "$lib/types";
  import { cn, formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";
  import { MediaQuery } from "svelte/reactivity";
  import { untrack } from "svelte";
  import { fade } from "svelte/transition";

  const isDesktop = new MediaQuery("(min-width: 640px)");

  let {
    periodLabel,
    summary,
    savingsRatio,
    spent = 0,
    categories = [],
    showForecastNote = false,
    forecastNet,
    transactionsHref,
    breakdownOpen = $bindable(untrack(() => isDesktop.current)),
  }: {
    periodLabel: string;
    summary: MonthlySummary | null;
    savingsRatio: number | null;
    spent?: number;
    categories?: CategoryInsight[];
    showForecastNote?: boolean;
    forecastNet?: number;
    transactionsHref: (extra?: Record<string, string>) => string;
    breakdownOpen?: boolean;
  } = $props();

  const ringSize = $derived(isDesktop.current ? 144 : 212);
  const stroke = $derived(isDesktop.current ? 9 : 11);
  const radius = $derived((ringSize - stroke) / 2);
  const circumference = $derived(2 * Math.PI * radius);
  const cx = $derived(ringSize / 2);
  const cy = $derived(ringSize / 2);

  const savingsArc = $derived.by(() => {
    if (!summary || summary.total_income <= 0) return null;
    const ratio = summary.net / summary.total_income;
    const pct = Math.min(100, Math.abs(ratio * 100));
    return {
      arcLen: circumference * (pct / 100),
      positive: ratio >= 0,
    };
  });

  const ringSegments = $derived(categoryRingSegments(categories, spent, circumference));
  const netPositive = $derived((summary?.net ?? 0) >= 0);
  const showStatRows = $derived(breakdownOpen || isDesktop.current);
  const showRingHint = $derived(!isDesktop.current && !breakdownOpen);

  const netFormatted = $derived(summary ? formatCurrency(summary.net) : "");
  const netAmountClass = $derived.by(() => {
    const len = netFormatted.length;
    if (len > 14) return "text-base leading-tight sm:text-sm";
    if (len > 11) return "text-lg leading-tight sm:text-base";
    return "text-xl leading-none sm:text-lg md:text-xl";
  });

  const hoverCategories = $derived(topSpendingCategories(categories, 3));
  const showHoverPreview = $derived(
    spent > 0 || (summary?.total_income ?? 0) > 0 || (summary?.total_expenses ?? 0) > 0
  );

  function toggleBreakdown() {
    breakdownOpen = !breakdownOpen;
  }
</script>

{#snippet ringSvg()}
  <svg
    width={ringSize}
    height={ringSize}
    viewBox="0 0 {ringSize} {ringSize}"
    class="relative z-[1]"
    role="img"
    aria-hidden="true"
  >
    <circle
      {cx}
      {cy}
      r={radius}
      fill="none"
      stroke="currentColor"
      stroke-width={stroke}
      class="text-white/[0.06]"
    />
    {#each ringSegments as seg (seg.key)}
      <circle
        {cx}
        {cy}
        r={radius}
        fill="none"
        stroke={seg.color}
        stroke-width={stroke}
        stroke-linecap="butt"
        stroke-dasharray="{seg.arcLen} {circumference - seg.arcLen}"
        stroke-dashoffset={-seg.offset}
        transform="rotate(-90 {cx} {cy})"
      >
        <title>{seg.name}</title>
      </circle>
    {:else}
      {#if savingsArc}
        <circle
          {cx}
          {cy}
          r={radius}
          fill="none"
          stroke={savingsArc.positive ? "#34d399" : "#fb7185"}
          stroke-width={stroke}
          stroke-linecap="round"
          stroke-dasharray="{savingsArc.arcLen} {circumference - savingsArc.arcLen}"
          transform="rotate(-90 {cx} {cy})"
        />
      {/if}
    {/each}
  </svg>
{/snippet}

<section
  class="relative min-w-0 overflow-x-clip rounded-3xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur sm:p-6"
>
  <span class="glow-disc absolute -top-16 -right-16 h-44 w-44 opacity-80" aria-hidden="true"></span>
  {#if summary && !netPositive}
    <span
      class="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-rose-500/10 blur-3xl"
      aria-hidden="true"
    ></span>
  {/if}

  <div class="relative flex items-start justify-between gap-3">
    <div class="min-w-0">
      <p class="text-eyebrow text-slate-400">
        {m.dashboard_balance_title()} · {periodLabel}
      </p>
      <p class="mt-1 text-xs text-slate-500">{m.dashboard_balance_ledger_note()}</p>
    </div>
    <a href={transactionsHref()} class="text-accent shrink-0 text-xs font-medium hover:underline">
      {m.dashboard_balance_all_link()} →
    </a>
  </div>

  {#if summary}
    <div class="relative mt-4 flex flex-col gap-4 sm:mt-5 sm:flex-row sm:items-start sm:gap-8">
      <div
        class="relative flex w-full justify-center py-1 sm:mx-0 sm:w-auto sm:justify-start sm:py-0"
      >
        <button
          type="button"
          class="focus-visible:ring-accent group relative block shrink-0 overflow-visible rounded-full focus-visible:ring-2 focus-visible:outline-none"
          aria-expanded={breakdownOpen}
          aria-label="{m.summary_net()}: {netFormatted}. {m.dashboard_balance_ring_label()}"
          onclick={toggleBreakdown}
        >
          {#if !breakdownOpen}
            <div
              class={cn(
                "balance-ring-invite-pulse pointer-events-none absolute -inset-10 rounded-full sm:hidden",
                !netPositive && "balance-ring-invite-pulse--negative"
              )}
              aria-hidden="true"
            ></div>
          {/if}
          <div
            class={cn(
              "balance-ring-ambient pointer-events-none absolute inset-0 z-0 rounded-full blur-2xl transition-[background-color,opacity] duration-300",
              netPositive
                ? "bg-[var(--color-accent-from)]/10"
                : "balance-ring-ambient--negative bg-rose-500/10"
            )}
            aria-hidden="true"
          ></div>

          <div class="relative z-[1]" style="width: {ringSize}px; height: {ringSize}px">
            {@render ringSvg()}
            <div
              class={cn(
                "balance-ring-shine balance-ring-orbit-wrap",
                !netPositive && "balance-ring-shine--negative"
              )}
              style="--ring-stroke: {stroke}px"
              aria-hidden="true"
            ></div>
          </div>

          <div
            class="pointer-events-none absolute inset-0 z-[3] flex flex-col items-center justify-center px-3 text-center sm:px-3"
          >
            {#if showRingHint}
              <span
                class="max-w-[8.5rem] text-[9px] leading-snug font-medium text-slate-500"
                in:fade={{ duration: 220 }}
                out:fade={{ duration: 160 }}
              >
                {m.dashboard_balance_ring_hint()}
              </span>
            {/if}
            <span
              class={cn(
                "max-w-[9rem] font-semibold tabular-nums transition-[margin] duration-300 ease-out sm:max-w-[6.5rem]",
                showRingHint && "mt-1",
                !showRingHint && "mt-0",
                netAmountClass,
                netPositive ? "text-accent-gradient" : "text-rose-400"
              )}
            >
              {netFormatted}
            </span>
          </div>

          {#if showHoverPreview}
            <div
              class="balance-ring-hover-card pointer-events-none absolute top-1/2 left-[calc(100%+0.75rem)] z-50 hidden w-60 -translate-y-1/2 rounded-xl border border-white/10 bg-slate-950 p-3 text-left opacity-0 shadow-2xl max-sm:!hidden sm:block sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100"
              aria-hidden="true"
            >
              <p class="text-eyebrow text-slate-400">{m.dashboard_balance_hover_title()}</p>
              <dl class="mt-2 space-y-1.5 text-xs">
                <div class="flex items-baseline justify-between gap-3">
                  <dt class="text-slate-400">{m.summary_income()}</dt>
                  <dd class="font-medium text-emerald-300 tabular-nums">
                    {formatCurrency(summary.total_income)}
                  </dd>
                </div>
                <div class="flex items-baseline justify-between gap-3">
                  <dt class="text-slate-400">{m.summary_expenses()}</dt>
                  <dd class="font-medium text-rose-300 tabular-nums">
                    {formatCurrency(summary.total_expenses)}
                  </dd>
                </div>
                {#if savingsRatio !== null}
                  <div class="flex items-baseline justify-between gap-3">
                    <dt class="text-slate-400">{m.dashboard_savings_short()}</dt>
                    <dd class="font-medium text-emerald-300/90 tabular-nums">
                      {m.dashboard_savings_kept_pct({ pct: savingsRatio })}
                    </dd>
                  </div>
                {/if}
              </dl>
              {#if hoverCategories.length > 0}
                <div class="mt-2.5 border-t border-white/10 pt-2.5">
                  <p class="text-eyebrow text-slate-500">{m.dashboard_categories_title()}</p>
                  <ul class="mt-1.5 space-y-1.5">
                    {#each hoverCategories as cat (cat.categoryId)}
                      <li class="flex items-baseline justify-between gap-2 text-xs">
                        <span class="min-w-0 truncate text-slate-300">{cat.name}</span>
                        <span class="shrink-0 font-medium text-slate-100 tabular-nums">
                          {formatCurrency(cat.total)}
                          <span class="ml-1 text-slate-500"
                            >({categorySharePct(cat.total, spent)}%)</span
                          >
                        </span>
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          {/if}
        </button>
      </div>

      <div
        class={cn(
          "expand-grid expand-grid--stagger expand-grid--md-open min-w-0 flex-1",
          breakdownOpen && "expand-grid--open"
        )}
        aria-hidden={!showStatRows}
      >
        <div class="expand-grid-inner">
          <div class="expand-grid-panel space-y-2 pt-1 sm:pt-0">
            <a
              href={transactionsHref({ type: "income" })}
              class="expand-grid-item focus-visible:ring-accent group flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span
                class="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
                aria-hidden="true"
              ></span>
              <span class="min-w-0 flex-1">
                <span class="text-eyebrow block text-slate-500">{m.summary_income()}</span>
                <span class="mt-0.5 block text-base font-semibold text-emerald-300 tabular-nums">
                  {formatCurrency(summary.total_income)}
                </span>
              </span>
            </a>

            <button
              type="button"
              class="expand-grid-item focus-visible:ring-accent group flex w-full items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
              onclick={toggleBreakdown}
            >
              <span
                class="h-2 w-2 shrink-0 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]"
                aria-hidden="true"
              ></span>
              <span class="min-w-0 flex-1">
                <span class="text-eyebrow block text-slate-500">{m.summary_expenses()}</span>
                <span class="mt-0.5 block text-base font-semibold text-rose-300 tabular-nums">
                  {formatCurrency(summary.total_expenses)}
                </span>
              </span>
            </button>

            <div
              class="expand-grid-item flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
            >
              <span
                class={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  savingsRatio === null
                    ? "bg-slate-600"
                    : savingsRatio >= 0
                      ? "bg-emerald-400/80 shadow-[0_0_8px_rgba(52,211,153,0.35)]"
                      : "bg-rose-400/80 shadow-[0_0_8px_rgba(251,113,133,0.35)]"
                )}
                aria-hidden="true"
              ></span>
              <span class="min-w-0 flex-1">
                <span class="text-eyebrow flex items-center gap-1 text-slate-500">
                  <span class="sm:hidden">{m.dashboard_savings_short()}</span>
                  <span class="hidden sm:inline">{m.dashboard_savings_after_expenses()}</span>
                  <InfoTooltip
                    label={m.summary_savings_ratio()}
                    text={m.summary_savings_ratio_info()}
                    side="bottom"
                  />
                </span>
                <span
                  class={cn(
                    "mt-0.5 block text-base font-semibold tabular-nums",
                    savingsRatio === null
                      ? "text-slate-400"
                      : savingsRatio >= 0
                        ? "text-emerald-300"
                        : "text-rose-300"
                  )}
                >
                  {#if savingsRatio === null}
                    {m.dashboard_savings_na()}
                  {:else}
                    {m.dashboard_savings_kept_pct({ pct: savingsRatio })}
                  {/if}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    {#if showForecastNote && forecastNet !== undefined}
      <p class="relative mt-4 inline-flex items-center gap-1 text-xs text-slate-500">
        <span>{m.dashboard_balance_with_planned({ amount: formatCurrency(forecastNet) })}</span>
        <InfoTooltip
          label={m.dashboard_balance_with_planned({ amount: formatCurrency(forecastNet) })}
          text={m.dashboard_balance_with_planned_info()}
          side="bottom"
        />
      </p>
    {/if}
  {:else}
    <div class="relative mt-5 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div
        class="size-[212px] shrink-0 animate-pulse rounded-full border-[11px] border-white/5 sm:size-[144px] sm:border-[9px]"
      ></div>
      <div class="flex-1 space-y-2">
        {#each [0, 1] as i (i)}
          <div class="h-14 animate-pulse rounded-xl bg-slate-800/60"></div>
        {/each}
      </div>
    </div>
  {/if}
</section>
