<script lang="ts">
  import CategoryFilter from "$lib/components/transactions/CategoryFilter.svelte";
  import MonthRangePicker from "$lib/components/transactions/MonthRangePicker.svelte";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import * as m from "$lib/paraglide/messages";
  import type { Category } from "$lib/types";
  import { untrack } from "svelte";

  interface Props {
    open: boolean;
    onclose: () => void;
    onapply: (params: {
      startYear: number;
      startMonth: number;
      endYear: number;
      endMonth: number;
      categoryId: string | undefined;
      status: string | undefined;
    }) => void;
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
    categoryId: string | undefined;
    status: string | undefined;
    categories: Category[];
    searchQuery: string;
    onsearchchange: (q: string) => void;
  }

  let {
    open,
    onclose,
    onapply,
    startYear,
    startMonth,
    endYear,
    endMonth,
    categoryId,
    status,
    categories,
    searchQuery,
    onsearchchange,
  }: Props = $props();

  let pendingStartYear = $state(untrack(() => startYear));
  let pendingStartMonth = $state(untrack(() => startMonth));
  let pendingEndYear = $state(untrack(() => endYear));
  let pendingEndMonth = $state(untrack(() => endMonth));
  let pendingCategoryId = $state<string | undefined>(untrack(() => categoryId));
  let pendingStatus = $state<string | undefined>(untrack(() => status));

  $effect(() => {
    if (open) {
      pendingStartYear = startYear;
      pendingStartMonth = startMonth;
      pendingEndYear = endYear;
      pendingEndMonth = endMonth;
      pendingCategoryId = categoryId;
      pendingStatus = status;
    }
  });

  function apply() {
    onapply({
      startYear: pendingStartYear,
      startMonth: pendingStartMonth,
      endYear: pendingEndYear,
      endMonth: pendingEndMonth,
      categoryId: pendingCategoryId,
      status: pendingStatus,
    });
    onclose();
  }

  function clear() {
    const now = new Date();
    pendingStartYear = now.getFullYear();
    pendingStartMonth = now.getMonth() + 1;
    pendingEndYear = now.getFullYear();
    pendingEndMonth = now.getMonth() + 1;
    pendingCategoryId = undefined;
    pendingStatus = undefined;
  }

  const statusOptions = [
    { value: "", label: m.transactions_filter_all_statuses() },
    { value: "paid", label: m.transactions_status_paid() },
    { value: "upcoming", label: m.transactions_status_upcoming() },
    { value: "draft", label: m.transactions_status_draft() },
    { value: "overdue", label: m.transactions_status_overdue() },
  ];
</script>

<Sheet {open} {onclose} title={m.transactions_filter_drawer_title()}>
  <div class="space-y-5 pb-2">
    <!-- Search -->
    <div>
      <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Szukaj</p>
      <input
        type="search"
        value={searchQuery}
        oninput={(e) => onsearchchange((e.target as HTMLInputElement).value)}
        placeholder={m.transactions_search_placeholder()}
        class="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-600"
      />
    </div>

    <!-- Date range -->
    <div>
      <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Zakres dat</p>
      <MonthRangePicker
        startYear={pendingStartYear}
        startMonth={pendingStartMonth}
        endYear={pendingEndYear}
        endMonth={pendingEndMonth}
        onchange={(sy, sm, ey, em) => {
          pendingStartYear = sy;
          pendingStartMonth = sm;
          pendingEndYear = ey;
          pendingEndMonth = em;
        }}
      />
    </div>

    <!-- Category -->
    <div>
      <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Kategoria</p>
      <CategoryFilter
        {categories}
        selectedId={pendingCategoryId}
        onchange={(id) => (pendingCategoryId = id)}
      />
    </div>

    <!-- Status chips -->
    <div>
      <p class="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Status</p>
      <div class="flex flex-wrap gap-2">
        {#each statusOptions as opt (opt.value)}
          <button
            type="button"
            onclick={() => (pendingStatus = opt.value || undefined)}
            class="rounded-full border px-3 py-1 text-xs font-medium transition-colors {(pendingStatus ??
              '') === opt.value
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/15 dark:text-emerald-400'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'}"
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-2 pt-2">
      <button
        type="button"
        onclick={clear}
        class="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {m.transactions_filter_clear()}
      </button>
      <button
        type="button"
        onclick={apply}
        class="flex-1 rounded-lg bg-emerald-500 py-2.5 text-sm font-medium text-white hover:bg-emerald-600"
      >
        {m.transactions_filter_apply()}
      </button>
    </div>
  </div>
</Sheet>
