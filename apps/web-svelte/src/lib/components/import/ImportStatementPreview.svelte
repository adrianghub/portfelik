<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import { polishPluralForm } from "$lib/utils/polish-plural";
  import type { ImportRow, ImportSession } from "$lib/services/bank-import";
  import type { Category, CategorizationRule } from "$lib/types";
  import { importAdapterLabel } from "$lib/import/banks/registry";
  import {
    statementCounts,
    statementRows,
    type StatementFilter,
  } from "$lib/import/statement-preview";
  import { formatCurrency } from "$lib/utils";
  import Button from "$lib/components/ui/Button.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";

  let {
    session,
    rows,
    categories = [],
    matchedRuleFor,
    onReview,
  }: {
    session: ImportSession;
    rows: ImportRow[];
    categories?: Category[];
    matchedRuleFor?: (row: ImportRow) => CategorizationRule | null;
    onReview?: () => void;
  } = $props();
  let expanded = $state(false);
  let filter = $state<StatementFilter>("all");
  let selectedId = $state<string | null>(null);
  const selected = $derived(rows.find((row) => row.id === selectedId) ?? null);
  const archivedCategoryIds = $derived(
    session.status === "preview"
      ? new Set(
          categories.filter((category) => category.archived_at).map((category) => category.id)
        )
      : undefined
  );
  const counts = $derived(statementCounts(rows, archivedCategoryIds));
  const visible = $derived(statementRows(rows, filter, archivedCategoryIds));
  const dates = $derived(rows.map((row) => row.posted_at).sort());
  const filters: { kind: StatementFilter; label: string }[] = [
    { kind: "all", label: m.import_statement_filter_all() },
    { kind: "review", label: m.import_statement_filter_review() },
    { kind: "duplicates", label: m.import_statement_filter_duplicates() },
    { kind: "skipped", label: m.import_statement_filter_skipped() },
  ];
  function operationsLabel(count: number): string {
    const form = polishPluralForm(count);
    if (form === "one") return m.import_statement_operations_one({ count });
    if (form === "few") return m.import_statement_operations_few({ count });
    return m.import_statement_operations_many({ count });
  }
  function reviewLabel(count: number): string {
    const form = polishPluralForm(count);
    if (form === "one") return m.import_statement_review_action_one({ count });
    if (form === "few") return m.import_statement_review_action_few({ count });
    return m.import_statement_review_action_many({ count });
  }
  function ruleLabel(rule: CategorizationRule | null): string {
    if (!rule) return m.import_statement_no_rule();
    const criteria = [rule.match_description, rule.match_counterparty].filter(Boolean);
    if (rule.match_type) {
      criteria.push(
        m.import_statement_rule_type({
          type: rule.match_type === "expense" ? m.common_expense() : m.common_income(),
        })
      );
    }
    if (rule.match_day_of_month != null) {
      criteria.push(m.import_statement_rule_day({ day: rule.match_day_of_month }));
    }
    return criteria.join(" · ") || m.import_statement_matching_rule();
  }
  function amount(row: ImportRow): string {
    return `${row.type === "expense" ? "−" : "+"}${formatCurrency(row.amount, row.currency)}`;
  }
</script>

<section class="space-y-3 rounded-2xl border border-white/10 bg-slate-900/40 p-4">
  <div class="flex flex-wrap items-start justify-between gap-3">
    <div class="min-w-0 space-y-1">
      <h2 class="font-semibold text-slate-100">{m.import_statement_title()}</h2>
      <p class="text-sm break-all text-slate-300">
        {session.source_filename ?? m.import_statement_fallback_filename()}
      </p>
      <p class="text-xs text-slate-400">
        {importAdapterLabel(session.adapter_kind ?? session.detected_kind)} · {operationsLabel(
          rows.length
        )}
        {#if dates.length}
          · {dates[0]} – {dates[dates.length - 1]}{/if}
      </p>
    </div>
    <Button variant="ghost" size="sm" onclick={() => (expanded = !expanded)}>
      {expanded ? m.import_statement_collapse() : m.import_statement_expand()}
    </Button>
  </div>
  {#if session.status === "preview"}
    <p class="text-sm text-slate-300" aria-live="polite">
      {m.import_statement_ready_count({ count: counts.ready })} · {m.import_statement_review_count({
        count: counts.review,
      })} · {m.import_statement_duplicate_count({ count: counts.duplicates })} · {m.import_statement_skipped_count(
        { count: counts.skipped }
      )}
    </p>
    {#if counts.review > 0 && onReview}
      <Button variant="accent" size="sm" onclick={onReview}>{reviewLabel(counts.review)}</Button>
    {/if}
  {/if}
  {#if expanded}
    <div class="flex flex-wrap gap-2" aria-label={m.import_statement_filter_label()}>
      {#each filters as option (option.kind)}
        <button
          class="rounded-full border border-white/10 px-3 py-2 text-xs text-slate-200 focus-visible:ring-2"
          aria-pressed={filter === option.kind}
          onclick={() => (filter = option.kind)}
        >
          {option.label} ({counts[option.kind]})
        </button>
      {/each}
    </div>
    <div class="max-h-96 overflow-auto">
      <table class="w-full text-left text-sm">
        <caption class="sr-only">{m.import_statement_caption()}</caption>
        <thead class="text-xs text-slate-400"
          ><tr
            ><th class="p-2">{m.import_statement_date()}</th><th class="p-2"
              >{m.import_statement_counterparty_description()}</th
            ><th class="p-2 text-right">{m.import_statement_amount()}</th></tr
          ></thead
        >
        <tbody>
          {#each visible as row (row.id)}
            <tr class="border-t border-white/5">
              <td class="p-2 whitespace-nowrap text-slate-400">{row.posted_at}</td>
              <td class="p-2"
                ><button
                  class="w-full text-left text-slate-200 underline-offset-4 hover:underline focus-visible:underline"
                  onclick={() => (selectedId = row.id)}
                  ><span class="block font-medium">{row.counterparty ?? row.description}</span><span
                    class="block max-w-md truncate text-xs text-slate-400">{row.description}</span
                  ></button
                ></td
              >
              <td class="p-2 text-right whitespace-nowrap text-slate-200">{amount(row)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if visible.length === 0}<p class="p-3 text-sm text-slate-400">
          {m.import_statement_empty()}
        </p>{/if}
    </div>
  {/if}
</section>

<Dialog
  open={selected !== null}
  onclose={() => (selectedId = null)}
  title={m.import_statement_details_title()}
>
  {#if selected}
    <div class="space-y-5 text-sm">
      <section class="space-y-2">
        <h3 class="font-semibold text-slate-100">{m.import_statement_bank_data()}</h3>
        {#if selected.source_data?.columns?.length}
          <dl class="space-y-2">
            {#each selected.source_data.columns as column, index (index)}
              <div>
                <dt class="text-xs text-slate-400">{column.label}</dt>
                <dd class="break-words whitespace-pre-wrap text-slate-200">
                  {column.value || "—"}
                </dd>
              </div>
            {/each}
          </dl>
        {:else}
          <p class="text-slate-400">
            {m.import_statement_source_unavailable()}
          </p>
          <p>{selected.posted_at} · {amount(selected)}</p>
          <p class="break-words">{selected.counterparty ?? "—"}</p>
          <p class="break-words whitespace-pre-wrap">{selected.description}</p>
        {/if}
      </section>
      <section class="space-y-2">
        <h3 class="font-semibold text-slate-100">{m.import_statement_app_data()}</h3>
        <dl class="space-y-2 text-slate-300">
          <div>
            <dt class="text-xs text-slate-400">{m.import_statement_type_amount()}</dt>
            <dd>
              {selected.type === "expense" ? m.common_expense() : m.common_income()} · {amount(
                selected
              )}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-slate-400">{m.import_statement_recognized_counterparty()}</dt>
            <dd>{selected.counterparty ?? "—"}</dd>
          </div>
          <div>
            <dt class="text-xs text-slate-400">{m.import_statement_description()}</dt>
            <dd class="break-words whitespace-pre-wrap">
              {selected.edited_description ?? selected.description}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-slate-400">{m.import_statement_category()}</dt>
            <dd>
              {categories.find((category) => category.id === selected.selected_category_id)?.name ??
                m.import_statement_no_category()}
            </dd>
          </div>
          {#if matchedRuleFor}<div>
              <dt class="text-xs text-slate-400">{m.import_statement_matching_rule()}</dt>
              <dd>
                {ruleLabel(matchedRuleFor(selected))}
              </dd>
            </div>{/if}
          <div>
            <dt class="text-xs text-slate-400">{m.import_statement_detected_duplicate()}</dt>
            <dd>
              {selected.duplicate_of != null || selected.decision === "duplicate"
                ? m.import_statement_yes()
                : m.import_statement_no()}
            </dd>
          </div>
          <div>
            <dt class="text-xs text-slate-400">{m.import_statement_decision()}</dt>
            <dd>
              {selected.decision === "skip"
                ? m.import_statement_skip()
                : selected.decision === "pending"
                  ? m.import_statement_filter_review()
                  : selected.decision === "duplicate"
                    ? m.import_statement_duplicate()
                    : m.import_statement_import()}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  {/if}
</Dialog>
