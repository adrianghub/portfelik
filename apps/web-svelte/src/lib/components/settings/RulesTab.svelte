<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import {
    fetchCategorizationRules,
    deleteCategorizationRule,
    updateCategorizationRule,
  } from "$lib/services/categorization-rules";
  import { fetchCategories } from "$lib/services/categories";
  import type { CategorizationRule } from "$lib/types";
  import { cn } from "$lib/utils";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import Input from "$lib/components/ui/Input.svelte";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";
  import { Wand2, Trash2 } from "lucide-svelte";

  const queryClient = useQueryClient();

  const rulesQuery = createQuery(() => ({
    queryKey: ["categorization_rules"],
    queryFn: fetchCategorizationRules,
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  let deleteTargetId = $state<string | null>(null);

  function categoryName(id: string): string | null {
    return (categoriesQuery.data ?? []).find((c) => c.id === id)?.name ?? null;
  }

  function kindLabel(rule: CategorizationRule): string {
    switch (rule.kind) {
      case "exact":
        return m.bank_review_save_rule_kind_exact();
      case "contains":
        return m.bank_review_save_rule_kind_contains();
      case "type":
        return m.rules_kind_type();
      case "composite":
        return m.rules_kind_composite();
    }
  }

  // Human-readable summary of what a rule matches on, e.g.
  // 'Opis zawiera "biedronka"' or 'Typ: Wydatek'.
  function matchSummary(rule: CategorizationRule): string {
    const parts: string[] = [];
    if (rule.match_description) {
      parts.push(`${m.bank_review_save_rule_field_description()}: "${rule.match_description}"`);
    }
    if (rule.match_counterparty) {
      parts.push(`${m.bank_review_save_rule_field_counterparty()}: "${rule.match_counterparty}"`);
    }
    if (rule.match_type) {
      const t = rule.match_type === "income" ? m.common_income() : m.common_expense();
      parts.push(`${m.rules_field_type()}: ${t}`);
    }
    return parts.join(" · ");
  }

  const deleteMutation = createMutation(() => ({
    mutationFn: () => deleteCategorizationRule(deleteTargetId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categorization_rules"] });
      toast.success(m.rules_deleted());
      deleteTargetId = null;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  async function setPriority(rule: CategorizationRule, value: number): Promise<void> {
    if (!Number.isFinite(value) || value === rule.priority) return;
    try {
      await updateCategorizationRule(rule.id, { priority: Math.trunc(value) });
      await queryClient.invalidateQueries({ queryKey: ["categorization_rules"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }
</script>

<p class="mb-3 text-sm text-slate-400">{m.rules_intro()}</p>

{#if rulesQuery.isLoading}
  <div class="space-y-2" aria-busy="true" aria-label={m.common_loading()}>
    {#each [0, 1, 2] as _, i (i)}
      <div class="h-12 animate-pulse rounded-xl bg-slate-800/60"></div>
    {/each}
  </div>
{:else if rulesQuery.isError}
  <p class="text-sm text-rose-300" role="alert">{m.common_error_title()}</p>
{:else if rulesQuery.data}
  {#if rulesQuery.data.length === 0}
    <EmptyState title={m.rules_empty()} body={m.rules_empty_hint()}>
      {#snippet icon()}
        <Wand2 size={28} strokeWidth={1.4} />
      {/snippet}
    </EmptyState>
  {:else}
    <ul class="space-y-1.5">
      {#each rulesQuery.data as rule (rule.id)}
        {@const cat = categoryName(rule.category_id)}
        <li
          class="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 backdrop-blur"
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-slate-100">{matchSummary(rule)}</p>
            <p class="mt-0.5 text-xs text-slate-500">
              <span class="text-slate-400">{kindLabel(rule)}</span>
              →
              <span class={cn(cat ? "text-emerald-300" : "text-rose-300")}>
                {cat ?? m.rules_category_missing()}
              </span>
            </p>
          </div>
          <label class="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
            <span>{m.rules_col_priority()}</span>
            <span class="w-16">
              <Input
                type="number"
                value={rule.priority}
                onchange={(e) =>
                  void setPriority(rule, Number((e.target as HTMLInputElement).value))}
              />
            </span>
          </label>
          <button
            type="button"
            onclick={() => (deleteTargetId = rule.id)}
            class="shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:text-rose-300"
            aria-label={m.common_delete()}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </li>
      {/each}
    </ul>
  {/if}
{/if}

<ConfirmDialog
  open={!!deleteTargetId}
  message={m.rules_confirm_delete()}
  onconfirm={() => deleteMutation.mutate()}
  onclose={() => (deleteTargetId = null)}
  pending={deleteMutation.isPending}
/>
