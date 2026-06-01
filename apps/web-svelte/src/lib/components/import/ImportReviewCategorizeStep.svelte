<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { Snippet } from "svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Badge from "$lib/components/ui/Badge.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import Select from "$lib/components/ui/Select.svelte";
  import ImportCategoryCombobox from "$lib/components/import/ImportCategoryCombobox.svelte";
  import type { ImportRow } from "$lib/services/bank-import";
  import type { Category, CategorizationRule, UserGroup } from "$lib/types";
  import { cn, formatCurrency } from "$lib/utils";
  import { Users } from "lucide-svelte";

  type FilterKind = "pending" | "all" | "income" | "expense";

  interface RuleSuggestion {
    key: string;
    text: string;
    categoryId: string;
    categoryName: string;
    count: number;
  }

  interface Props {
    parseErrorCount: number;
    largeRowCount: number;
    pendingCount: number;
    bulkImportableCount: number;
    bulkSkippableVisibleCount: number;
    filter: FilterKind;
    filterCounts: Record<FilterKind, number>;
    filterOptions: { kind: FilterKind; label: string }[];
    visibleRows: ImportRow[];
    totalActiveRows: number;
    ruleSuggestions: RuleSuggestion[];
    ruleSaving: boolean;
    groups: UserGroup[];
    categoriesFor: (type: "income" | "expense") => Category[];
    createCategoryInline: (name: string, type: "income" | "expense") => Promise<string | null>;
    needsRule: (row: ImportRow) => boolean;
    matchedRuleFor: (row: ImportRow) => CategorizationRule | null;
    ruleAttributionText: (rule: CategorizationRule) => string;
    onFilterChange: (kind: FilterKind) => void;
    onClearFilter: () => void;
    onBulkImport: () => void;
    onBulkSkipVisible: () => void;
    onSaveSuggestion: (s: RuleSuggestion) => void;
    onQuickSaveRule: (row: ImportRow) => void;
    onPatchRow: (rowId: string, patch: Partial<ImportRow>) => void;
    onOpenRuleSettings: (ruleId: string) => void;
    decisionControl: Snippet<[ImportRow]>;
    onBack: () => void;
    onNext: () => void;
    onCancel: () => void;
    canProceed: boolean;
  }

  let {
    parseErrorCount,
    largeRowCount,
    pendingCount,
    bulkImportableCount,
    bulkSkippableVisibleCount,
    filter,
    filterCounts,
    filterOptions,
    visibleRows,
    totalActiveRows,
    ruleSuggestions,
    ruleSaving,
    groups,
    categoriesFor,
    createCategoryInline,
    needsRule,
    matchedRuleFor,
    ruleAttributionText,
    onFilterChange,
    onClearFilter,
    onBulkImport,
    onBulkSkipVisible,
    onSaveSuggestion,
    onQuickSaveRule,
    onPatchRow,
    onOpenRuleSettings,
    decisionControl,
    onBack,
    onNext,
    onCancel,
    canProceed,
  }: Props = $props();

  let groupSheetRowId = $state<string | null>(null);

  const groupSheetRow = $derived(
    groupSheetRowId ? visibleRows.find((r) => r.id === groupSheetRowId) : null
  );
</script>

<div class="space-y-4">
  {#if parseErrorCount > 0}
    <p
      class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      {m.bank_review_parse_errors_banner({ count: parseErrorCount })}
    </p>
  {/if}

  {#if largeRowCount > 500}
    <p
      class="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
    >
      {m.bank_review_large_warning({ count: largeRowCount })}
    </p>
  {/if}

  <div class="rounded-xl border border-white/10 bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
    <p class="font-medium text-slate-100">{m.bank_review_rules_explainer_title()}</p>
    <p class="mt-1 text-xs text-slate-400">{m.bank_review_rules_explainer_body()}</p>
  </div>

  {#if ruleSuggestions.length > 0}
    <div class="space-y-1.5">
      <p class="text-xs font-medium text-slate-400">{m.bank_review_rule_suggestions_heading()}</p>
      <div class="flex gap-2 overflow-x-auto pb-1">
        {#each ruleSuggestions as suggestion (suggestion.key)}
          <button
            type="button"
            class="border-accent/25 bg-accent/10 hover:bg-accent/15 min-w-64 shrink-0 rounded-xl border px-3 py-2 text-left transition-colors disabled:opacity-60"
            disabled={ruleSaving}
            onclick={() => onSaveSuggestion(suggestion)}
          >
            <span class="text-accent block text-xs">
              {m.bank_review_rule_suggestion_intro({
                text: suggestion.text,
                count: suggestion.count,
              })}
            </span>
            <span class="mt-0.5 block truncate text-sm font-medium text-slate-100">
              {m.bank_review_rule_suggestion_action({ category: suggestion.categoryName })}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="sticky top-14 z-30 -mx-4 space-y-2 border-b border-white/10 bg-slate-950 px-4 py-2">
    {#if pendingCount > 0}
      <p class="text-xs text-amber-200">
        {m.bank_review_pending_warning({ count: pendingCount })}
      </p>
    {/if}

    <div class="flex flex-wrap items-center gap-2">
      {#if bulkImportableCount > 0}
        <Button variant="primary" size="sm" onclick={onBulkImport}>
          {m.bank_review_ready_action({ count: bulkImportableCount })}
        </Button>
      {/if}
      {#if bulkSkippableVisibleCount > 0}
        <Button variant="ghost" size="sm" onclick={onBulkSkipVisible}>
          {m.bank_review_mark_visible_skipped({ count: bulkSkippableVisibleCount })}
        </Button>
      {/if}
    </div>

    <div class="flex flex-wrap items-center gap-2 overflow-x-auto">
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
          {f.label}<span class="ml-1.5 text-slate-500">{filterCounts[f.kind]}</span>
        </button>
      {/each}
    </div>
  </div>

  {#if visibleRows.length === 0 && totalActiveRows > 0}
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
        <thead class="bg-slate-900 text-xs text-slate-400 uppercase">
          <tr>
            <th class="px-3 py-2 text-left">{m.bank_review_header_date()}</th>
            <th class="px-3 py-2 text-right">{m.bank_review_header_amount()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_header_description()}</th>
            <th class="min-w-48 px-3 py-2 text-left">{m.bank_review_header_category()}</th>
            <th class="px-3 py-2 text-left">{m.bank_review_import_header_label()}</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-white/5 bg-slate-950/40">
          {#each visibleRows as row (row.id)}
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
                  <p class="text-xs text-slate-400">{row.edited_description ?? row.description}</p>
                {:else}
                  <Input
                    value={row.edited_description ?? row.description}
                    onchange={(e) => {
                      const v = (e.target as HTMLInputElement).value.trim();
                      onPatchRow(row.id, {
                        edited_description: v === "" || v === row.description ? null : v,
                      });
                    }}
                  />
                {/if}
                {#if groupName}
                  <Badge variant="shared" class="mt-1">{groupName}</Badge>
                {/if}
              </td>
              <td class="min-w-48 px-3 py-2 align-top">
                <ImportCategoryCombobox
                  class="min-w-40"
                  categories={categoriesFor(row.type)}
                  type={row.type}
                  selectedId={row.selected_category_id}
                  onchange={(id) => onPatchRow(row.id, { selected_category_id: id })}
                  oncreate={createCategoryInline}
                />
                <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                  {#if rule}
                    <button
                      type="button"
                      class="rounded-md bg-slate-800/80 px-2 py-0.5 text-xs text-slate-400"
                      title={m.bank_review_row_rule_attribution_title()}
                      onclick={() => onOpenRuleSettings(rule.id)}
                    >
                      {m.bank_review_rule_from_rule({ text: ruleAttributionText(rule) })}
                    </button>
                  {:else if needsRule(row)}
                    <Button
                      variant="ghost"
                      size="sm"
                      class="text-amber-300 ring-1 ring-amber-400/40"
                      disabled={!row.selected_category_id || ruleSaving}
                      onclick={() => onQuickSaveRule(row)}
                    >
                      {m.bank_review_save_rule_button()}
                    </Button>
                  {/if}
                  <button
                    type="button"
                    class="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs text-slate-500 hover:bg-white/5 hover:text-slate-300"
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
                  {#if row.decision === "pending"}
                    <span class="text-xs text-amber-300"
                      >{m.bank_review_decision_pending_cue()}</span
                    >
                  {/if}
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <ul class="space-y-1.5 md:hidden">
      {#each visibleRows as row (row.id)}
        {@const rule = matchedRuleFor(row)}
        {@const groupName = groups.find((g) => g.id === row.selected_group_id)?.name}
        {@const secondary = row.counterparty ? (row.edited_description ?? row.description) : null}
        <li class="space-y-2 rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3">
          <div class="flex items-start justify-between gap-3">
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">
              {row.counterparty ?? row.edited_description ?? row.description}
            </span>
            <span
              class={cn(
                "shrink-0 text-sm font-semibold tabular-nums",
                row.type === "income" ? "text-emerald-300" : "text-rose-300"
              )}
            >
              {row.type === "income" ? "+" : "−"}{formatCurrency(row.amount, row.currency)}
            </span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{row.posted_at}</span>
            {#if secondary}
              <span class="min-w-0 truncate">· {secondary}</span>
            {/if}
            {#if groupName}
              <Badge variant="shared">{groupName}</Badge>
            {/if}
          </div>
          <ImportCategoryCombobox
            class="w-full min-w-0"
            categories={categoriesFor(row.type)}
            type={row.type}
            selectedId={row.selected_category_id}
            onchange={(id) => onPatchRow(row.id, { selected_category_id: id })}
            oncreate={createCategoryInline}
          />
          <div class="flex flex-wrap items-center gap-2">
            {#if rule}
              <span class="text-xs text-slate-400"
                >{m.bank_review_rule_from_rule({ text: ruleAttributionText(rule) })}</span
              >
            {:else if needsRule(row)}
              <Button
                variant="ghost"
                size="sm"
                class="text-amber-300"
                disabled={!row.selected_category_id || ruleSaving}
                onclick={() => onQuickSaveRule(row)}
              >
                {m.bank_review_save_rule_button()}
              </Button>
            {/if}
            <button
              type="button"
              class="text-xs text-slate-500 underline-offset-2 hover:underline"
              onclick={() => (groupSheetRowId = row.id)}
            >
              {row.selected_group_id ? m.bank_review_group_change() : m.bank_review_group_add()}
            </button>
          </div>
          <div class="flex items-center justify-end gap-2">
            {#if row.decision === "pending"}
              <span class="text-xs text-amber-300">{m.bank_review_decision_pending_cue()}</span>
            {/if}
            {@render decisionControl(row)}
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <div
    class="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-slate-950/95 px-4 py-3 pb-(--mobile-action-bottom) backdrop-blur md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
  >
    <Button variant="ghost" onclick={onCancel}>{m.bank_review_cancel()}</Button>
    <div class="flex gap-2">
      <Button variant="ghost" onclick={onBack}>{m.bank_review_step_back()}</Button>
      <Button variant="primary" disabled={!canProceed} onclick={onNext}>
        {m.bank_review_step_next()}
      </Button>
    </div>
  </div>
</div>

<Sheet
  open={groupSheetRow !== null}
  onclose={() => (groupSheetRowId = null)}
  title={m.bank_review_group_sheet_title()}
>
  {#if groupSheetRow}
    <p class="mb-3 text-xs text-slate-400">{m.bank_review_group_sheet_hint()}</p>
    <Select
      value={groupSheetRow.selected_group_id ?? ""}
      onchange={(e) => {
        const v = (e.target as HTMLSelectElement).value;
        onPatchRow(groupSheetRow.id, { selected_group_id: v === "" ? null : v });
      }}
    >
      <option value="">{m.bank_review_group_own()}</option>
      {#each groups as g (g.id)}
        <option value={g.id}>{g.name}</option>
      {/each}
    </Select>
    <div class="mt-4 flex justify-end">
      <Button variant="primary" size="sm" onclick={() => (groupSheetRowId = null)}>
        {m.common_close()}
      </Button>
    </div>
  {/if}
</Sheet>
