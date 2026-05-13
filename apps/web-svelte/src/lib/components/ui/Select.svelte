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
    "min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 focus:outline-none",
    "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100",
    className
  )}
>
  {@render children()}
</select>
