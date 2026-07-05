<script lang="ts">
  import { tick } from "svelte";

  interface Props {
    targetId: string | null;
    active: boolean;
  }

  let { targetId, active }: Props = $props();

  let rect = $state<DOMRect | null>(null);

  async function measure() {
    if (!active || !targetId || typeof document === "undefined") {
      rect = null;
      return;
    }
    await tick();
    const el = document.querySelector(`[data-tour-id="${targetId}"]`);
    if (!el) {
      rect = null;
      return;
    }
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    await tick();
    rect = el.getBoundingClientRect();
  }

  $effect(() => {
    if (!active || !targetId) {
      rect = null;
      return;
    }
    void targetId;
    void measure();
    const retry = window.setTimeout(() => void measure(), 120);
    const retry2 = window.setTimeout(() => void measure(), 400);
    const onResize = () => void measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.clearTimeout(retry);
      window.clearTimeout(retry2);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  });
</script>

{#if active && rect}
  <div class="pointer-events-none fixed inset-0 z-[55]" aria-hidden="true">
    <div
      class="absolute rounded-2xl ring-2 ring-emerald-400/90 ring-offset-2 ring-offset-transparent transition-[top,left,width,height] duration-200"
      style="
        top: {Math.max(8, rect.top - 4)}px;
        left: {Math.max(8, rect.left - 4)}px;
        width: {rect.width + 8}px;
        height: {rect.height + 8}px;
        box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.72);
      "
    ></div>
  </div>
{/if}
