<script lang="ts">
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import { requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import {
    buildCategorizationRuleEditPatch,
    updateCategorizationRule,
  } from "$lib/services/categorization-rules";
  import type { CategorizationRule, Category } from "$lib/types";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import { ValidationError } from "$lib/services/supabase-errors";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    open: boolean;
    onclose: () => void;
    rule: CategorizationRule | null;
    categories: Category[];
  }
  let { open, onclose, rule = null, categories }: Props = $props();

  const queryClient = useQueryClient();

  let categoryId = $state("");
  let editDesc = $state("");
  let editCounterparty = $state("");
  let editDescEnabled = $state(false);
  let editCounterpartyEnabled = $state(false);
  let editDateEnabled = $state(false);
  let editDayOfMonth = $state("1");
  let showAdvanced = $state(false);

  const editsText = $derived(rule?.kind !== "type");
  const typeLabel = $derived(
    rule?.match_type === "income"
      ? m.common_income()
      : rule?.match_type === "expense"
        ? m.common_expense()
        : null
  );

  $effect(() => {
    if (!open || !rule) return;
    categoryId = rule.category_id;
    editDesc = rule.match_description ?? "";
    editCounterparty = rule.match_counterparty ?? "";
    editDescEnabled = rule.match_description != null;
    editCounterpartyEnabled = rule.match_counterparty != null;
    editDateEnabled = rule.match_day_of_month != null;
    editDayOfMonth = String(rule.match_day_of_month ?? 1);
    showAdvanced = editDateEnabled;
  });

  const filteredCategories = $derived(
    categories.filter((c) => !rule?.match_type || c.type === rule.match_type)
  );

  const mutation = createMutation(() => ({
    mutationFn: async () => {
      if (!rule) throw new Error("no_rule");
      const built = buildCategorizationRuleEditPatch(rule, {
        categoryId,
        descEnabled: editDescEnabled,
        desc: editDesc,
        counterpartyEnabled: editCounterpartyEnabled,
        counterparty: editCounterparty,
        dateEnabled: editDateEnabled,
        dayOfMonth: editDayOfMonth,
      });
      if (!built.ok) {
        if (built.issue === "require_condition")
          throw new ValidationError(m.bank_review_rule_edit_require_condition());
        if (built.issue === "require_text")
          throw new ValidationError(m.bank_review_rule_edit_require_text());
        throw new ValidationError(m.bank_review_rule_edit_require_date());
      }
      return updateCategorizationRule(rule.id, built.patch);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: qk.categorizationRules(requireSessionUserId()),
      });
      toast.success(m.bank_review_rule_updated());
      onclose();
    },
    onError: (err) => toastError(err),
  }));
</script>

<Dialog {open} {onclose} title={m.bank_review_rule_edit()}>
  <div class="space-y-3">
    {#if typeLabel}
      <p class="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
        {m.rules_field_type()}: {typeLabel}
        {#if rule?.kind === "type"}
          <span class="text-slate-500"> · {m.rules_kind_locked_hint()}</span>
        {/if}
      </p>
    {/if}

    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="rule-edit-category">
        {m.transaction_form_category()}
      </label>
      <select
        id="rule-edit-category"
        bind:value={categoryId}
        class="focus-visible:ring-accent h-9 w-full rounded-lg border border-white/10 bg-slate-950 px-3 text-sm text-slate-100 focus-visible:ring-2 focus-visible:outline-none"
      >
        {#each filteredCategories as cat (cat.id)}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>

    {#if editsText}
      <label class="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" bind:checked={editDescEnabled} />
        <span>{m.bank_review_rule_if_description()}</span>
      </label>
      <Input
        value={editDesc}
        disabled={!editDescEnabled}
        placeholder={m.bank_review_save_rule_field_description()}
        onchange={(e) => (editDesc = (e.target as HTMLInputElement).value)}
      />

      <label class="flex items-center gap-2 text-sm text-slate-200">
        <input type="checkbox" bind:checked={editCounterpartyEnabled} />
        <span>{m.bank_review_rule_if_counterparty()}</span>
      </label>
      <Input
        value={editCounterparty}
        disabled={!editCounterpartyEnabled}
        placeholder={m.bank_review_save_rule_field_counterparty()}
        onchange={(e) => (editCounterparty = (e.target as HTMLInputElement).value)}
      />
    {/if}

    <div class="rounded-xl border border-white/10 bg-slate-900/60 p-3">
      <button
        type="button"
        class="text-xs font-medium text-slate-300 underline-offset-2 hover:text-slate-100 hover:underline"
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        {m.bank_review_rule_advanced_toggle()}
      </button>
      {#if showAdvanced}
        <div class="mt-2 space-y-2">
          <label class="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" bind:checked={editDateEnabled} />
            <span>{m.bank_review_rule_if_date()}</span>
          </label>
          <Input
            type="number"
            min="1"
            max="31"
            value={editDayOfMonth}
            disabled={!editDateEnabled}
            placeholder={m.bank_review_rule_day_placeholder()}
            onchange={(e) => (editDayOfMonth = (e.target as HTMLInputElement).value)}
          />
        </div>
      {/if}
    </div>

    <div class="flex justify-end gap-2 pt-1">
      <Button variant="ghost" onclick={onclose} disabled={mutation.isPending}>
        {m.common_cancel()}
      </Button>
      <Button
        variant="primary"
        onclick={() => mutation.mutate()}
        loading={mutation.isPending}
        disabled={mutation.isPending}
      >
        {m.common_save()}
      </Button>
    </div>
  </div>
</Dialog>
