<script lang="ts">
  import { onMount } from "svelte";
  import {
    axisDayLabel,
    dateRatio,
    scrubAtRatio,
    type CockpitChartPoint,
    type CockpitScrub,
  } from "$lib/cockpit/forecast-chart";
  import { motionDuration } from "$lib/motion";
  import * as m from "$lib/paraglide/messages";
  import { formatCurrency } from "$lib/utils";

  let {
    points,
    todayRatio,
    rangeStart,
    rangeEnd,
    reveal = false,
  }: {
    points: CockpitChartPoint[];
    todayRatio: number | null;
    rangeStart: string;
    rangeEnd: string;
    reveal?: boolean;
  } = $props();

  const width = 640;
  const height = 220;
  const padTop = 18;
  const padBottom = 16;
  const gradientId = `cockpit-fill-${Math.random().toString(36).slice(2)}`;
  const reduced = motionDuration(1_000) === 0;

  let pageVisible = $state(true);
  let drawn = $state(true);
  let line = $state<SVGPathElement | null>(null);
  let scrub = $state<CockpitScrub | null>(null);
  let pointerOrigin = { x: 0, y: 0, active: false };

  const values = $derived(points.map((point) => point.balance));
  const scale = $derived.by(() => {
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.14;
    return { min: min - pad, max: max + pad };
  });

  function xOf(date: string): number {
    return dateRatio(date, rangeStart, rangeEnd) * width;
  }

  function yOf(value: number): number {
    const span = scale.max - scale.min;
    const t = (value - scale.min) / span;
    return padTop + (1 - t) * (height - padTop - padBottom);
  }

  function linePath(series: CockpitChartPoint[]): string {
    return series
      .map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command}${xOf(point.date).toFixed(1)} ${yOf(point.balance).toFixed(1)}`;
      })
      .join(" ");
  }

  const fullPath = $derived(points.length > 1 ? linePath(points) : "");
  const fillPath = $derived(
    points.length > 1
      ? `${fullPath} L${xOf(points[points.length - 1].date).toFixed(1)} ${height} L${xOf(points[0].date).toFixed(1)} ${height} Z`
      : ""
  );
  const todayPoint = $derived.by(() => {
    if (todayRatio == null) return null;
    const history = points.filter((point) => point.kind === "history");
    return history[history.length - 1] ?? null;
  });
  const todayVisible = $derived(
    todayPoint != null && (drawn || todayRatio == null || todayRatio <= 0)
  );

  onMount(() => {
    const onVisibility = () => {
      pageVisible = document.visibilityState === "visible";
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  });

  $effect(() => {
    if (!reveal || reduced || !line) {
      drawn = true;
      return;
    }
    drawn = false;
    const length = line.getTotalLength();
    line.style.strokeDasharray = `${length}`;
    const animation = line.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
      duration: 1000,
      easing: "cubic-bezier(0.19, 1, 0.22, 1)",
      fill: "forwards",
    });
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 1000);
      if (todayRatio != null && progress >= todayRatio) drawn = true;
      if (progress < 1) frame = requestAnimationFrame(tick);
      else drawn = true;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      animation.cancel();
      cancelAnimationFrame(frame);
    };
  });

  function ratioFromEvent(event: PointerEvent): number {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  }

  function onPointerDown(event: PointerEvent) {
    pointerOrigin = { x: event.clientX, y: event.clientY, active: true };
  }

  function onPointerMove(event: PointerEvent) {
    if (!pointerOrigin.active) return;
    const dx = event.clientX - pointerOrigin.x;
    const dy = event.clientY - pointerOrigin.y;
    if (scrub == null && Math.abs(dx) < 8) return;
    if (scrub == null && Math.abs(dy) > Math.abs(dx)) return;
    (event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId);
    scrub = scrubAtRatio(points, ratioFromEvent(event), rangeStart, rangeEnd);
  }

  function onPointerUp() {
    pointerOrigin = { x: 0, y: 0, active: false };
    scrub = null;
  }
</script>

<div class="relative">
  <svg
    viewBox="0 0 {width} {height}"
    class="block h-[210px] w-full touch-pan-y"
    preserveAspectRatio="none"
    role="img"
    aria-label={m.cockpit_forecast_hero()}
    data-testid="cockpit-chart"
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#145c4a" stop-opacity="0.9" />
        <stop offset="100%" stop-color="#050505" stop-opacity="0" />
      </linearGradient>
    </defs>
    {#if fillPath}
      <path d={fillPath} fill="url(#{gradientId})" opacity={drawn || !reveal ? 1 : 0.2} />
    {/if}
    {#if fullPath}
      <path
        bind:this={line}
        d={fullPath}
        fill="none"
        stroke="#5ee9c5"
        stroke-width="3"
        stroke-linejoin="round"
        stroke-linecap="round"
        vector-effect="non-scaling-stroke"
      />
    {/if}
    {#if todayRatio != null}
      <line
        x1={todayRatio * width}
        y1="8"
        x2={todayRatio * width}
        y2={height - 8}
        stroke="#8b919a"
        stroke-width="1.5"
        stroke-dasharray="3 5"
        vector-effect="non-scaling-stroke"
        data-testid="cockpit-today"
      />
    {/if}
    {#if todayVisible && todayPoint}
      <circle
        class="today-ring"
        class:quiet={!pageVisible || reduced || scrub != null}
        cx={xOf(todayPoint.date)}
        cy={yOf(todayPoint.balance)}
        r="7"
      />
      <circle cx={xOf(todayPoint.date)} cy={yOf(todayPoint.balance)} r="6.5" fill="#5ee9c5" />
    {/if}
    {#if scrub}
      <circle cx={xOf(scrub.point.date)} cy={yOf(scrub.point.balance)} r="5" fill="#f4f4f5" />
    {/if}
  </svg>
  {#if scrub}
    <div
      class="pointer-events-none absolute z-10 w-max max-w-40 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 shadow-xl"
      style="left: {dateRatio(scrub.point.date, rangeStart, rangeEnd) * 100}%; top: 8px"
      data-testid="cockpit-scrub"
    >
      <p>{scrub.forecast ? m.cockpit_scrub_forecast() : axisDayLabel(scrub.point.date)}</p>
      <p class="font-medium tabular-nums">{formatCurrency(scrub.point.balance)}</p>
    </div>
  {/if}
  <div class="relative mt-1 h-5 text-sm text-slate-400">
    <span class="absolute left-0">{axisDayLabel(rangeStart)}</span>
    {#if todayRatio != null}
      <span
        class="absolute -translate-x-1/2 text-slate-200"
        style="left: {todayRatio * 100}%"
        data-testid="cockpit-today-label">{m.cockpit_today()}</span
      >
    {/if}
    <span class="absolute right-0">{axisDayLabel(rangeEnd)}</span>
  </div>
</div>

<style>
  .today-ring {
    fill: none;
    stroke: #5ee9c5;
    stroke-width: 1.5;
    transform-box: fill-box;
    transform-origin: center;
    animation: cockpit-today-pulse 3s ease-out infinite;
  }
  .today-ring.quiet {
    animation: none;
    opacity: 0;
  }
  @keyframes cockpit-today-pulse {
    0% {
      transform: scale(1);
      opacity: 0.4;
    }
    70% {
      transform: scale(2.5);
      opacity: 0;
    }
    100% {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .today-ring {
      animation: none;
      opacity: 0;
    }
  }
</style>
