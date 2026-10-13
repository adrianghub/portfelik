<script lang="ts">
  import { CircleHelp } from "lucide-svelte";
  import { tick } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import Sheet from "$lib/components/ui/Sheet.svelte";
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
  let pos = $state({ left: 0, top: 0, maxHeight: 240, ready: false });

  const narrow = new MediaQuery("(max-width: 639px)");
  const interactive = $derived(!!(glossaryEntryId && onOpenGlossary));

  const MARGIN = 8;
  const GAP = 8;

  function pxVar(name: string): number {
    if (typeof document === "undefined") return 0;
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  }

  function viewportBounds() {
    const vv = window.visualViewport;
    const viewTop = vv?.offsetTop ?? 0;
    const viewLeft = vv?.offsetLeft ?? 0;
    const viewWidth = vv?.width ?? window.innerWidth;
    const viewHeight = vv?.height ?? window.innerHeight;
    const top = viewTop + Math.max(MARGIN, pxVar("--safe-top"));
    const left = viewLeft + MARGIN;
    const right = viewLeft + viewWidth - MARGIN;
    let bottom = viewTop + viewHeight - Math.max(MARGIN, pxVar("--safe-bottom"));
    for (const selector of [".mobile-bottom-nav", ".mobile-floating-action"]) {
      const node = document.querySelector(selector);
      if (!(node instanceof HTMLElement)) continue;
      const box = node.getBoundingClientRect();
      if (box.height <= 0 || box.top <= top) continue;
      if (box.top < bottom) bottom = box.top - MARGIN;
    }
    return { top, left, right, bottom };
  }

  function reposition() {
    const btn = buttonRef;
    const panel = panelRef;
    if (!btn || !panel) return;
    const bounds = viewportBounds();
    const anchor = btn.getBoundingClientRect();
    const availableWidth = Math.max(160, bounds.right - bounds.left);
    const availableHeight = Math.max(48, bounds.bottom - bounds.top);
    const width = Math.min(panel.offsetWidth || 256, availableWidth);
    const height = Math.min(panel.scrollHeight || panel.offsetHeight || 48, availableHeight);
    let left = anchor.left + anchor.width / 2 - width / 2;
    left = Math.max(bounds.left, Math.min(left, bounds.right - width));

    const spaceAbove = anchor.top - bounds.top;
    const spaceBelow = bounds.bottom - anchor.bottom;
    let placeTop = side === "top";
    if (placeTop && spaceAbove < height + GAP && spaceBelow > spaceAbove) placeTop = false;
    if (!placeTop && spaceBelow < height + GAP && spaceAbove > spaceBelow) placeTop = true;

    let top = placeTop ? anchor.top - GAP - height : anchor.bottom + GAP;
    top = Math.max(bounds.top, Math.min(top, bounds.bottom - height));
    pos = { left, top, maxHeight: availableHeight, ready: true };
  }

  function clearCloseTimer() {
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = null;
  }

  function show() {
    if (narrow.current) return;
    clearCloseTimer();
    open = true;
  }

  function scheduleHide() {
    if (narrow.current) return;
    clearCloseTimer();
    closeTimer = setTimeout(() => {
      const active = document.activeElement;
      if (active && (panelRef?.contains(active) || buttonRef?.contains(active))) return;
      open = false;
    }, 160);
  }

  function closeAndFocus() {
    clearCloseTimer();
    open = false;
    tick().then(() => buttonRef?.focus());
  }

  function toggle() {
    clearCloseTimer();
    open = !open;
  }

  function onTriggerKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      closeAndFocus();
    }
  }

  function openGlossary(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!glossaryEntryId || !onOpenGlossary) return;
    open = false;
    onOpenGlossary(glossaryEntryId);
  }

  function focusInside(node: Node | null): boolean {
    if (!node) return false;
    return buttonRef?.contains(node) === true || panelRef?.contains(node) === true;
  }

  $effect(() => {
    if (!open || narrow.current) return;
    void panelRef;
    void text;
    reposition();
    const onLayout = () => reposition();
    const onPointerDown = (event: PointerEvent) => {
      if (focusInside(event.target as Node | null)) return;
      open = false;
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndFocus();
    };
    const viewport = window.visualViewport;
    window.addEventListener("scroll", onLayout, true);
    window.addEventListener("resize", onLayout);
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeydown);
    viewport?.addEventListener("resize", onLayout);
    viewport?.addEventListener("scroll", onLayout);
    return () => {
      window.removeEventListener("scroll", onLayout, true);
      window.removeEventListener("resize", onLayout);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeydown);
      viewport?.removeEventListener("resize", onLayout);
      viewport?.removeEventListener("scroll", onLayout);
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
    aria-controls={open ? panelId : undefined}
    aria-describedby={open && !interactive ? panelId : undefined}
    onclick={toggle}
    onkeydown={onTriggerKeydown}
    onmouseenter={show}
    onmouseleave={scheduleHide}
    onfocus={show}
    onblur={scheduleHide}
  >
    <CircleHelp size={13} strokeWidth={1.9} aria-hidden="true" />
  </button>

  {#if open && narrow.current}
    <Sheet {open} onclose={() => (open = false)} title={label}>
      <p id={panelId} class="text-sm leading-relaxed text-slate-300">{text}</p>
      {#if glossaryEntryId && onOpenGlossary}
        <button
          type="button"
          class="text-accent mt-3 inline-flex min-h-11 items-center text-sm font-medium hover:underline"
          onclick={openGlossary}
        >
          {m.glossary_learn_more()} →
        </button>
      {/if}
    </Sheet>
  {:else if open}
    <span
      bind:this={panelRef}
      use:portal
      id={panelId}
      role={interactive ? "dialog" : "tooltip"}
      aria-modal={interactive ? "false" : undefined}
      aria-label={interactive ? label : undefined}
      class="fixed z-[70] w-64 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-left text-xs leading-relaxed text-slate-300 shadow-xl"
      style="left:{pos.left}px;top:{pos.top}px;max-height:{pos.maxHeight}px;visibility:{pos.ready
        ? 'visible'
        : 'hidden'}"
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
