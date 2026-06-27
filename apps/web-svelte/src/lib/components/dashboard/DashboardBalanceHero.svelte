<script lang="ts">
  import InfoTooltip from "$lib/components/ui/InfoTooltip.svelte";
  import type { CategoryInsight } from "$lib/services/spending-insight";
  import { categoryRingSegments, categorySharePct } from "$lib/services/spending-category-display";
  import type { MonthlySummary } from "$lib/types";
  import { cn, formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";
  import { MediaQuery } from "svelte/reactivity";
  import { ChevronDown } from "lucide-svelte";

  const isDesktop = new MediaQuery("(min-width: 640px)");
  const isMdLayout = new MediaQuery("(min-width: 768px)");

  let {
    periodLabel,
    summary,
    savingsRatio,
    spent = 0,
    categories = [],
    showForecastNote = false,
    forecastNet,
    transactionsHref,
    breakdownOpen = $bindable(false),
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

  let ringSlotWidth = $state(0);

  function mobileRingSize(width: number): number {
    const basis = width > 0 ? width : 280;
    return Math.min(280, Math.max(232, Math.round(basis * 0.92)));
  }

  const ringSize = $derived(
    isMdLayout.current ? 268 : isDesktop.current ? 228 : mobileRingSize(ringSlotWidth)
  );
  const stroke = $derived(
    isMdLayout.current
      ? 13
      : isDesktop.current
        ? 11
        : ringSize >= 270
          ? 13
          : ringSize >= 252
            ? 12
            : 11
  );
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
  const ringLegend = $derived(
    ringSegments.map((seg) => {
      const amount = spent > 0 ? (seg.arcLen / circumference) * spent : 0;
      return {
        ...seg,
        amount,
        sharePct: categorySharePct(amount, spent),
        href:
          seg.key === "__other__" ? transactionsHref() : transactionsHref({ categoryId: seg.key }),
        label: seg.key === "__other__" ? m.dashboard_balance_ring_other() : seg.name,
      };
    })
  );

  const netPositive = $derived((summary?.net ?? 0) >= 0);
  const showMobileRingStats = $derived(!isDesktop.current && !breakdownOpen);

  const netFormatted = $derived(summary ? formatCurrency(summary.net) : "");
  const netAmountClass = $derived.by(() => {
    const len = netFormatted.length;
    if (isDesktop.current) {
      if (len > 14) return "text-lg leading-tight sm:text-xl";
      if (len > 11) return "text-xl leading-tight sm:text-2xl";
      return "text-2xl leading-none sm:text-3xl";
    }
    if (!showMobileRingStats) {
      if (len > 14) return "text-lg leading-tight";
      if (len > 11) return "text-xl leading-tight";
      return "text-2xl leading-none";
    }
    if (len > 14) return "text-base leading-tight";
    if (len > 11) return "text-lg leading-tight";
    return "text-xl leading-none";
  });

  function toggleBreakdown() {
    breakdownOpen = !breakdownOpen;
  }
</script>

{#snippet ringSvg()}
  <svg
    width="100%"
    height="100%"
    viewBox="0 0 {ringSize} {ringSize}"
    class="relative block size-full"
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

{#snippet ringLayers()}
  <div class="relative size-full overflow-hidden rounded-full">
    <div
      class={cn(
        "balance-ring-ambient pointer-events-none absolute inset-[10%] rounded-full blur-lg transition-[background-color,opacity] duration-300 sm:blur-xl",
        netPositive
          ? "bg-[var(--color-accent-from)]/14"
          : "balance-ring-ambient--negative bg-rose-500/14"
      )}
      aria-hidden="true"
    ></div>
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
{/snippet}

{#snippet ringCenterLabel()}
  <span
    class={cn(
      "max-w-[10.5rem] font-semibold tabular-nums sm:max-w-[11rem] md:max-w-[12rem]",
      netAmountClass,
      netPositive ? "text-accent-gradient" : "text-rose-400"
    )}
  >
    {netFormatted}
  </span>
{/snippet}

{#snippet ringCenterStatsDesktop()}
  {#if summary}
    <div class="mt-2 grid w-full max-w-[10.5rem] grid-cols-2 gap-x-3 gap-y-0.5 sm:max-w-[11rem]">
      <div class="min-w-0 text-left">
        <span class="text-eyebrow block text-[10px] text-emerald-400/80">{m.summary_income()}</span>
        <span
          class="block truncate text-[11px] font-medium text-emerald-300/90 tabular-nums sm:text-xs"
        >
          {formatCurrency(summary.total_income)}
        </span>
      </div>
      <div class="min-w-0 text-right">
        <span class="text-eyebrow block text-[10px] text-rose-400/80">{m.summary_expenses()}</span>
        <span
          class="block truncate text-[11px] font-medium text-rose-300/90 tabular-nums sm:text-xs"
        >
          {formatCurrency(summary.total_expenses)}
        </span>
      </div>
    </div>
    {#if savingsRatio !== null}
      <p class="mt-1.5 text-[11px] text-slate-400 sm:text-xs">
        {m.dashboard_savings_kept_pct({ pct: savingsRatio })}
      </p>
    {:else}
      <p class="mt-1.5 text-[11px] text-slate-400 sm:text-xs">{m.dashboard_savings_na()}</p>
    {/if}
  {/if}
{/snippet}

{#snippet ringCenterStats()}
  {#if summary}
    <div
      class="mt-1.5 grid w-full max-w-[10rem] grid-cols-2 gap-x-2.5 gap-y-0.5 sm:mt-2 sm:max-w-[10.5rem]"
    >
      <div class="min-w-0 text-left">
        <span class="text-eyebrow block text-[10px] text-emerald-400/80">{m.summary_income()}</span>
        <span
          class="block truncate text-[11px] font-medium text-emerald-300/90 tabular-nums sm:text-xs"
        >
          {formatCurrency(summary.total_income)}
        </span>
      </div>
      <div class="min-w-0 text-right">
        <span class="text-eyebrow block text-[10px] text-rose-400/80">{m.summary_expenses()}</span>
        <span
          class="block truncate text-[11px] font-medium text-rose-300/90 tabular-nums sm:text-xs"
        >
          {formatCurrency(summary.total_expenses)}
        </span>
      </div>
    </div>
    <p class="mt-1 text-[10px] font-medium text-slate-400 sm:text-[11px]">
      {m.dashboard_balance_ring_hint()}
    </p>
  {/if}
{/snippet}

{#snippet ringLegendBlock(compact = false)}
  <div
    class={cn(
      "rounded-xl border border-white/5 bg-white/[0.02]",
      compact ? "px-2.5 py-2" : "px-3 py-2.5"
    )}
  >
    <p class="text-eyebrow text-slate-400">{m.dashboard_balance_ring_legend_title()}</p>

    {#if ringLegend.length > 0}
      <ul class={cn("space-y-1", compact ? "mt-1.5" : "mt-2")}>
        {#each ringLegend as seg (seg.key)}
          <li>
            <a
              href={seg.href}
              class="focus-visible:ring-accent flex min-w-0 items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
            >
              <span
                class="h-2 w-2 shrink-0 rounded-full ring-1 ring-white/10 sm:h-2.5 sm:w-2.5"
                style="background-color: {seg.color}"
                aria-hidden="true"
              ></span>
              <span class="min-w-0 flex-1 truncate text-xs text-slate-200 sm:text-sm"
                >{seg.label}</span
              >
              <span class="shrink-0 text-right text-[11px] tabular-nums sm:text-xs">
                <span class="font-medium text-slate-100">{formatCurrency(seg.amount)}</span>
                {#if seg.sharePct > 0}
                  <span class="ml-1 text-slate-400">
                    {m.dashboard_balance_ring_spent_share({ pct: seg.sharePct })}
                  </span>
                {/if}
              </span>
            </a>
          </li>
        {/each}
      </ul>
    {:else if spent <= 0}
      <p class="mt-1.5 text-[11px] text-slate-400 sm:text-xs">
        {m.dashboard_balance_ring_no_spending()}
      </p>
    {:else}
      <p class="mt-1.5 text-[11px] text-slate-400 sm:text-xs">
        {m.dashboard_balance_ring_savings_arc()}
      </p>
    {/if}
  </div>
{/snippet}

{#snippet balanceBreakdown()}
  {#if summary}
    <div class="grid grid-cols-1 gap-2">
      <a
        href={transactionsHref({ type: "income" })}
        class="focus-visible:ring-accent group flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-2 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none sm:gap-2.5 sm:px-3"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]"
          aria-hidden="true"
        ></span>
        <span class="min-w-0 flex-1">
          <span class="text-eyebrow block text-slate-400">{m.summary_income()}</span>
          <span class="mt-0.5 block text-sm font-semibold text-emerald-300 tabular-nums">
            {formatCurrency(summary.total_income)}
          </span>
        </span>
      </a>

      <a
        href={transactionsHref({ type: "expense" })}
        class="focus-visible:ring-accent group flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-2 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none sm:gap-2.5 sm:px-3"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.45)]"
          aria-hidden="true"
        ></span>
        <span class="min-w-0 flex-1">
          <span class="text-eyebrow block text-slate-400">{m.summary_expenses()}</span>
          <span class="mt-0.5 block text-sm font-semibold text-rose-300 tabular-nums">
            {formatCurrency(summary.total_expenses)}
          </span>
        </span>
      </a>

      <div
        class="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-2 sm:gap-2.5 sm:px-3"
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
          <span class="text-eyebrow flex items-center gap-1 text-slate-400">
            {m.dashboard_savings_short()}
            <InfoTooltip
              label={m.summary_savings_ratio()}
              text={m.summary_savings_ratio_info()}
              side="bottom"
            />
          </span>
          <span
            class={cn(
              "mt-0.5 block text-sm font-semibold tabular-nums",
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

    {@render ringLegendBlock(false)}
  {/if}
{/snippet}

<section
  class="relative flex h-full min-w-0 flex-col overflow-x-clip rounded-3xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur"
>
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
      <p class="mt-1 text-xs text-slate-400">{m.dashboard_balance_ledger_note()}</p>
    </div>
    <a href={transactionsHref()} class="text-accent shrink-0 text-xs font-medium hover:underline">
      {m.dashboard_balance_all_link()} →
    </a>
  </div>

  {#if summary}
    <div class="relative mt-3 flex min-w-0 flex-1 flex-col gap-2 sm:gap-3">
      <div
        class="relative flex w-full min-w-0 flex-1 items-center justify-center sm:min-h-[12rem] md:min-h-[14rem]"
        bind:clientWidth={ringSlotWidth}
      >
        <div class="group relative shrink-0" style="width: {ringSize}px; height: {ringSize}px">
          {#if isDesktop.current}
            <div
              class="relative size-full overflow-hidden rounded-full"
              role="img"
              aria-label="{m.summary_net()}: {netFormatted}"
            >
              {@render ringLayers()}
              <div
                class="pointer-events-none absolute inset-0 z-[3] flex flex-col items-center justify-center px-5 text-center"
              >
                {@render ringCenterLabel()}
                {@render ringCenterStatsDesktop()}
              </div>
            </div>
          {:else}
            <button
              type="button"
              class="focus-visible:ring-accent relative size-full cursor-pointer overflow-hidden rounded-full focus-visible:ring-2 focus-visible:outline-none"
              aria-expanded={breakdownOpen}
              aria-label="{m.summary_net()}: {netFormatted}. {m.dashboard_balance_ring_label()}"
              onclick={toggleBreakdown}
            >
              {#if !breakdownOpen}
                <div
                  class={cn(
                    "balance-ring-invite-pulse pointer-events-none absolute inset-0 rounded-full",
                    !netPositive && "balance-ring-invite-pulse--negative"
                  )}
                  aria-hidden="true"
                ></div>
              {/if}

              {@render ringLayers()}

              <div
                class="pointer-events-none absolute inset-0 z-[3] flex flex-col items-center justify-center px-4 text-center"
              >
                {@render ringCenterLabel()}

                {#if showMobileRingStats}
                  {@render ringCenterStats()}
                {:else}
                  <span class="mt-1 flex items-center gap-0.5 text-[11px] text-slate-400">
                    {m.dashboard_balance_ring_hint_collapse()}
                    <ChevronDown
                      size={12}
                      strokeWidth={2}
                      class="text-slate-400"
                      aria-hidden="true"
                    />
                  </span>
                {/if}
              </div>
            </button>
          {/if}
        </div>
      </div>

      {#if isDesktop.current}
        <div class="w-full min-w-0">
          {@render ringLegendBlock(true)}
        </div>
      {:else}
        <div
          class={cn(
            "expand-grid expand-grid--stagger w-full min-w-0",
            breakdownOpen && "expand-grid--open"
          )}
          aria-hidden={!breakdownOpen}
        >
          <div class="expand-grid-inner">
            <div class="expand-grid-panel space-y-1.5 pt-1">
              {@render balanceBreakdown()}
            </div>
          </div>
        </div>
      {/if}
    </div>

    {#if showForecastNote && forecastNet !== undefined}
      <p class="relative mt-auto flex items-center gap-1 pt-3 text-xs text-slate-400">
        <span>{m.dashboard_balance_with_planned({ amount: formatCurrency(forecastNet) })}</span>
        <InfoTooltip
          label={m.dashboard_balance_with_planned({ amount: formatCurrency(forecastNet) })}
          text={m.dashboard_balance_with_planned_info()}
          side="bottom"
        />
      </p>
    {/if}
  {:else}
    <div class="relative mt-5 flex flex-col items-center gap-4">
      <div
        class="aspect-square w-full max-w-[280px] shrink-0 animate-pulse rounded-full border-[12px] border-white/5 sm:max-w-[228px] sm:border-[11px] md:max-w-[268px] md:border-[13px]"
      ></div>
      <div class="w-full space-y-2">
        {#each [0, 1] as i (i)}
          <div class="h-14 animate-pulse rounded-xl bg-slate-800/60"></div>
        {/each}
      </div>
    </div>
  {/if}
</section>
