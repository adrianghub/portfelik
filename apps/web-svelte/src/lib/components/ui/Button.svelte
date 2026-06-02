<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  interface Props {
    variant?: "primary" | "accent" | "ghost" | "danger" | "gradient" | "glass";
    size?: "default" | "sm" | "lg" | "icon";
    loading?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    onclick?: (e: MouseEvent) => void;
    title?: string;
    "aria-expanded"?: boolean;
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
    title,
    "aria-expanded": ariaExpanded,
    children,
    class: className,
  }: Props = $props();

  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:pointer-events-none disabled:opacity-50";

  const gradientLike =
    "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] hover:brightness-110 active:scale-[0.98]";

  const variants = {
    primary: gradientLike,
    gradient: gradientLike,
    accent: gradientLike,
    glass: "border border-white/10 bg-slate-900/60 text-slate-200 backdrop-blur hover:bg-white/5",
    ghost: "border border-white/10 bg-transparent text-slate-300 hover:bg-white/5",
    danger: "bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.25)] hover:bg-rose-400",
  };

  const sizes = {
    default: "h-10 rounded-full px-4 text-sm",
    sm: "h-8 rounded-full px-3 text-xs",
    lg: "h-11 rounded-full px-5 text-sm",
    icon: "h-10 w-10 rounded-full p-0",
  };
</script>

<button
  {type}
  {disabled}
  {onclick}
  {title}
  aria-expanded={ariaExpanded}
  class={cn(base, variants[variant], sizes[size], className)}
>
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
