<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import {
    fetchCategorizationRules,
    deleteCategorizationRule,
  } from "$lib/services/categorization-rules";
  import { fetchCategories } from "$lib/services/categories";
  import { matchRule } from "$lib/import/categorize";
  import type { CategorizationRule, Category, TransactionType } from "$lib/types";
  import { cn } from "$lib/utils";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";
  import { Wand2, Trash2 } from "lucide-svelte";
  import { page } from "$app/stores";
  import { untrack } from "svelte";

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

  function category(id: string): Category | null {
    return (categoriesQuery.data ?? []).find((c) => c.id === id) ?? null;
  }

  function categoryTypeLabel(type: TransactionType): string {
    return type === "income" ? m.common_income() : m.common_expense();
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

  function sampleRowsForRule(rule: CategorizationRule): Array<{
    type: TransactionType;
    description: string;
    counterparty: string | null;
  }> {
    const catType = category(rule.category_id)?.type ?? "expense";
    const type = rule.match_type ?? catType;
    return [
      {
        type,
        description: rule.match_description ?? rule.match_counterparty ?? "",
        counterparty: rule.match_counterparty ?? rule.match_description ?? null,
      },
    ];
  }

  function shadowingRule(rule: CategorizationRule): CategorizationRule | null {
    const samples = sampleRowsForRule(rule);
    return (
      (rulesQuery.data ?? []).find((candidate) => {
        if (candidate.id === rule.id || candidate.category_id === rule.category_id) return false;
        if (candidate.priority < rule.priority) return false;
        if (candidate.priority === rule.priority && candidate.created_at >= rule.created_at)
          return false;
        return samples.some((row) => matchRule(candidate, row));
      }) ?? null
    );
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

  // Deep-link from the review screen: ?highlight=<rule_id> scrolls the row
  // into view and flashes a ring around it for a moment.
  let ruleRefs = $state<Record<string, HTMLLIElement | null>>({});
  let flashId = $state<string | null>(null);
  let lastHandledHighlight = $state<string | null>(null);

  const highlightId = $derived($page.url.searchParams.get("highlight"));

  $effect(() => {
    const id = highlightId;
    const rules = rulesQuery.data;
    if (!id || !rules || rules.length === 0) return;
    if (untrack(() => lastHandledHighlight) === id) return;
    const el = untrack(() => ruleRefs[id]);
    if (!el) return;
    lastHandledHighlight = id;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    flashId = id;
    const timer = window.setTimeout(() => {
      flashId = null;
    }, 1500);
    return () => window.clearTimeout(timer);
  });
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
        {@const catType = category(rule.category_id)?.type}
        {@const loser = shadowingRule(rule)}
        <li
          bind:this={ruleRefs[rule.id]}
          class={cn(
            "flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-3 backdrop-blur transition-shadow",
            flashId === rule.id && "ring-accent/60 ring-2"
          )}
          aria-label={flashId === rule.id ? m.rules_highlighted() : undefined}
        >
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm text-slate-100">{matchSummary(rule)}</p>
            <p class="mt-0.5 text-xs text-slate-500">
              →
              <span class={cn(cat ? "text-emerald-300" : "text-rose-300")}>
                {cat ?? m.rules_category_missing()}
              </span>
              {#if catType}
                <span> · {categoryTypeLabel(catType)}</span>
              {/if}
            </p>
            {#if loser}
              <p class="mt-1 text-xs text-amber-200">
                {m.rules_loses_to({ rule: matchSummary(loser) })}
              </p>
            {/if}
          </div>
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
