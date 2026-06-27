<script lang="ts">
  import { ChevronDown } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import type { UserGroup } from "$lib/types";
  import type { DashboardPeriod, ScopeFilter } from "$lib/utils/list-view-url";
  import { cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  let {
    period,
    groupFilter,
    groups = [],
    periodChips,
    onPeriodChange,
    onScopeChange,
  }: {
    period: DashboardPeriod;
    groupFilter: ScopeFilter;
    groups?: UserGroup[];
    periodChips: { value: DashboardPeriod; label: string }[];
    onPeriodChange: (next: DashboardPeriod) => void;
    onScopeChange: (scope: ScopeFilter) => void;
  } = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");
  let scopeOpen = $state(false);

  const hasGroups = $derived(groups.length > 0);

  const activeScopeLabel = $derived.by(() => {
    if (groupFilter === "own") return m.dashboard_scope_own();
    if (groupFilter === "all") return m.dashboard_scope_all();
    return groups.find((g) => g.id === groupFilter)?.name ?? m.dashboard_scope_label();
  });

  function selectScope(scope: ScopeFilter) {
    onScopeChange(scope);
    scopeOpen = false;
  }

  const scopePillClass = (active: boolean) =>
    cn(
      "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
      active ? "bg-white/10 text-slate-100" : "text-slate-400 hover:bg-white/5"
    );
</script>

{#snippet scopeOptions()}
  <div class="flex flex-col gap-2">
    <button
      type="button"
      role="tab"
      aria-selected={groupFilter === "own"}
      onclick={() => selectScope("own")}
      class={cn(scopePillClass(groupFilter === "own"), "w-full px-4 py-2.5 text-left")}
    >
      {m.dashboard_scope_own()}
    </button>
    <button
      type="button"
      role="tab"
      aria-selected={groupFilter === "all"}
      onclick={() => selectScope("all")}
      class={cn(scopePillClass(groupFilter === "all"), "w-full px-4 py-2.5 text-left")}
    >
      {m.dashboard_scope_all()}
    </button>
    {#each groups as g (g.id)}
      <button
        type="button"
        role="tab"
        aria-selected={groupFilter === g.id}
        onclick={() => selectScope(g.id)}
        class={cn(scopePillClass(groupFilter === g.id), "w-full px-4 py-2.5 text-left")}
      >
        {g.name}
      </button>
    {/each}
  </div>
{/snippet}

<div class="flex min-w-0 flex-wrap items-center gap-2">
  <div role="tablist" aria-label="Okres" class="flex gap-1">
    {#each periodChips as chip (chip.value)}
      <button
        type="button"
        role="tab"
        aria-selected={period === chip.value}
        onclick={() => onPeriodChange(chip.value)}
        class={cn(
          "focus-visible:ring-accent rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          period === chip.value
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
            : "border border-white/5 text-slate-300 hover:bg-white/5"
        )}
      >
        {chip.label}
      </button>
    {/each}
  </div>

  {#if hasGroups}
    {#if isDesktop.current}
      <div
        role="tablist"
        aria-label={m.dashboard_scope_all()}
        class="flex flex-wrap gap-1 border-l border-white/10 pl-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === "own"}
          onclick={() => onScopeChange("own")}
          class={scopePillClass(groupFilter === "own")}
        >
          {m.dashboard_scope_own()}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === "all"}
          onclick={() => onScopeChange("all")}
          class={scopePillClass(groupFilter === "all")}
        >
          {m.dashboard_scope_all()}
        </button>
        {#each groups as g (g.id)}
          <button
            type="button"
            role="tab"
            aria-selected={groupFilter === g.id}
            onclick={() => onScopeChange(g.id)}
            class={scopePillClass(groupFilter === g.id)}
          >
            {g.name}
          </button>
        {/each}
      </div>
    {:else}
      <button
        type="button"
        onclick={() => (scopeOpen = true)}
        class="focus-visible:ring-accent ml-auto flex max-w-[min(100%,14rem)] min-w-0 items-center gap-1 rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
        aria-haspopup="dialog"
        aria-expanded={scopeOpen}
      >
        <span class="truncate">{m.dashboard_scope_label()}: {activeScopeLabel}</span>
        <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
      </button>
      <Sheet open={scopeOpen} onclose={() => (scopeOpen = false)} title={m.dashboard_scope_label()}>
        <div class="flex flex-col gap-2 p-4">
          {@render scopeOptions()}
        </div>
      </Sheet>
    {/if}
  {/if}
</div>
