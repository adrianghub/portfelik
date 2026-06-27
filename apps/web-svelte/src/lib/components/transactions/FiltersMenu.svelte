<script lang="ts">
  import { SlidersHorizontal } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    type: "income" | "expense" | undefined;
    status: string | undefined;
    ontypechange: (type: "income" | "expense" | undefined) => void;
    onstatuschange: (status: string | undefined) => void;
    onclear: () => void;
    /** Render body only — for embedding inside a parent filters sheet on mobile. */
    embedded?: boolean;
  }

  let { type, status, ontypechange, onstatuschange, onclear, embedded = false }: Props = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");
  let open = $state(false);

  const activeCount = $derived((type ? 1 : 0) + (status ? 1 : 0));

  const typeOptions: { value: "income" | "expense" | ""; label: string }[] = [
    { value: "", label: m.transactions_filter_all_types() },
    { value: "income", label: m.common_income() },
    { value: "expense", label: m.common_expense() },
  ];

  const statusOptions = [
    { value: "", label: m.transactions_filter_all_statuses() },
    { value: "paid", label: m.transactions_status_paid() },
    { value: "upcoming", label: m.transactions_status_upcoming() },
    { value: "draft", label: m.transactions_status_draft() },
    { value: "overdue", label: m.transactions_status_overdue() },
  ];

  function clickOutside(e: MouseEvent) {
    if (embedded) return;
    const t = e.target as HTMLElement;
    if (!t.closest("[data-filters-menu]")) open = false;
  }
</script>

{#snippet body()}
  <div class="space-y-5">
    <div>
      <p class="text-eyebrow mb-2 text-slate-400">{m.transactions_filter_type_label()}</p>
      <div class="flex flex-wrap gap-2">
        {#each typeOptions as opt (opt.value)}
          <button
            type="button"
            onclick={() =>
              ontypechange((opt.value || undefined) as "income" | "expense" | undefined)}
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors {(type ?? '') ===
            opt.value
              ? 'bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]'
              : 'border border-white/10 text-slate-300 hover:bg-white/5'}"
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <div>
      <p class="text-eyebrow mb-2 text-slate-400">{m.transactions_filter_status_label()}</p>
      <div class="flex flex-wrap gap-2">
        {#each statusOptions as opt (opt.value)}
          <button
            type="button"
            onclick={() => onstatuschange(opt.value || undefined)}
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors {(status ?? '') ===
            opt.value
              ? 'bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]'
              : 'border border-white/10 text-slate-300 hover:bg-white/5'}"
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    {#if activeCount > 0}
      <button
        type="button"
        onclick={onclear}
        class="w-full rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5"
      >
        {m.transactions_filter_clear()}
      </button>
    {/if}
  </div>
{/snippet}

<svelte:window onclick={clickOutside} />

{#if embedded}
  {@render body()}
{:else}
  <div class="relative shrink-0" data-filters-menu>
    <button
      type="button"
      onclick={() => (open = !open)}
      class="focus-visible:ring-accent relative flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3.5 text-sm font-medium text-slate-300 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <SlidersHorizontal size={14} strokeWidth={1.8} aria-hidden="true" />
      {m.transactions_filter_button()}
      {#if activeCount > 0}
        <span
          class="bg-accent-gradient absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-slate-900"
        >
          {activeCount}
        </span>
      {/if}
    </button>

    {#if open && isDesktop.current}
      <div
        class="absolute top-11 right-0 z-50 w-72 overflow-hidden rounded-2xl border border-white/5 bg-slate-900/95 p-4 shadow-[0_0_40px_rgba(0,0,0,0.4)] backdrop-blur"
        role="dialog"
        aria-label={m.transactions_filter_button()}
      >
        {@render body()}
      </div>
    {/if}
  </div>

  {#if !isDesktop.current}
    <Sheet {open} onclose={() => (open = false)} title={m.transactions_filter_button()}>
      {@render body()}
    </Sheet>
  {/if}
{/if}
