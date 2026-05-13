<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  interface Props {
    variant?: "primary" | "accent" | "ghost" | "danger";
    size?: "default" | "sm" | "lg";
    loading?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
    class?: string;
  }

  let {
    variant = "primary",
    size = "default",
    loading = false,
    disabled = false,
    type = "button",
    onclick,
    children,
    class: className,
  }: Props = $props();

  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-emerald-400 dark:focus-visible:ring-offset-slate-900 disabled:pointer-events-none disabled:opacity-50";

  const variants = {
    primary:
      "bg-slate-900 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200",
    accent: "bg-emerald-500 text-white hover:bg-emerald-600 dark:hover:bg-emerald-400",
    ghost:
      "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
    danger: "bg-rose-600 text-white hover:bg-rose-700",
  };

  const sizes = {
    default: "h-10 rounded-lg px-4 text-sm",
    sm: "h-8 rounded-lg px-3 text-xs",
    lg: "h-11 rounded-lg px-5 text-sm",
  };
</script>

<button {type} {disabled} {onclick} class={cn(base, variants[variant], sizes[size], className)}>
  {#if loading}
    <svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  {/if}
  {@render children()}
</button>
