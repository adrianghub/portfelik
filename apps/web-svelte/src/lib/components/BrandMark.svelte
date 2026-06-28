<script lang="ts">
  import { cn } from "$lib/utils";

  interface Props {
    size?: "sm" | "md";
    showText?: boolean;
    class?: string;
  }

  let { size = "md", showText = true, class: className }: Props = $props();

  const iconSize = $derived(size === "sm" ? "h-7 w-7" : "h-8 w-8");
  const textSize = $derived(size === "sm" ? "text-sm" : "text-base");
</script>

<span class={cn("inline-flex items-center gap-2 text-slate-100", className)}>
  <img src="/jakstoimy-mark.svg" alt="" class={cn(iconSize, "shrink-0 rounded-lg")} />
  {#if showText}
    <span class={cn(textSize, "font-semibold tracking-tight")}>
      Jak<span class="text-accent">$</span>toimy
    </span>
  {/if}
</span>
