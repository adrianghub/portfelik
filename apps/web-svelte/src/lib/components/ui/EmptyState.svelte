<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  interface Props {
    title: string;
    body?: string;
    /** Lucide-style icon snippet (caller draws the SVG). */
    icon?: Snippet;
    /** Optional primary CTA snippet (caller renders a Button etc.). */
    action?: Snippet;
    /** Extra class names from the consumer. */
    class?: string;
  }

  let { title, body, icon, action, class: className = "" }: Props = $props();
</script>

<div
  class={cn(
    "flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/5 bg-slate-900/60 px-6 py-12 text-center backdrop-blur",
    className
  )}
>
  {#if icon}
    <div class="text-slate-400">
      {@render icon()}
    </div>
  {/if}
  <h3 class="text-base font-semibold text-slate-100">{title}</h3>
  {#if body}
    <p class="max-w-xs text-sm text-slate-400">{body}</p>
  {/if}
  {#if action}
    <div class="mt-2">
      {@render action()}
    </div>
  {/if}
</div>
