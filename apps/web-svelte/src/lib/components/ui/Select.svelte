<script lang="ts">
  import { cn } from "$lib/utils";
  import type { Snippet } from "svelte";

  interface Props {
    value?: string;
    onchange?: (e: Event) => void;
    disabled?: boolean;
    id?: string;
    children: Snippet;
    class?: string;
  }

  let { value, onchange, disabled = false, id, children, class: className }: Props = $props();
</script>

<select
  {value}
  {onchange}
  {disabled}
  {id}
  class={cn(
    "select-chevron min-h-10 rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 pr-9 text-sm text-slate-100 backdrop-blur",
    "focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none",
    className
  )}
>
  {@render children()}
</select>
