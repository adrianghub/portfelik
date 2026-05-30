<script module lang="ts">
  let openSheetCount = 0;

  function syncMobileOverlayClass() {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("mobile-overlay-open", openSheetCount > 0);
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { X } from "lucide-svelte";
  import { fade, fly } from "svelte/transition";
  import { cubicOut } from "svelte/easing";
  import { motionDuration } from "$lib/motion";

  interface Props {
    open: boolean;
    onclose: () => void;
    title?: string;
    /** id of an external element that labels the dialog when `title` is omitted. */
    labelledBy?: string;
    /** Skip body padding — for panels that bring their own full-bleed header/list chrome. */
    flush?: boolean;
    children: Snippet;
  }

  let { open, onclose, title, labelledBy, flush = false, children }: Props = $props();

  const DISMISS_DRAG_PX = 96;

  let dragY = $state(0);
  let dragging = $state(false);
  let dragStartY = 0;

  const backdropOpacity = $derived(Math.max(0.15, 0.6 - dragY / 420));

  function onbackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") onclose();
  }

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function onHandlePointerDown(e: PointerEvent) {
    dragging = true;
    dragStartY = e.clientY;
    dragY = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onHandlePointerMove(e: PointerEvent) {
    if (!dragging) return;
    dragY = Math.max(0, e.clientY - dragStartY);
  }

  function finishDrag() {
    if (!dragging) return;
    dragging = false;
    if (dragY > DISMISS_DRAG_PX) {
      dragY = 0;
      onclose();
      return;
    }
    dragY = 0;
  }

  function onHandlePointerUp(e: PointerEvent) {
    finishDrag();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }

  function onHandlePointerCancel() {
    dragging = false;
    dragY = 0;
  }

  $effect(() => {
    if (!open || typeof document === "undefined") return;
    openSheetCount += 1;
    syncMobileOverlayClass();
    return () => {
      openSheetCount = Math.max(0, openSheetCount - 1);
      syncMobileOverlayClass();
    };
  });

  $effect(() => {
    if (open) return;
    dragging = false;
    dragY = 0;
  });
</script>

<svelte:window {onkeydown} />

{#if open}
  <div
    use:portal
    class="sheet-backdrop fixed inset-0 z-[100] flex items-end justify-center backdrop-blur-sm"
    class:sheet-backdrop--dragging={dragging}
    style:background-color={`rgb(2 6 23 / ${backdropOpacity})`}
    role="presentation"
    onclick={onbackdrop}
    onkeydown={null}
    transition:fade={{ duration: motionDuration(180), easing: cubicOut }}
  >
    <div
      class="sheet-panel flex max-h-[min(90dvh,100%)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-white/5 bg-slate-900/95 shadow-[0_-12px_40px_rgba(0,0,0,0.4)] backdrop-blur"
      class:sheet-panel--dragging={dragging}
      style:transform={dragY > 0 ? `translateY(${dragY}px)` : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "sheet-title" : labelledBy}
      tabindex="-1"
      transition:fly={{ y: "100%", duration: motionDuration(320), easing: cubicOut, opacity: 1 }}
    >
      <div
        class="flex shrink-0 touch-none justify-center pt-3 pb-1 select-none"
        role="presentation"
        aria-hidden="true"
        onpointerdown={onHandlePointerDown}
        onpointermove={onHandlePointerMove}
        onpointerup={onHandlePointerUp}
        onpointercancel={onHandlePointerCancel}
      >
        <div class="rounded-full px-8 py-3" role="presentation" aria-hidden="true">
          <span
            class="block h-1 rounded-full bg-white/20 transition-[width,background-color,transform] duration-150 {dragging
              ? 'w-12 bg-white/35'
              : 'w-10'}"
          ></span>
        </div>
      </div>

      {#if title}
        <div class="flex shrink-0 items-center justify-between border-b border-white/5 px-5 py-3">
          <h2 id="sheet-title" class="text-base font-semibold text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onclick={onclose}
            class="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
            aria-label="Zamknij"
          >
            <X size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      {/if}

      <div
        class={flush
          ? "min-h-0 flex-1 overflow-hidden"
          : "min-h-0 flex-1 overflow-y-auto px-5 py-4"}
      >
        {@render children()}
      </div>
    </div>
  </div>
{/if}
