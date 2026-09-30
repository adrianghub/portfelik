<script lang="ts">
  import { Download, MoreHorizontal, Plus } from "lucide-svelte";
  import { tick } from "svelte";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    exportDisabled: boolean;
    onexport: () => void;
    onmanualadd: () => void;
  }

  let { exportDisabled, onexport, onmanualadd }: Props = $props();

  const menuId = $props.id();
  const MENU_WIDTH = 208;
  const VIEWPORT_GAP = 8;

  let open = $state(false);
  let triggerRef = $state<HTMLButtonElement | null>(null);
  let menuRef = $state<HTMLDivElement | null>(null);
  let menuStyle = $state("");

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  function updatePosition() {
    if (!triggerRef) return;
    const trigger = triggerRef.getBoundingClientRect();
    const measuredHeight = menuRef?.offsetHeight ?? 92;
    const left = Math.min(
      window.innerWidth - MENU_WIDTH - VIEWPORT_GAP,
      Math.max(VIEWPORT_GAP, trigger.right - MENU_WIDTH)
    );
    const below = trigger.bottom + 4;
    const openAbove = below + measuredHeight > window.innerHeight - VIEWPORT_GAP;
    const top = openAbove ? Math.max(VIEWPORT_GAP, trigger.top - measuredHeight - 4) : below;
    menuStyle = `top:${top}px;left:${left}px;width:${MENU_WIDTH}px`;
  }

  function closeMenu({ restoreFocus = false } = {}) {
    open = false;
    if (restoreFocus) void tick().then(() => triggerRef?.focus());
  }

  function menuItems() {
    return Array.from(
      menuRef?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []
    ).filter((item) => item.offsetParent !== null);
  }

  function openMenu(focus: "first" | "last" = "first") {
    updatePosition();
    open = true;
    void tick().then(() => {
      updatePosition();
      const items = menuItems();
      items[focus === "last" ? items.length - 1 : 0]?.focus();
    });
  }

  function toggleMenu() {
    if (open) {
      closeMenu();
      return;
    }
    openMenu();
  }

  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    if (!open) openMenu(event.key === "ArrowUp" ? "last" : "first");
  }

  function onMenuKeydown(event: KeyboardEvent) {
    if (event.key === "Tab") {
      closeMenu();
      return;
    }

    const items = menuItems();
    if (items.length === 0) return;
    const activeIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;

    if (event.key === "ArrowDown") nextIndex = (activeIndex + 1) % items.length;
    if (event.key === "ArrowUp") nextIndex = (activeIndex - 1 + items.length) % items.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    items[nextIndex]?.focus();
  }

  $effect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target || triggerRef?.contains(target) || menuRef?.contains(target)) return;
      closeMenu();
    }

    function onKeydown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu({ restoreFocus: true });
    }

    function onViewportChange() {
      updatePosition();
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  });
</script>

<div class="shrink-0">
  <button
    bind:this={triggerRef}
    type="button"
    class="focus-visible:ring-accent flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-slate-900/60 text-slate-200 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none sm:h-9 sm:w-9"
    aria-label={m.transactions_more_actions()}
    aria-haspopup="menu"
    aria-controls={open ? menuId : undefined}
    aria-expanded={open}
    onclick={toggleMenu}
    onkeydown={onTriggerKeydown}
  >
    <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
  </button>

  {#if open}
    <div
      bind:this={menuRef}
      use:portal
      id={menuId}
      role="menu"
      tabindex="-1"
      aria-label={m.transactions_more_actions()}
      onkeydown={onMenuKeydown}
      style={menuStyle}
      class="fixed z-50 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-[0_0_30px_rgba(0,0,0,0.5)] backdrop-blur"
    >
      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/5 md:hidden"
        onclick={() => {
          closeMenu();
          onmanualadd();
        }}
      >
        <Plus size={15} strokeWidth={1.8} aria-hidden="true" />
        {m.transaction_manual_add()}
      </button>
      <button
        type="button"
        role="menuitem"
        class="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={exportDisabled}
        onclick={() => {
          closeMenu();
          onexport();
        }}
      >
        <Download size={15} strokeWidth={1.8} aria-hidden="true" />
        {m.csv_export()}
      </button>
    </div>
  {/if}
</div>
