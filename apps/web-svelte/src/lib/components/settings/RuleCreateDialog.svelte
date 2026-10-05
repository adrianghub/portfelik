<script lang="ts">
  import { untrack } from "svelte";
  import * as m from "$lib/paraglide/messages";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { matchCategory, normalizeRuleText, type MatchableRow } from "$lib/import/categorize";
  import { suggestDescriptionRule, suggestCounterpartyRule } from "$lib/import/transaction-text";
  import type { CategorizationRuleInput } from "$lib/services/categorization-rules";
  import type { CategorizationRule, Category } from "$lib/types";
  import { formatCurrency } from "$lib/utils";

  interface Props {
    open: boolean;
    row: MatchableRow;
    categoryId: string;
    categories: Category[];
    rows: (MatchableRow & { amount?: number })[];
    oncreate: (input: CategorizationRuleInput) => Promise<void>;
    onclose: () => void;
  }
  let { open, row, categoryId, categories, rows, oncreate, onclose }: Props = $props();
  let description = $state("");
  let counterparty = $state("");
  let descEnabled = $state(true);
  let counterpartyEnabled = $state(false);
  let selectedCategory = $state("");
  let advanced = $state(false);
  let mode = $state<"contains" | "exact">("contains");
  let typeEnabled = $state(false);
  let dateEnabled = $state(false);
  let day = $state("1");
  let saving = $state(false);
  let error = $state<string | null>(null);
  const availableCounterparty = $derived(suggestCounterpartyRule(row));
  const availableCategories = $derived(
    categories.filter((c) => !c.archived_at && c.type === row.type)
  );

  $effect(() => {
    if (!open) return;
    untrack(() => {
      description = suggestDescriptionRule(row);
      counterparty = suggestCounterpartyRule(row);
      descEnabled = true;
      counterpartyEnabled = false;
      selectedCategory = categoryId;
      advanced = false;
      mode = "contains";
      typeEnabled = false;
      dateEnabled = false;
      day = row.posted_at?.split("-")[2] ?? "1";
      error = null;
    });
  });

  const candidate = $derived.by((): CategorizationRule | null => {
    if (!availableCategories.some((c) => c.id === selectedCategory)) return null;
    if (!descEnabled && !counterpartyEnabled) return null;
    if ((descEnabled && !description.trim()) || (counterpartyEnabled && !counterparty.trim()))
      return null;
    const date = dateEnabled ? Number(day) : null;
    if (dateEnabled && (!Number.isInteger(date) || date! < 1 || date! > 31)) return null;
    return {
      id: "__preview__",
      user_id: "__preview__",
      created_at: "",
      priority: 10,
      kind: typeEnabled ? "composite" : mode,
      match_operator: "all",
      match_description: descEnabled ? description : null,
      match_counterparty: counterpartyEnabled ? counterparty : null,
      match_type: typeEnabled ? row.type : null,
      match_day_of_month: date,
      category_id: selectedCategory,
    };
  });
  const matches = $derived(
    candidate ? rows.filter((r) => matchCategory(r, [candidate], categories) !== null) : []
  );
  const broad = $derived(
    matches.length >= 10 && new Set(matches.map((r) => normalizeRuleText(r.description))).size >= 3
  );

  function close() {
    if (!saving) onclose();
  }
  async function save() {
    if (!candidate || matches.length === 0 || saving) return;
    saving = true;
    error = null;
    try {
      await oncreate({
        kind: candidate.kind,
        match_operator: "all",
        match_description: candidate.match_description,
        match_counterparty: candidate.match_counterparty,
        match_type: candidate.match_type,
        match_day_of_month: candidate.match_day_of_month,
        category_id: candidate.category_id,
        priority: candidate.priority,
      });
      onclose();
    } catch (e) {
      error =
        e instanceof Error && e.message === "duplicate_categorization_rule"
          ? m.rule_capture_exists()
          : m.rule_v2_save_error();
    } finally {
      saving = false;
    }
  }
</script>

<Dialog {open} onclose={close} title={m.rule_v2_title()}>
  <div class="space-y-4">
    <div class="space-y-1">
      <label for="rule-create-category" class="text-sm text-slate-200"
        >{m.transaction_form_category()}</label
      >
      <select
        id="rule-create-category"
        bind:value={selectedCategory}
        disabled={saving}
        class="focus-visible:ring-accent min-h-11 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm text-slate-100 focus-visible:ring-2"
      >
        {#each availableCategories as category (category.id)}<option value={category.id}
            >{category.name}</option
          >{/each}
      </select>
    </div>
    <p class="text-xs text-slate-400">{m.rule_v2_all_conditions()}</p>
    <div class="space-y-1">
      <label class="flex min-h-11 items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" bind:checked={descEnabled} disabled={saving} />{mode === "exact"
          ? m.rule_v2_description_exact()
          : m.rule_v2_description_contains()}
      </label>
      <label for="rule-create-description" class="sr-only"
        >{m.bank_review_save_rule_field_description()}</label
      >
      <Input
        id="rule-create-description"
        bind:value={description}
        disabled={!descEnabled || saving}
      />
    </div>
    <div class="space-y-1">
      <label class="flex min-h-11 items-center gap-2 text-sm text-slate-200">
        <input
          type="checkbox"
          bind:checked={counterpartyEnabled}
          disabled={!availableCounterparty || saving}
        />{mode === "exact" ? m.rule_v2_counterparty_exact() : m.rule_v2_counterparty_contains()}
      </label>
      {#if availableCounterparty}
        <label for="rule-create-counterparty" class="sr-only"
          >{m.bank_review_save_rule_field_counterparty()}</label
        >
        <Input
          id="rule-create-counterparty"
          bind:value={counterparty}
          disabled={!counterpartyEnabled || saving}
        />
      {:else}
        <p class="text-xs text-slate-400">{m.rule_v2_no_counterparty()}</p>
      {/if}
    </div>
    <button
      type="button"
      class="min-h-11 text-sm text-slate-300 underline"
      aria-expanded={advanced}
      onclick={() => (advanced = !advanced)}>{m.bank_review_rule_advanced_toggle()}</button
    >
    {#if advanced}
      <div class="space-y-3 rounded-xl border border-white/10 p-3">
        <label class="flex min-h-11 items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={mode === "exact"}
            disabled={saving || typeEnabled}
            onchange={(e) => (mode = e.currentTarget.checked ? "exact" : "contains")}
          />{m.rule_v2_exact()}
        </label>
        <label class="flex min-h-11 items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            bind:checked={typeEnabled}
            disabled={saving || mode === "exact"}
          />{m.rules_field_type()}: {row.type === "expense"
            ? m.common_expense()
            : m.common_income()}
        </label>
        <label class="flex min-h-11 items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            bind:checked={dateEnabled}
            disabled={saving}
          />{m.bank_review_rule_if_date()}
        </label>
        <label for="rule-create-day" class="sr-only">{m.bank_review_rule_day_placeholder()}</label>
        <Input
          id="rule-create-day"
          type="number"
          min="1"
          max="31"
          bind:value={day}
          disabled={!dateEnabled || saving}
        />
      </div>
    {/if}
    <div class="space-y-2 rounded-xl bg-slate-950/60 p-3" aria-live="polite" aria-atomic="true">
      <p class="text-sm text-slate-200">{m.rule_v2_preview_count({ count: matches.length })}</p>
      {#if !candidate}<p class="text-xs text-amber-300">{m.rule_v2_incomplete()}</p>
      {:else if matches.length === 0}<p class="text-xs text-amber-300">
          {m.rule_v2_no_matches()}
        </p>{/if}
      {#if broad}<p class="text-xs text-amber-300">{m.rule_v2_broad()}</p>{/if}
      <ul class="space-y-1 text-xs text-slate-400">
        {#each matches.slice(0, 3) as match, index (index)}
          <li class="flex gap-2">
            <span class="min-w-0 flex-1 break-words">{match.description}</span
            >{#if match.amount != null}<span class="shrink-0">{formatCurrency(match.amount)}</span
              >{/if}
          </li>
        {/each}
      </ul>
    </div>
    {#if error}<p role="alert" class="text-sm text-red-300">{error}</p>{/if}
    <div class="flex justify-end gap-2">
      <Button variant="ghost" onclick={close} disabled={saving}>{m.common_cancel()}</Button>
      <Button
        variant="primary"
        onclick={() => void save()}
        disabled={!candidate || matches.length === 0 || saving}
        loading={saving}>{m.rule_v2_create()}</Button
      >
    </div>
  </div>
</Dialog>
