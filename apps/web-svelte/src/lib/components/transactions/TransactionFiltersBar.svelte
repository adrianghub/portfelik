<script lang="ts">
  import { Search, SlidersHorizontal } from "lucide-svelte";
  import { MediaQuery } from "svelte/reactivity";
  import CategoryFilterControl from "$lib/components/transactions/CategoryFilterControl.svelte";
  import DateRangePicker from "$lib/components/transactions/DateRangePicker.svelte";
  import FiltersMenu from "$lib/components/transactions/FiltersMenu.svelte";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import type { Category, UserGroup } from "$lib/types";
  import type { ScopeFilter } from "$lib/utils/list-view-url";
  import { cn } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  export type TransactionSheetFilters = {
    categoryId: string | undefined;
    type: "income" | "expense" | undefined;
    status: string | undefined;
    group: ScopeFilter;
    view: "unlinked" | "inne" | undefined;
  };

  let {
    stickyRef = $bindable(null),
    visible = true,
    dateLabel,
    explicitStartDate,
    explicitEndDate,
    isDefaultDateFilter,
    categories,
    categoryId,
    typeFilter,
    statusFilter,
    groupFilter,
    viewFilter,
    groups = [],
    searchQueryActive = false,
    onApplyDateRange,
    onClearDateFilter,
    onCategoryChange,
    onTypeChange,
    onStatusChange,
    onClearFilters,
    onGroupChange,
    onViewPreset,
    onApplySheetFilters,
    onToggleSearch,
    searchModalOpen = false,
  }: {
    stickyRef?: HTMLDivElement | null;
    visible?: boolean;
    dateLabel: string;
    explicitStartDate: string | null;
    explicitEndDate: string | null;
    isDefaultDateFilter: boolean;
    categories: Category[];
    categoryId: string | undefined;
    typeFilter: "income" | "expense" | undefined;
    statusFilter: string | undefined;
    groupFilter: ScopeFilter;
    viewFilter: string | undefined;
    groups?: UserGroup[];
    searchQueryActive?: boolean;
    onApplyDateRange: (start: string, end: string) => void;
    onClearDateFilter: () => void;
    onCategoryChange: (id: string | undefined) => void;
    onTypeChange: (type: "income" | "expense" | undefined) => void;
    onStatusChange: (status: string | undefined) => void;
    onClearFilters: () => void;
    onGroupChange: (scope: ScopeFilter) => void;
    onViewPreset: (view: "unlinked" | "inne" | undefined) => void;
    onApplySheetFilters: (filters: TransactionSheetFilters) => void;
    onToggleSearch: () => void;
    searchModalOpen?: boolean;
  } = $props();

  const isDesktop = new MediaQuery("(min-width: 640px)");
  let mobileFiltersOpen = $state(false);

  let draftCategoryId = $state<string | undefined>(undefined);
  let draftType = $state<"income" | "expense" | undefined>(undefined);
  let draftStatus = $state<string | undefined>(undefined);
  let draftGroup = $state<ScopeFilter>("own");
  let draftView = $state<"unlinked" | "inne" | undefined>(undefined);

  const hasGroups = $derived(groups.length > 0);

  const appliedView = $derived(
    viewFilter === "unlinked" || viewFilter === "inne" ? viewFilter : undefined
  );

  const desktopCategories = $derived(
    categories.filter((c) => !typeFilter || c.type === typeFilter)
  );

  const sheetCategories = $derived(categories.filter((c) => !draftType || c.type === draftType));

  const secondaryFilterCount = $derived.by(() => {
    let count = 0;
    if (categoryId) count += 1;
    if (typeFilter) count += 1;
    if (statusFilter) count += 1;
    if (hasGroups && groupFilter !== "own") count += 1;
    if (appliedView) count += 1;
    return count;
  });

  const activePillClass = (active: boolean) =>
    cn(
      "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
      active
        ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
        : "border border-white/5 text-slate-300 hover:bg-white/5"
    );

  function resetDraftFromApplied() {
    draftCategoryId = categoryId;
    draftType = typeFilter;
    draftStatus = statusFilter;
    draftGroup = groupFilter;
    draftView = appliedView;
  }

  function openMobileFilters() {
    resetDraftFromApplied();
    mobileFiltersOpen = true;
  }

  function closeMobileFilters() {
    mobileFiltersOpen = false;
  }

  function setDraftType(type: "income" | "expense" | undefined) {
    draftType = type;
    const selected = categories.find((c) => c.id === draftCategoryId);
    if (selected && type && selected.type !== type) draftCategoryId = undefined;
  }

  function clearDraft() {
    draftCategoryId = undefined;
    draftType = undefined;
    draftStatus = undefined;
    draftGroup = "own";
    draftView = undefined;
  }

  function toggleDraftView(view: "unlinked" | "inne") {
    draftView = draftView === view ? undefined : view;
  }

  function applyDraft() {
    onApplySheetFilters({
      categoryId: draftCategoryId,
      type: draftType,
      status: draftStatus,
      group: draftGroup,
      view: draftView,
    });
    mobileFiltersOpen = false;
  }

  const desktopQuickPresets = $derived([
    {
      key: "unlinked" as const,
      label: m.transactions_view_unlinked(),
      active: appliedView === "unlinked",
      run: () => onViewPreset("unlinked"),
    },
    {
      key: "inne" as const,
      label: m.transactions_view_inne(),
      active: appliedView === "inne",
      run: () => onViewPreset("inne"),
    },
  ]);

  const sheetQuickPresets = $derived([
    {
      key: "unlinked" as const,
      label: m.transactions_view_unlinked(),
      active: draftView === "unlinked",
      run: () => toggleDraftView("unlinked"),
    },
    {
      key: "inne" as const,
      label: m.transactions_view_inne(),
      active: draftView === "inne",
      run: () => toggleDraftView("inne"),
    },
  ]);
</script>

{#if visible}
  <div
    bind:this={stickyRef}
    class="relative sticky top-14 z-30 -mx-4 border-b border-white/5 bg-slate-950"
  >
    <div class="flex items-center gap-2 px-4 py-2">
      <button
        type="button"
        onclick={onToggleSearch}
        class="focus-visible:ring-accent relative hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none md:flex {searchModalOpen
          ? 'border-accent/40 bg-accent/15 text-accent'
          : 'border-white/10 bg-slate-900/60 text-slate-300 hover:bg-white/5'}"
        aria-label={searchModalOpen ? m.transactions_search_close() : m.transactions_search_open()}
        aria-pressed={searchModalOpen}
      >
        <Search size={15} strokeWidth={1.8} aria-hidden="true" />
        {#if searchQueryActive}
          <span class="bg-accent-gradient absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
          ></span>
        {/if}
      </button>

      <div class="shrink-0">
        <DateRangePicker
          label={dateLabel}
          startDate={explicitStartDate}
          endDate={explicitEndDate}
          onchange={onApplyDateRange}
          clearable={!isDefaultDateFilter}
          onclear={onClearDateFilter}
        />
      </div>

      {#if isDesktop.current}
        <CategoryFilterControl
          categories={desktopCategories}
          selectedId={categoryId}
          onchange={onCategoryChange}
        />
        <FiltersMenu
          type={typeFilter}
          status={statusFilter}
          ontypechange={onTypeChange}
          onstatuschange={onStatusChange}
          onclear={onClearFilters}
        />
      {:else}
        <button
          type="button"
          onclick={openMobileFilters}
          class="focus-visible:ring-accent relative flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-3 text-sm font-medium text-slate-300 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
          aria-haspopup="dialog"
          aria-expanded={mobileFiltersOpen}
        >
          <SlidersHorizontal size={14} strokeWidth={1.8} aria-hidden="true" />
          {m.transactions_filters_sheet_title()}
          {#if secondaryFilterCount > 0}
            <span
              class="bg-accent-gradient flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-slate-900"
            >
              {secondaryFilterCount}
            </span>
          {/if}
        </button>
      {/if}
    </div>
  </div>

  {#if !isDesktop.current}
    <Sheet
      open={mobileFiltersOpen}
      onclose={closeMobileFilters}
      title={m.transactions_filters_sheet_title()}
      flush
    >
      <div class="flex max-h-[min(80dvh,100%)] flex-col">
        <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div>
            <p class="text-eyebrow mb-2 text-slate-400">{m.transactions_filter_category()}</p>
            <CategoryFilterControl
              embedded
              categories={sheetCategories}
              selectedId={draftCategoryId}
              onchange={(id) => (draftCategoryId = id)}
            />
          </div>

          <FiltersMenu
            embedded
            type={draftType}
            status={draftStatus}
            ontypechange={setDraftType}
            onstatuschange={(status) => (draftStatus = status)}
            onclear={() => {
              draftType = undefined;
              draftStatus = undefined;
            }}
          />

          {#if hasGroups}
            <div>
              <p class="text-eyebrow mb-2 text-slate-400">{m.dashboard_scope_label()}</p>
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  role="tab"
                  aria-selected={draftGroup === "own"}
                  onclick={() => (draftGroup = "own")}
                  class={activePillClass(draftGroup === "own")}
                >
                  {m.group_filter_own()}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={draftGroup === "all"}
                  onclick={() => (draftGroup = "all")}
                  class={activePillClass(draftGroup === "all")}
                >
                  {m.group_filter_all()}
                </button>
                {#each groups as g (g.id)}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={draftGroup === g.id}
                    onclick={() => (draftGroup = g.id)}
                    class={activePillClass(draftGroup === g.id)}
                  >
                    {g.name}
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <div>
            <p class="text-eyebrow mb-2 text-slate-400">{m.transactions_view_quick()}</p>
            <div class="flex flex-wrap gap-2">
              {#each sheetQuickPresets as preset (preset.key)}
                <button
                  type="button"
                  aria-pressed={preset.active}
                  onclick={preset.run}
                  class={activePillClass(preset.active)}
                >
                  {preset.label}
                </button>
              {/each}
            </div>
          </div>
        </div>

        <div class="flex shrink-0 gap-2 border-t border-white/5 px-4 py-3">
          <button
            type="button"
            onclick={clearDraft}
            class="focus-visible:ring-accent flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
          >
            {m.transactions_filter_clear()}
          </button>
          <button
            type="button"
            onclick={applyDraft}
            class="bg-accent-gradient focus-visible:ring-accent flex-[1.4] rounded-full py-2.5 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none"
          >
            {m.transactions_filter_apply()}
          </button>
        </div>
      </div>
    </Sheet>
  {/if}

  <!-- Scope + quick-view: desktop only (mobile lives in the filters sheet) -->
  <div class="hidden flex-wrap gap-1 sm:flex" role="group">
    {#if hasGroups}
      <div role="tablist" aria-label="Grupa" class="flex flex-wrap gap-1">
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === "own"}
          onclick={() => onGroupChange("own")}
          class={activePillClass(groupFilter === "own")}
        >
          {m.group_filter_own()}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === "all"}
          onclick={() => onGroupChange("all")}
          class={activePillClass(groupFilter === "all")}
        >
          {m.group_filter_all()}
        </button>
        {#each groups as g (g.id)}
          <button
            type="button"
            role="tab"
            aria-selected={groupFilter === g.id}
            onclick={() => onGroupChange(g.id)}
            class={activePillClass(groupFilter === g.id)}
          >
            {g.name}
          </button>
        {/each}
      </div>
    {/if}
    <div class="flex flex-wrap gap-1" aria-label={m.transactions_view_quick()}>
      {#each desktopQuickPresets as preset (preset.key)}
        <button
          type="button"
          aria-pressed={preset.active}
          onclick={preset.run}
          class={activePillClass(preset.active)}
        >
          {preset.label}
        </button>
      {/each}
    </div>
  </div>
{/if}
