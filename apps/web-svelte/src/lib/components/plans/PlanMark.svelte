<script lang="ts">
  import VisualIcon from "$lib/components/ui/VisualIcon.svelte";
  import type { PlanKind } from "$lib/types";

  interface Props {
    kind: PlanKind;
    size?: "sm" | "md";
    name?: string | null;
  }

  let { kind, size = "md", name = null }: Props = $props();

  const box = $derived(size === "sm" ? "h-7 w-7" : "h-10 w-10");
  const icon = $derived(size === "sm" ? 14 : 18);
</script>

<span
  class="flex {box} shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300"
  aria-hidden="true"
>
  <VisualIcon
    name={name ?? (kind === "debt" ? "landmark" : kind === "spend" ? "plane" : "target")}
    size={icon}
  />
</span>
