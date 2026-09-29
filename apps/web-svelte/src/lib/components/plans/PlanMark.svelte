<script lang="ts">
  import { Landmark, Target } from "lucide-svelte";
  import type { PlanKind } from "$lib/types";

  interface Props {
    kind: PlanKind;
    size?: "sm" | "md";
  }

  let { kind, size = "md" }: Props = $props();

  const box = $derived(size === "sm" ? "h-7 w-7" : "h-10 w-10");
  const icon = $derived(size === "sm" ? 14 : 18);
</script>

<span
  class="flex {box} shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300"
  aria-hidden="true"
>
  {#if kind === "debt"}
    <Landmark size={icon} strokeWidth={1.7} />
  {:else}
    <Target size={icon} strokeWidth={1.7} />
  {/if}
</span>
