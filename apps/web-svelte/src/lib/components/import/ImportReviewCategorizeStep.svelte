<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { Snippet } from "svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import CategorySelect from "$lib/components/transactions/CategorySelect.svelte";
  import type { ImportRow } from "$lib/services/bank-import";
  import type { ImportRowFilter } from "$lib/import/filter-rows";
  import type { Category, CategorizationRule, UserGroup } from "$lib/types";
  import { cn, formatCurrency } from "$lib/utils";
  import { ChevronDown, Users } from "lucide-svelte";

  type FilterKind = "pending" | "all" | "uncategorized" | "income" | "expense";
  type SortKind = "original" | "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

  interface Props {
    parseErrorCount: number;
    skippedRowCount: number;
    largeRowCount: number;
    bulkImportableVisibleCount: number;
    bulkRestorableVisibleCount: number;
    filter: FilterKind;
    filterCounts: Record<FilterKind, number>;
    filterOptions: { kind: FilterKind; label: string }[];
    visibleRows: ImportRow[];
    advancedFilter: ImportRowFilter;
    advancedActive: boolean;
    onclearfilter: () => void;
    filterCategories: Category[];
    totalActiveRows: number;
    groups: UserGroup[];
    categoriesFor: (type: "income" | "expense") => Category[];
    createCategoryInline: (name: string, type: "income" | "expense") => Promise<string | null>;
    matchedRuleFor: (row: ImportRow) => CategorizationRule | null;
    spanNudge: { spanDays: number; cadenceDays: number } | null;
    inspectedRule: CategorizationRule | null;
    inspectedRuleCount: number;
    onClearInspectedRule: () => void;
    canUndo: boolean;
    onUndo: () => void;
    onFilterChange: (kind: FilterKind) => void;
    onClearFilter: () => void;
    onBulkImportVisible: () => void;
    onBulkRestoreVisible: () => void;
    onPatchRow: (rowId: string, patch: Partial<ImportRow>) => void;
    onCategoryChange: (row: ImportRow, selectedCategoryId: string | null) => void;
    onEditRule: (rule: CategorizationRule) => void;
    decisionControl: Snippet<[ImportRow]>;
  }

  let {
    parseErrorCount,
    skippedRowCount,
    largeRowCount,
    bulkImportableVisibleCount,
    bulkRestorableVisibleCount,
    filter,
    filterCounts,
    filterOptions,
    visibleRows,
    advancedFilter = $bindable<ImportRowFilter>(),
    advancedActive,
    onclearfilter,
    filterCategories,
    totalActiveRows,
    groups,
    categoriesFor,
    createCategoryInline,
    matchedRuleFor,
    spanNudge,
    inspectedRule,
    inspectedRuleCount,
    onClearInspectedRule,
    canUndo,
    onUndo,
    onFilterChange,
    onClearFilter,
    onBulkImportVisible,
    onBulkRestoreVisible,
    onPatchRow,
    onCategoryChange,
    onEditRule,
    decisionControl,
  }: Props = $props();

  let groupSheetRowId = $state<string | null>(null);

  const groupSheetRow = $derived(
    groupSheetRowId ? visibleRows.find((r) => r.id === groupSheetRowId) : null
  );
  let stickyToolbarRef = $state<HTMLDivElement | null>(null);
  let stickyToolbarHeight = $state(0);
  let sortKind = $state<SortKind>("original");
  const sortKinds: SortKind[] = ["original", "date_desc", "date_asc", "amount_desc", "amount_asc"];
  const sortLabelByKind: Record<SortKind, string> = {
    original: m.bank_review_sort_original(),
    date_desc: m.bank_review_sort_date_desc(),
    date_asc: m.bank_review_sort_date_asc(),
    amount_desc: m.bank_review_sort_amount_desc(),
    amount_asc: m.bank_review_sort_amount_asc(),
  };
  const sortedRows = $derived.by(() => {
    if (sortKind === "original") return visibleRows;

    const sorted = [...visibleRows];
    const dateValue = (row: ImportRow) => new Date(row.posted_at).getTime();

    switch (sortKind) {
      case "date_desc":
        sorted.sort((a, b) => dateValue(b) - dateValue(a));
        break;
      case "date_asc":
        sorted.sort((a, b) => dateValue(a) - dateValue(b));
        break;
      case "amount_desc":
        sorted.sort((a, b) => b.amount - a.amount);
        break;
      case "amount_asc":
        sorted.sort((a, b) => a.amount - b.amount);
        break;
      default:
        break;
    }

    return sorted;
  });

  // Infinite render (chunked): keep every rendered row mounted (no unmount-on-scroll,
  // so focus / sticky bars / portal'd combobox dropdowns can't regress) while paying a
  // cheap initial paint on large statements. The window grows as a sentinel scrolls into
  // view and resets whenever the list identity (filter / sort) changes. Bulk actions and
  // filter counts run on the full visibleRows in the parent, so they stay accurate.
  const CHUNK_SIZE = 60;
  let shown = $state(CHUNK_SIZE);
  const renderedRows = $derived(sortedRows.slice(0, shown));

  $effect(() => {
    void filter;
    void sortKind;
    shown = CHUNK_SIZE;
  });

  function loadMore(): void {
    if (shown < sortedRows.length) {
      shown = Math.min(shown + CHUNK_SIZE, sortedRows.length);
    }
  }

  function sentinel(node: HTMLElement) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "400px" }
    );
    io.observe(node);
    return {
      destroy() {
        io.disconnect();
      },
    };
  }

  function setSortKind(value: string): void {
    if (sortKinds.includes(value as SortKind)) {
      sortKind = value as SortKind;
    }
  }

  function ruleMatchText(rule: CategorizationRule): string {
    const description = rule.match_description?.trim() ?? "";
    const counterparty = rule.match_counterparty?.trim() ?? "";
    const parts: string[] = [];

    if (
      description !== "" &&
      counterparty !== "" &&
      description.toLocaleLowerCase("pl") === counterparty.toLocaleLowerCase("pl")
    ) {
      parts.push(description);
    } else {
      if (description !== "") {
        parts.push(`${m.bank_review_save_rule_field_description()}: "${description}"`);
      }
      if (counterparty !== "") {
        parts.push(`${m.bank_review_save_rule_field_counterparty()}: "${counterparty}"`);
      }
    }
    if (rule.match_type) {
      const typeLabel = rule.match_type === "income" ? m.common_income() : m.common_expense();
      parts.push(`${m.rules_field_type()}: ${typeLabel}`);
    }
    if (rule.match_day_of_month != null) {
      parts.push(`${m.bank_review_rule_condition_date()}: ${rule.match_day_of_month}`);
    }

    return parts.join(" · ") || m.bank_review_rule_saved();
  }

  $effect(() => {
    const el = stickyToolbarRef;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      stickyToolbarHeight = el.offsetHeight;
    });
    stickyToolbarHeight = el.offsetHeight;
    observer.observe(el);
    return () => observer.disconnect();
  });
</script>

<div class="space-y-4">
  {#if parseErrorCount > 0}
    <p
      class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      {m.bank_review_parse_errors_banner({ count: parseErrorCount })}
    </p>
  {/if}

  {#if skippedRowCount > 0}
    <p
      class="rounded-xl border border-slate-500/30 bg-slate-500/10 px-4 py-3 text-sm text-slate-300"
    >
      {m.bank_review_skipped_zero_banner({ count: skippedRowCount })}
    </p>
  {/if}

  {#if spanNudge}
    <p
      class="rounded-xl border border-slate-500/30 bg-slate-500/10 px-4 py-3 text-sm text-slate-300"
    >
      {m.bank_review_span_nudge({ span: spanNudge.spanDays, cadence: spanNudge.cadenceDays })}
    </p>
  {/if}

  {#if largeRowCount > 500}
    <p
      class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      {m.bank_review_large_warning({ count: largeRowCount })}
    </p>
  {/if}

  <div
    bind:this={stickyToolbarRef}
    class="sticky top-14 z-30 -mx-4 space-y-2 border-b border-white/10 bg-slate-950 px-4 py-2"
  >
    {#if bulkImportableVisibleCount > 0 || bulkRestorableVisibleCount > 0 || canUndo}
      <div class="flex flex-wrap items-center gap-2">
        {#if canUndo}
          <button
            type="button"
            class="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400 transition-colors hover:bg-white/5"
            onclick={onUndo}
          >
            {m.bank_review_undo_last_change()}
          </button>
        {/if}
        {#if bulkImportableVisibleCount > 0}
          <button
            type="button"
            class="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400 transition-colors hover:bg-white/5"
            onclick={onBulkImportVisible}
          >
            {m.bank_review_mark_visible_import_action({ count: bulkImportableVisibleCount })}
          </button>
        {/if}
        {#if bulkRestorableVisibleCount > 0}
          <button
            type="button"
            class="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400 transition-colors hover:bg-white/5"
            onclick={onBulkRestoreVisible}
          >
            {m.bank_review_restore_visible_action({ count: bulkRestorableVisibleCount })}
          </button>
        {/if}
      </div>
    {/if}

    <div class="flex flex-wrap items-center gap-2 overflow-x-auto">
      {#if inspectedRule}
        <button
          type="button"
          class="border-accent bg-accent/10 text-accent inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors"
          title={m.bank_review_rule_filter_clear()}
          aria-label={m.bank_review_rule_filter_clear()}
          onclick={onClearInspectedRule}
        >
          <span class="max-w-60 truncate">
            {m.bank_review_rule_filter_chip({ rule: ruleMatchText(inspectedRule) })}
          </span>
          <span class="text-slate-400">{inspectedRuleCount}</span>
          <span aria-hidden="true">×</span>
        </button>
      {/if}
      {#each filterOptions as f (f.kind)}
        <button
          type="button"
          class={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            filter === f.kind
              ? "border-accent bg-accent/10 text-accent"
              : "border-white/10 text-slate-400 hover:bg-white/5"
          )}
          onclick={() => onFilterChange(f.kind)}
        >
          {f.label}<span class="ml-1.5 text-slate-400">{filterCounts[f.kind]}</span>
        </button>
      {/each}
      <div class="relative inline-flex">
        <select
          value={sortKind}
          aria-label={m.bank_review_sort_label()}
          title={m.bank_review_sort_dropdown_hint()}
          class="focus-visible:ring-accent appearance-none rounded-full border border-white/10 bg-slate-950 py-1 pr-8 pl-3 text-xs text-slate-400 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
          onchange={(event) => setSortKind((event.currentTarget as HTMLSelectElement).value)}
        >
          {#each sortKinds as kind (kind)}
            <option value={kind}>{sortLabelByKind[kind]}</option>
          {/each}
        </select>
        <ChevronDown
          size={14}
          aria-hidden="true"
          class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-slate-400"
        />
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <input
        type="search"
        bind:value={advancedFilter.text}
        placeholder={m.bank_review_search_placeholder()}
        class="h-9 min-w-48 flex-1 rounded-full border border-white/10 bg-slate-900/60 px-3 text-sm text-slate-200"
      />
      <input
        type="number"
        inputmode="decimal"
        step="0.01"
        placeholder={m.bank_review_amount_min()}
        value={advancedFilter.amountMin ?? ""}
        oninput={(e) =>
          (advancedFilter.amountMin =
            e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}
        class="h-9 w-28 rounded-full border border-white/10 bg-slate-900/60 px-3 text-sm text-slate-200"
      />
      <input
        type="number"
        inputmode="decimal"
        step="0.01"
        placeholder={m.bank_review_amount_max()}
        value={advancedFilter.amountMax ?? ""}
        oninput={(e) =>
          (advancedFilter.amountMax =
            e.currentTarget.value === "" ? null : Number(e.currentTarget.value))}
        class="h-9 w-28 rounded-full border border-white/10 bg-slate-900/60 px-3 text-sm text-slate-200"
      />
      <CategorySelect
        categories={filterCategories}
        selectedId={advancedFilter.categoryId}
        type="expense"
        onchange={(id) => (advancedFilter.categoryId = id)}
        placeholder={m.bank_review_header_category()}
        class="min-w-40"
      />
      {#if advancedActive}
        <button
          type="button"
          onclick={onclearfilter}
          class="h-9 rounded-full border border-white/10 px-3 text-xs font-medium text-slate-300 hover:bg-white/5"
        >
          {m.bank_review_filter_clear()}
        </button>
      {/if}
    </div>
  </div>

  {#if totalActiveRows === 0}
    <EmptyState
      title={m.bank_review_all_duplicates_skip_title()}
      body={m.bank_review_all_duplicates_skip_body()}
    />
  {:else if visibleRows.length === 0 && totalActiveRows > 0}
    <EmptyState title={m.bank_review_filter_empty_title()} body={m.bank_review_filter_empty_body()}>
      {#snippet action()}
        <Button variant="ghost" size="sm" onclick={onClearFilter}
          >{m.bank_review_filter_clear()}</Button
        >
      {/snippet}
    </EmptyState>
  {:else}
    <div class="hidden rounded-2xl border border-white/10 md:block">
      <table class="min-w-full divide-y divide-white/5 text-sm">
        <thead
          class="sticky z-40 bg-slate-900/95 text-xs text-slate-400 uppercase backdrop-blur"
          style={`top: calc(3.5rem + ${stickyToolbarHeight}px)`}
        >
          <tr>
            <th class="px-3 py-2 text-left">{m.bank_review_header_date()}</th>
            <th class="px-3 py-2 text-right">{m.bank_review_header_amount()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_header_description()}</th>
            <th class="min-w-48 px-3 py-2 text-left">{m.bank_review_header_category()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_import_header_label()}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5 bg-slate-950/40">
          {#each renderedRows as row (row.id)}
            {@const rule = matchedRuleFor(row)}
            {@const groupName = groups.find((g) => g.id === row.selected_group_id)?.name}
            <tr>
              <td class="px-3 py-2 align-top whitespace-nowrap text-slate-300">{row.posted_at}</td>
              <td
                class="px-3 py-2 text-right align-top tabular-nums"
                class:text-rose-300={row.type === "expense"}
                class:text-emerald-300={row.type === "income"}
              >
                {row.type === "expense" ? "-" : "+"}{formatCurrency(row.amount, row.currency)}
              </td>
              <td class="max-w-xs px-3 py-2 align-top">
                {#if row.counterparty}
                  <p class="text-sm font-medium text-slate-100">{row.counterparty}</p>
                {/if}
                <Input
                  class={row.counterparty ? "mt-1" : undefined}
                  value={row.edited_description ?? row.description}
                  onchange={(e) => {
                    const v = (e.target as HTMLInputElement).value.trim();
                    onPatchRow(row.id, {
                      edited_description: v === "" || v === row.description ? null : v,
                    });
                  }}
                />
                {#if groupName}
                  <Badge variant="shared" class="mt-1">{groupName}</Badge>
                {/if}
              </td>
              <td class="min-w-48 px-3 py-2 align-top">
                <CategorySelect
                  class="min-w-40"
                  categories={categoriesFor(row.type)}
                  type={row.type}
                  selectedId={row.selected_category_id}
                  placeholder={m.bank_review_header_category()}
                  onchange={(id) => onCategoryChange(row, id)}
                  oncreate={createCategoryInline}
                  pillMode
                />
                <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {#if rule}
                    <span
                      class="rounded-md bg-slate-800/80 px-2 py-0.5 text-xs text-slate-300"
                      title={m.bank_review_row_rule_attribution({ text: ruleMatchText(rule) })}
                    >
                      {m.bank_review_rule_pill({ rule: ruleMatchText(rule) })}
                    </span>
                    <button
                      type="button"
                      class="rounded-md px-2 py-0.5 text-xs text-slate-400 underline-offset-2 hover:bg-white/5 hover:text-slate-200 hover:underline"
                      title={m.bank_review_row_rule_attribution_title()}
                      onclick={() => onEditRule(rule)}
                    >
                      {m.bank_review_rule_edit()}
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-300"
                    onclick={() => (groupSheetRowId = row.id)}
                  >
                    <Users size={12} aria-hidden="true" />
                    {row.selected_group_id
                      ? m.bank_review_group_change()
                      : m.bank_review_group_add()}
                  </button>
                </div>
              </td>
              <td class="px-3 py-2 align-top">
                <div class="flex flex-col items-start gap-1">
                  {@render decisionControl(row)}
                </div>
              </td>
            </tr>
          {/each}
          {#if shown < sortedRows.length}
            <tr aria-hidden="true">
              <td colspan="5" class="p-0"><div use:sentinel class="h-px"></div></td>
            </tr>
          {/if}
        </tbody>
      </table>
    </div>

    <ul class="space-y-1.5 md:hidden">
      {#each renderedRows as row (row.id)}
        {@const rule = matchedRuleFor(row)}
        {@const groupName = groups.find((g) => g.id === row.selected_group_id)?.name}
        <li class="space-y-2 rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3">
          <div class="flex items-start justify-between gap-3">
            {#if row.counterparty}
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
                {row.counterparty}
              </span>
            {:else}
              <span class="min-w-0 flex-1"></span>
            {/if}
            <span
              class={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                row.type === "income" ? "text-emerald-300" : "text-rose-300"
              )}
            >
              {row.type === "income" ? "+" : "−"}{formatCurrency(row.amount, row.currency)}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{row.posted_at}</span>
            {#if groupName}
              <Badge variant="shared">{groupName}</Badge>
            {/if}
          </div>
          <Input
            class="w-full"
            value={row.edited_description ?? row.description}
            onchange={(e) => {
              const v = (e.target as HTMLInputElement).value.trim();
              onPatchRow(row.id, {
                edited_description: v === "" || v === row.description ? null : v,
              });
            }}
          />
          <CategorySelect
            class="w-full min-w-0"
            categories={categoriesFor(row.type)}
            type={row.type}
            selectedId={row.selected_category_id}
            placeholder={m.bank_review_header_category()}
            onchange={(id) => onCategoryChange(row, id)}
            oncreate={createCategoryInline}
            pillMode
          />
          <div class="flex flex-wrap items-center gap-2">
            {#if rule}
              <span
                class="rounded-md bg-slate-800/80 px-2 py-0.5 text-xs text-slate-300"
                title={m.bank_review_row_rule_attribution({ text: ruleMatchText(rule) })}
              >
                {m.bank_review_rule_pill({ rule: ruleMatchText(rule) })}
              </span>
              <button
                type="button"
                class="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
                title={m.bank_review_row_rule_attribution_title()}
                onclick={() => onEditRule(rule)}
              >
                {m.bank_review_rule_edit()}
              </button>
            {/if}
            <button
              type="button"
              class="text-xs text-slate-400 underline-offset-2 hover:underline"
              onclick={() => (groupSheetRowId = row.id)}
            >
              {row.selected_group_id ? m.bank_review_group_change() : m.bank_review_group_add()}
            </button>
          </div>
          <div class="flex items-center justify-end gap-2">
            {@render decisionControl(row)}
          </div>
        </li>
      {/each}
      {#if shown < sortedRows.length}
        <li use:sentinel aria-hidden="true" class="h-px"></li>
      {/if}
    </ul>
  {/if}
</div>

<Dialog
  open={groupSheetRow !== null}
  onclose={() => (groupSheetRowId = null)}
  title={m.bank_review_group_sheet_title()}
>
  {#if groupSheetRow}
    <p class="mb-3 text-xs text-slate-400">{m.bank_review_group_sheet_hint()}</p>
    <select
      class="focus-visible:ring-accent h-9 w-full rounded-lg border border-white/10 bg-slate-900 px-3 text-sm text-slate-100 focus-visible:ring-2 focus-visible:outline-none"
      value={groupSheetRow.selected_group_id ?? ""}
      onchange={(e) => {
        const row = groupSheetRow;
        if (!row) return;
        const v = (e.target as HTMLSelectElement).value;
        onPatchRow(row.id, { selected_group_id: v === "" ? null : v });
      }}
    >
      <option value="">{m.bank_review_group_own()}</option>
      {#each groups as g (g.id)}
        <option value={g.id}>{g.name}</option>
      {/each}
    </select>
    <div class="mt-4 flex justify-end">
      <Button variant="primary" size="sm" onclick={() => (groupSheetRowId = null)}>
        {m.common_close()}
      </Button>
    </div>
  {/if}
</Dialog>
