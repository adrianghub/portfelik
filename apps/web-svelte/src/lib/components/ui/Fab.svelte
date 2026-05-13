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
  class="fixed right-6 bottom-20 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition-transform hover:bg-emerald-600 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95 md:hidden"
  style="margin-bottom: env(safe-area-inset-bottom);"
>
  {#if icon}
    {@render icon()}
  {:else}
    <Plus size={24} aria-hidden="true" />
  {/if}
</button>
