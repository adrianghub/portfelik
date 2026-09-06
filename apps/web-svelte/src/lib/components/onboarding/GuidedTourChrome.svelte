<script lang="ts">
  import type { TourChapterId } from "$lib/services/guided-tour";
  import { TOUR_CHAPTERS } from "$lib/services/guided-tour";
  import {
    onboardingChromeCopy,
    onboardingExitCopy,
    tourChapterLabel,
  } from "$lib/content/onboarding";
  import { cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    chapter: TourChapterId;
    body: string;
    showExit: boolean;
    canGoBack: boolean;
    isLastScene: boolean;
    step: number;
    totalSteps: number;
    onback: () => void;
    onnext: () => void;
    onskip: () => void;
    onimport: () => void;
    onkeepDemo: () => void;
  }

  let {
    chapter,
    body,
    showExit,
    canGoBack,
    isLastScene,
    step,
    totalSteps,
    onback,
    onnext,
    onskip,
    onimport,
    onkeepDemo,
  }: Props = $props();

  const chrome = onboardingChromeCopy();
  const exit = onboardingExitCopy();
</script>

<div
  class="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
  role="presentation"
  data-guided-tour-chrome
>
  <div
    class="pointer-events-auto w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 shadow-[0_0_40px_rgba(16,185,129,0.12)] backdrop-blur"
    role="dialog"
    aria-modal="true"
    aria-labelledby="guided-tour-title"
  >
    {#if showExit}
      <div class="space-y-4 p-4">
        <p id="guided-tour-title" class="text-sm leading-relaxed text-slate-200">
          {exit.body}
        </p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <a
            href="/import"
            class="bg-accent-gradient focus-visible:ring-accent inline-flex flex-1 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:outline-none"
            onclick={onimport}
          >
            {exit.import}
          </a>
          <button
            type="button"
            class="focus-visible:ring-accent inline-flex flex-1 items-center justify-center rounded-full border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
            onclick={onkeepDemo}
          >
            {exit.keepDemo}
          </button>
        </div>
      </div>
    {:else}
      <div class="border-b border-white/5 px-4 py-3">
        <p id="guided-tour-title" class="sr-only">{chrome.chapterLabel}</p>
        <div class="flex items-center justify-center gap-2" aria-hidden="true">
          {#each TOUR_CHAPTERS as ch, i (ch)}
            {@const active = ch === chapter}
            {@const passed = TOUR_CHAPTERS.indexOf(chapter) > i}
            <span
              class={cn(
                "h-2 w-2 rounded-full transition-colors",
                active && "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]",
                !active && passed && "bg-emerald-400/50",
                !active && !passed && "bg-white/15"
              )}
              title={tourChapterLabel(ch)}
            ></span>
          {/each}
        </div>
        <div
          class="mt-2 flex items-center justify-center gap-2 text-[11px] font-medium tracking-wide text-slate-400 uppercase"
        >
          <span>{tourChapterLabel(chapter)}</span>
          <span aria-hidden="true">·</span>
          <span>{m.tour_step({ step, total: totalSteps })}</span>
        </div>
      </div>

      <div class="space-y-4 p-4">
        <p class="text-sm leading-relaxed text-slate-200">{body}</p>
        <div class="flex items-center justify-between gap-2">
          <button
            type="button"
            class="focus-visible:ring-accent rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-30"
            disabled={!canGoBack}
            onclick={onback}
          >
            {chrome.back}
          </button>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="focus-visible:ring-accent rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
              onclick={onskip}
            >
              {chrome.skip}
            </button>
            <button
              type="button"
              class="bg-accent-gradient focus-visible:ring-accent rounded-full px-4 py-2 text-sm font-semibold text-slate-900 focus-visible:ring-2 focus-visible:outline-none"
              onclick={onnext}
            >
              {isLastScene ? chrome.finish : chrome.next}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
