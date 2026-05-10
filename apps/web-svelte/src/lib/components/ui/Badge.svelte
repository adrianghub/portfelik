<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  interface Props {
    variant: "paid" | "upcoming" | "overdue" | "draft" | "shared";
    class?: string;
    children: Snippet;
  }

  let { variant, class: className, children }: Props = $props();

  const variants: Record<string, string> = {
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/15 dark:text-emerald-400",
    upcoming: "bg-amber-50 text-amber-700 dark:bg-amber-900/15 dark:text-amber-400",
    overdue: "bg-rose-50 text-rose-700 dark:bg-rose-900/15 dark:text-rose-400",
    draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    shared: "bg-blue-50 text-blue-700 dark:bg-blue-900/15 dark:text-blue-400",
  };
</script>

<span
  class={cn(
    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
    variants[variant],
    className
  )}
>
  {@render children()}
</span>
