<script lang="ts">
  import { tick } from "svelte";

  interface Props {
    targetId: string | null;
    active: boolean;
  }

  let { targetId, active }: Props = $props();

  interface SpotlightRect {
    top: number;
    left: number;
    width: number;
    height: number;
  }

  let rect = $state<SpotlightRect | null>(null);
  let targetElement: HTMLElement | null = null;
  let animationFrame: number | null = null;

  function findTarget(): HTMLElement | null {
    if (targetElement?.isConnected) return targetElement;
    targetElement = targetId
      ? document.querySelector<HTMLElement>(`[data-tour-id="${targetId}"]`)
      : null;
    return targetElement;
  }

  function measure() {
    if (!active || !targetId || typeof document === "undefined") {
      rect = null;
      return;
    }
    const el = findTarget();
    if (!el) {
      rect = null;
      return;
    }

    const measured = el.getBoundingClientRect();
    const top = Math.max(8, measured.top - 4);
    const left = Math.max(8, measured.left - 4);
    rect = {
      top,
      left,
      width: Math.max(0, Math.min(measured.width + 8, window.innerWidth - left - 8)),
      height: Math.max(0, Math.min(measured.height + 8, window.innerHeight - top - 8)),
    };
  }

  async function revealTarget() {
    if (!active || !targetId || typeof document === "undefined") return;
    await tick();
    const el = findTarget();
    if (!el) {
      rect = null;
      return;
    }

    const chrome = document.querySelector<HTMLElement>("[data-guided-tour-chrome]");
    const chromeHeight = chrome?.getBoundingClientRect().height ?? 190;
    const visibleTop = 72;
    const visibleBottom = Math.max(visibleTop + 96, window.innerHeight - chromeHeight - 24);
    const measured = el.getBoundingClientRect();

    if (measured.top < visibleTop || measured.bottom > visibleBottom) {
      const targetCenter = measured.top + measured.height / 2;
      const visibleCenter = (visibleTop + visibleBottom) / 2;
      window.scrollBy({ top: targetCenter - visibleCenter, behavior: "auto" });
      await tick();
    }
    measure();
  }

  function onViewportChange() {
    if (animationFrame !== null) return;
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = null;
      measure();
    });
  }

  $effect(() => {
    if (!active || !targetId) {
      rect = null;
      return;
    }
    void targetId;
    targetElement = null;
    const retries = [0, 100, 300, 700].map((delay) =>
      window.setTimeout(() => void revealTarget(), delay)
    );
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    return () => {
      retries.forEach((retry) => window.clearTimeout(retry));
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      targetElement = null;
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  });
</script>

{#if active && rect}
  <div class="pointer-events-none fixed inset-0 z-[55]" aria-hidden="true">
    <div
      class="absolute rounded-2xl ring-2 ring-emerald-400/90 ring-offset-2 ring-offset-transparent transition-[top,left,width,height] duration-200"
      style="
        top: {rect.top}px;
        left: {rect.left}px;
        width: {rect.width}px;
        height: {rect.height}px;
        box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.72);
      "
    ></div>
  </div>
{/if}
