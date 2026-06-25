<script lang="ts">
  import { CircleHelp } from "lucide-svelte";
  import { tick } from "svelte";
  import { cn } from "$lib/utils";

  interface Props {
    label: string;
    text: string;
    side?: "top" | "bottom";
  }

  let { label, text, side = "top" }: Props = $props();
  let open = $state(false);
  let panelId = $state(`info-${Math.random().toString(36).slice(2)}`);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let buttonRef = $state<HTMLButtonElement | null>(null);

  function clearCloseTimer() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  }

  function show() {
    clearCloseTimer();
    open = true;
  }

  function scheduleHide() {
    clearCloseTimer();
    closeTimer = setTimeout(() => {
      open = false;
    }, 120);
  }

  function toggle() {
    clearCloseTimer();
    open = !open;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      open = false;
      tick().then(() => buttonRef?.focus());
    }
  }
</script>

<span class="relative inline-flex items-center">
  <button
    bind:this={buttonRef}
    type="button"
    class="focus-visible:ring-accent inline-flex size-5 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
    aria-label={label}
    aria-expanded={open}
    aria-describedby={open ? panelId : undefined}
    onclick={toggle}
    onkeydown={onKeydown}
    onmouseenter={show}
    onmouseleave={scheduleHide}
    onfocus={show}
    onblur={scheduleHide}
  >
    <CircleHelp size={13} strokeWidth={1.9} aria-hidden="true" />
  </button>

  {#if open}
    <span
      id={panelId}
      role="tooltip"
      class={cn(
        "absolute left-1/2 z-50 w-64 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs leading-relaxed text-slate-300 shadow-xl",
        side === "top" ? "bottom-7" : "top-7"
      )}
      onmouseenter={show}
      onmouseleave={scheduleHide}
    >
      {text}
    </span>
  {/if}
</span>
