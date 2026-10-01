<script lang="ts">
  import { tick } from "svelte";
  import { focusFirstInOverlay, trapOverlayTab } from "$lib/focus-trap";
  import * as m from "$lib/paraglide/messages";
  import { fade, scale } from "svelte/transition";
  import { motionDuration } from "$lib/motion";
  import { hideMobileChrome, registerNativeOverlayCloser } from "$lib/services/native-overlay";

  interface Props {
    open: boolean;
    message: string;
    onconfirm: () => void;
    onclose: () => void;
    pending?: boolean;
    /** Dialog title; defaults to delete confirmation. */
    title?: string;
    /** Confirm button label; defaults to Delete. */
    confirmLabel?: string;
    /** Visual intent for the confirm button. */
    intent?: "danger" | "neutral";
  }
  let {
    open,
    message,
    onconfirm,
    onclose,
    pending = false,
    title = m.common_confirm_delete(),
    confirmLabel = m.common_delete(),
    intent = "danger",
  }: Props = $props();

  const id = $props.id();
  const titleId = `${id}-title`;
  const descId = `${id}-description`;
  let panel = $state<HTMLElement | null>(null);

  function requestClose(): false | void {
    if (pending) return false;
    onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if (!open || e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      requestClose();
    } else if (panel) trapOverlayTab(e, panel);
  }

  function onbackdrop(e: MouseEvent) {
    if (e.target === e.currentTarget) requestClose();
  }

  $effect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    tick().then(() => {
      if (open && panel) focusFirstInOverlay(panel);
    });
    const releaseChrome = hideMobileChrome();
    const unregister = registerNativeOverlayCloser(requestClose);
    return () => {
      unregister();
      releaseChrome();
      queueMicrotask(() => previousFocus?.focus({ preventScroll: true }));
    };
  });

  const confirmClass = $derived(
    intent === "neutral"
      ? "flex-1 rounded-full border border-accent/30 bg-accent/15 py-2 text-sm font-semibold text-accent shadow-[0_0_18px_rgba(56,189,248,0.2)] backdrop-blur transition-colors hover:bg-accent/25 disabled:opacity-50"
      : "flex-1 rounded-full border border-rose-400/20 bg-rose-500/15 py-2 text-sm font-semibold text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.25)] backdrop-blur transition-colors hover:bg-rose-500/25 disabled:opacity-50"
  );
</script>

<svelte:window {onkeydown} />

{#if open}
  <div
    class="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/70 px-4 pb-[max(1rem,var(--safe-bottom))] backdrop-blur-sm sm:items-center sm:pb-0"
    role="presentation"
    onclick={onbackdrop}
    onkeydown={null}
    transition:fade={{ duration: motionDuration(140) }}
  >
    <div
      bind:this={panel}
      class="w-full max-w-sm space-y-4 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/95 p-5 shadow-[0_0_60px_rgba(244,63,94,0.12)] backdrop-blur"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      tabindex="-1"
      transition:scale={{ duration: motionDuration(180), start: 0.95, opacity: 0 }}
    >
      <h2 id={titleId} class="text-base font-semibold text-slate-100">
        {title}
      </h2>
      <p id={descId} class="text-sm text-slate-400">{message}</p>
      <div class="flex gap-2">
        <button
          type="button"
          onclick={requestClose}
          disabled={pending}
          class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
        >
          {m.common_cancel()}
        </button>
        <button type="button" onclick={onconfirm} disabled={pending} class={confirmClass}>
          {pending ? m.common_saving() : confirmLabel}
        </button>
      </div>
    </div>
  </div>
{/if}
