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
      type: "income" | "expense" | undefined;
    }) => void;
    startYear: number;
    startMonth: number;
    endYear: number;
    endMonth: number;
    categoryId: string | undefined;
    status: string | undefined;
    type: "income" | "expense" | undefined;
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
    type,
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
  let pendingType = $state<"income" | "expense" | undefined>(untrack(() => type));

  $effect(() => {
    if (open) {
      pendingStartYear = startYear;
      pendingStartMonth = startMonth;
      pendingEndYear = endYear;
      pendingEndMonth = endMonth;
      pendingCategoryId = categoryId;
      pendingStatus = status;
      pendingType = type;
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
      type: pendingType,
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
    pendingType = undefined;
  }

  const typeOptions: { value: "income" | "expense" | ""; label: string }[] = [
    { value: "", label: m.transactions_filter_all_statuses() },
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
</script>

<Sheet {open} {onclose} title={m.transactions_filter_drawer_title()}>
  <div class="space-y-5 pb-2">
    <!-- Search -->
    <div>
      <p class="text-eyebrow mb-2 text-slate-400">Szukaj</p>
      <input
        type="search"
        value={searchQuery}
        oninput={(e) => onsearchchange((e.target as HTMLInputElement).value)}
        placeholder={m.transactions_search_placeholder()}
        class="min-h-10 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      />
    </div>

    <!-- Date range -->
    <div>
      <p class="text-eyebrow mb-2 text-slate-400">Zakres dat</p>
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
      <p class="text-eyebrow mb-2 text-slate-400">Kategoria</p>
      <CategoryFilter
        {categories}
        selectedId={pendingCategoryId}
        onchange={(id) => (pendingCategoryId = id)}
      />
    </div>

    <!-- Type chips -->
    <div>
      <p class="text-eyebrow mb-2 text-slate-400">Typ</p>
      <div class="flex flex-wrap gap-2">
        {#each typeOptions as opt (opt.value)}
          <button
            type="button"
            onclick={() =>
              (pendingType = (opt.value || undefined) as "income" | "expense" | undefined)}
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors {(pendingType ??
              '') === opt.value
              ? 'bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]'
              : 'border border-white/10 text-slate-300 hover:bg-white/5'}"
          >
            {opt.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Status chips -->
    <div>
      <p class="text-eyebrow mb-2 text-slate-400">Status</p>
      <div class="flex flex-wrap gap-2">
        {#each statusOptions as opt (opt.value)}
          <button
            type="button"
            onclick={() => (pendingStatus = opt.value || undefined)}
            class="rounded-full px-3 py-1 text-xs font-medium transition-colors {(pendingStatus ??
              '') === opt.value
              ? 'bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]'
              : 'border border-white/10 text-slate-300 hover:bg-white/5'}"
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
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2.5 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.transactions_filter_clear()}
      </button>
      <button
        type="button"
        onclick={apply}
        class="bg-accent-gradient flex-1 rounded-full py-2.5 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
      >
        {m.transactions_filter_apply()}
      </button>
    </div>
  </div>
</Sheet>
