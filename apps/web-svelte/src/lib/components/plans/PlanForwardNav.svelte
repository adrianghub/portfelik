<script lang="ts">
  import { cn } from "$lib/utils";
  import { ChevronRight } from "lucide-svelte";

  interface Props {
    href: string;
    title: string;
    subtitle?: string;
    ariaLabel?: string;
    variant?: "info" | "action";
  }

  let { href, title, subtitle, ariaLabel, variant = "action" }: Props = $props();
</script>

<a
  {href}
  class={cn(
    "nav-forward group focus-visible:ring-accent flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors focus-visible:ring-2 focus-visible:outline-none",
    variant === "info"
      ? "border-sky-500/25 bg-sky-500/10 hover:border-sky-500/40 hover:bg-sky-500/15"
      : "border-white/10 bg-slate-900/50 hover:border-white/20 hover:bg-slate-900/70"
  )}
  aria-label={ariaLabel ?? title}
>
  <div class="min-w-0 flex-1 text-left">
    <p
      class={cn(
        "text-sm leading-snug font-medium",
        variant === "info" ? "text-sky-100" : "text-slate-100"
      )}
    >
      {title}
    </p>
    {#if subtitle}
      <p class="mt-0.5 text-xs text-slate-400">{subtitle}</p>
    {/if}
  </div>
  <ChevronRight
    size={18}
    strokeWidth={2}
    class={cn(
      "nav-forward-arrow shrink-0",
      variant === "info" ? "text-sky-300" : "text-slate-400 group-hover:text-slate-200"
    )}
    aria-hidden="true"
  />
</a>
