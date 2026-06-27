<script lang="ts">
  import type { CategorySummary } from "$lib/types";
  import { formatCurrency, cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";
  import { ChevronDown } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { untrack } from "svelte";

  interface Props {
    categories: CategorySummary[];
    oncategoryclick?: (categoryId: string) => void;
  }
  let { categories, oncategoryclick }: Props = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");
  // Accordion on both breakpoints: open by default on desktop, collapsed on mobile.
  let expanded = $state(untrack(() => isDesktop.current));
  const expenses = $derived(categories.filter((c) => c.type === "expense"));
</script>

{#if expenses.length > 0}
  <div class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3"
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
    >
      <span class="text-eyebrow text-slate-300">{m.summary_by_category()}</span>
      <ChevronDown
        size={17}
        strokeWidth={1.8}
        class={cn(
          "text-slate-400 transition-transform duration-300 ease-out",
          expanded && "rotate-180"
        )}
        aria-hidden="true"
      />
    </button>
    <div class={cn("expand-grid", expanded && "expand-grid--open")} aria-hidden={!expanded}>
      <div class="expand-grid-inner">
        <div class="expand-grid-panel">
          <ul class="mt-3 space-y-2">
            {#each expenses as cat (cat.category_id)}
              <li class="flex items-center gap-2">
                {#if oncategoryclick}
                  <button
                    onclick={() => oncategoryclick(cat.category_id)}
                    class="min-w-0 flex-1 text-left transition-opacity hover:opacity-70"
                  >
                    <div class="flex items-baseline justify-between">
                      <span class="truncate text-sm text-slate-300">{cat.category_name}</span>
                      <span class="ml-2 shrink-0 text-sm font-medium text-slate-100"
                        >{formatCurrency(cat.total)}</span
                      >
                    </div>
                    <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        class="bg-accent-gradient h-full rounded-full shadow-[0_0_12px_var(--color-accent-glow)]"
                        style="width: {cat.percentage}%"
                      ></div>
                    </div>
                  </button>
                {:else}
                  <div class="min-w-0 flex-1">
                    <div class="flex items-baseline justify-between">
                      <span class="truncate text-sm text-slate-300">{cat.category_name}</span>
                      <span class="ml-2 shrink-0 text-sm font-medium text-slate-100"
                        >{formatCurrency(cat.total)}</span
                      >
                    </div>
                    <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div
                        class="bg-accent-gradient h-full rounded-full shadow-[0_0_12px_var(--color-accent-glow)]"
                        style="width: {cat.percentage}%"
                      ></div>
                    </div>
                  </div>
                {/if}
                <span class="w-10 shrink-0 text-right text-xs text-slate-400"
                  >{cat.percentage}%</span
                >
              </li>
            {/each}
          </ul>
        </div>
      </div>
    </div>
  </div>
{:else}
  <p class="py-4 text-center text-sm text-slate-400">{m.summary_no_expenses()}</p>
{/if}
