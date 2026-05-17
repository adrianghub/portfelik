<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  interface Props {
    children: Snippet;
    /** Higher-emphasis surface for nested cards / inner panels. */
    elevated?: boolean;
    /** Adds a subtle gradient border (used on hero balance card). */
    accent?: boolean;
    /** Extra class names from the consumer. */
    class?: string;
  }

  let { children, elevated = false, accent = false, class: className = "" }: Props = $props();
</script>

<div
  class={cn(
    "relative rounded-2xl p-4",
    elevated ? "surface-hi" : "surface",
    accent &&
      "before:bg-accent-gradient before:absolute before:inset-0 before:-z-10 before:rounded-2xl before:opacity-30 before:blur",
    className
  )}
>
  {@render children()}
</div>
