<script lang="ts">
  import { CircleHelp } from "lucide-svelte";
  import { tick } from "svelte";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    label: string;
    text: string;
    side?: "top" | "bottom";
    glossaryEntryId?: string;
    onOpenGlossary?: (entryId: string) => void;
  }

  let { label, text, side = "top", glossaryEntryId, onOpenGlossary }: Props = $props();
  let open = $state(false);
  let panelId = $state(`info-${Math.random().toString(36).slice(2)}`);
  let closeTimer: ReturnType<typeof setTimeout> | null = null;
  let buttonRef = $state<HTMLButtonElement | null>(null);
  let panelRef = $state<HTMLElement | null>(null);
  let pos = $state({ left: 0, top: 0 });

  const MARGIN = 8;
  const GAP = 8;

  function reposition() {
    const btn = buttonRef;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = panelRef?.offsetWidth ?? 256;
    const ph = panelRef?.offsetHeight ?? 0;

    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(MARGIN, Math.min(left, vw - pw - MARGIN));

    let placeTop = side === "top";
    const fitsTop = r.top - GAP - ph >= MARGIN;
    const fitsBottom = r.bottom + GAP + ph <= vh - MARGIN;
    if (placeTop && !fitsTop && fitsBottom) placeTop = false;
    else if (!placeTop && !fitsBottom && fitsTop) placeTop = true;

    const top = placeTop ? r.top - GAP - ph : r.bottom + GAP;
    pos = { left, top };
  }

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

  function openGlossary(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!glossaryEntryId || !onOpenGlossary) return;
    open = false;
    onOpenGlossary(glossaryEntryId);
  }

  $effect(() => {
    if (!open) return;
    void panelRef;
    reposition();
    const onMove = () => reposition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  });

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
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
      bind:this={panelRef}
      use:portal
      id={panelId}
      role="tooltip"
      class="fixed z-50 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs leading-relaxed text-slate-300 shadow-xl"
      style="left:{pos.left}px;top:{pos.top}px"
      onmouseenter={show}
      onmouseleave={scheduleHide}
    >
      {text}
      {#if glossaryEntryId && onOpenGlossary}
        <button
          type="button"
          class="text-accent mt-2 block font-medium hover:underline"
          onclick={openGlossary}
        >
          {m.glossary_learn_more()} →
        </button>
      {/if}
    </span>
  {/if}
</span>
