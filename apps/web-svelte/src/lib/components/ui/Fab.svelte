<script lang="ts">
  import { Plus } from "lucide-svelte";
  import type { Snippet } from "svelte";

  interface Props {
    onclick: () => void;
    "aria-label": string;
    icon?: Snippet;
  }

  let { onclick, "aria-label": ariaLabel, icon }: Props = $props();
</script>

<button
  type="button"
  {onclick}
  aria-label={ariaLabel}
  class="mobile-floating-action bg-accent-gradient fixed right-4 bottom-(--mobile-action-bottom) z-40 flex h-14 w-14 items-center justify-center rounded-full text-slate-900 shadow-[0_0_24px_var(--color-accent-glow)] transition-all hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 focus-visible:outline-none active:scale-95 md:hidden"
>
  {#if icon}
    {@render icon()}
  {:else}
    <Plus size={24} aria-hidden="true" />
  {/if}
</button>
