<script lang="ts">
  import { page } from "$app/stores";
  import { navigateBack } from "$lib/utils/navigation";
  import { planDetailHref } from "$lib/utils/plan-routes";
  import * as m from "$lib/paraglide/messages";
  import {
    computePlanProgress,
    dismissPlanSuggestion,
    fetchDismissedTransactionIds,
    fetchLinkedTransactions,
    fetchRankedEligibleTransactions,
    linkPlanTransaction,
    type RankedTransaction,
  } from "$lib/services/plan-settlement";
  import TransactionDialog, {
    type PlanTransactionContext,
  } from "$lib/components/transactions/TransactionDialog.svelte";
  import { applyDebtBalanceFromLinks, fetchPlanDebtTerms } from "$lib/services/plan-debt";
  import { fetchPlanById } from "$lib/services/plans";
  import type { TransactionType } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { ArrowLeft, Link2, Sparkles } from "lucide-svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();
  const id = $derived($page.params.id ?? "");

  let showManualTxDialog = $state(false);
  /** Optimistic local copy; the durable source is plan_settlement_dismissals. */
  const dismissed = new SvelteSet<string>();

  const planQuery = createQuery(() => ({
    queryKey: ["plan", id],
    queryFn: () => fetchPlanById(id),
    enabled: !!id,
  }));
  const activeType = $derived<TransactionType>(
    planQuery.data?.kind === "save" ? "income" : "expense"
  );

  const manualPlanContext = $derived.by((): PlanTransactionContext | null => {
    const plan = planQuery.data;
    if (!plan) return null;
    return {
      planId: id,
      type: activeType,
      groupId: plan.group_id,
      categoryId: plan.category_id,
    };
  });

  const rankedQuery = createQuery(() => ({
    queryKey: ["plan-ranked", id, activeType],
    queryFn: () => fetchRankedEligibleTransactions(id, { type: activeType }),
    enabled: !!id,
  }));

  const linkedQuery = createQuery(() => ({
    queryKey: ["plan-links", id],
    queryFn: () => fetchLinkedTransactions(id),
    enabled: !!id,
  }));

  const dismissedQuery = createQuery(() => ({
    queryKey: ["plan-dismissed", id],
    queryFn: () => fetchDismissedTransactionIds(id),
    enabled: !!id,
  }));

  const dismissMutation = createMutation(() => ({
    mutationFn: (txId: string) => dismissPlanSuggestion(id, txId),
    onMutate: (txId: string) => {
      dismissed.add(txId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-dismissed", id] });
    },
    onError: (_err, txId) => {
      dismissed.delete(txId);
      toast.error(m.toast_error());
    },
  }));

  const progress = $derived(
    planQuery.data
      ? computePlanProgress({
          planId: id,
          planName: planQuery.data.name,
          kind: planQuery.data.kind ?? "save",
          budgetAmount: planQuery.data.budget_amount,
          targetAmount: planQuery.data.target_amount,
          startDate: planQuery.data.start_date,
          endDate: planQuery.data.end_date,
          linkedTransactions: linkedQuery.data ?? [],
        })
      : null
  );
  const progressAmount = $derived(
    progress ? (activeType === "income" ? progress.savedAmount : progress.spentAmount) : 0
  );

  const persistedDismissed = $derived(new Set(dismissedQuery.data ?? []));

  const suggestions = $derived(
    (rankedQuery.data ?? []).filter(
      (r) =>
        !dismissed.has(r.tx.id) &&
        !persistedDismissed.has(r.tx.id) &&
        !(linkedQuery.data ?? []).some((lt) => lt.id === r.tx.id)
    )
  );

  const linkedForType = $derived((linkedQuery.data ?? []).filter((tx) => tx.type === activeType));

  async function syncDebtBalanceAfterLinkChange(linkedTxId?: string) {
    const plan = planQuery.data;
    if (plan?.kind !== "debt") return;
    const terms = await fetchPlanDebtTerms(id);
    if (!terms) return;
    const linked = await fetchLinkedTransactions(id);
    const expenses = linked.filter((tx) => tx.type === "expense");
    if (linkedTxId && terms.balance_anchor_date) {
      const newlyLinked = expenses.find((tx) => tx.id === linkedTxId);
      if (newlyLinked?.date && newlyLinked.date <= terms.balance_anchor_date) {
        toast.warning(m.plan_debt_pre_anchor_link_ignored());
      }
    }
    await applyDebtBalanceFromLinks(
      id,
      terms,
      plan.start_date,
      expenses.map((tx) => ({ amount: tx.amount, date: tx.date }))
    );
    await queryClient.invalidateQueries({ queryKey: ["plan-debt-terms", id] });
  }

  const linkMutation = createMutation(() => ({
    mutationFn: (txId: string) => linkPlanTransaction(id, txId),
    onSuccess: async (_data, txId) => {
      await queryClient.invalidateQueries({ queryKey: ["plan-links", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-ranked", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-eligible", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress-list"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      try {
        await syncDebtBalanceAfterLinkChange(txId);
      } catch {
        toast.error(m.toast_error());
        return;
      }
      toast.success(m.plan_settle_linked());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function rankBadgeClass(label: RankedTransaction["rankLabel"]): string {
    if (label === "high") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    if (label === "medium") return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    return "bg-slate-700/50 text-slate-400 border-white/10";
  }

  function rankLabel(r: RankedTransaction): string {
    if (r.rankLabel === "high") return m.plan_settle_high_rank({ pct: r.rankPct });
    if (r.rankLabel === "medium") return m.plan_settle_medium_rank({ pct: r.rankPct });
    return m.plan_settle_low_rank({ pct: r.rankPct });
  }

  function reasonLabel(key: string, label: string): string {
    if (key === "date_in_range") return m.plan_settle_reason_date_in_range();
    if (key === "not_linked") return m.plan_settle_reason_not_linked();
    if (key === "category") return m.plan_settle_reason_category({ name: label });
    if (key === "keyword") return m.plan_settle_reason_keyword({ word: label });
    if (key === "amount") return m.plan_settle_reason_amount();
    if (key === "recent") return m.plan_settle_reason_recent();
    if (key === "other_category") return m.plan_settle_reason_other_category({ name: label });
    if (key === "dismissed_similar") return m.plan_settle_reason_dismissed_similar();
    return label;
  }

  function amountSign(type: TransactionType): string {
    return type === "income" ? "+" : "−";
  }
</script>

<div class="mobile-detail-bottom container mx-auto max-w-2xl space-y-6 px-4 pt-6 md:pb-8">
  <div class="flex items-start gap-3">
    <button
      type="button"
      onclick={() => navigateBack(planDetailHref(id, $page.url.searchParams))}
      class="mt-0.5 shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
      aria-label={m.common_back()}
    >
      <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
    </button>
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold text-white">{m.plan_settle_title()}</h1>
      {#if planQuery.data}
        <p class="mt-0.5 truncate text-sm text-slate-400">{planQuery.data.name}</p>
      {/if}
    </div>
  </div>

  {#if progress}
    <div class="rounded-2xl border border-white/5 bg-slate-900/50 px-4 py-4">
      <p class="text-eyebrow text-slate-400">{m.plan_settle_progress_eyebrow()}</p>
      <div class="mt-3 text-2xl font-semibold text-slate-100 tabular-nums">
        {#if progress.budgetAmount != null && progress.budgetAmount > 0}
          {m.plan_settle_progress_bar({
            spent: formatCurrency(progress.spentAmount),
            budget: formatCurrency(progress.budgetAmount),
            remaining: formatCurrency(progress.remaining ?? 0),
          })}
        {:else}
          {formatCurrency(progressAmount)}
        {/if}
      </div>
      {#if progress.budgetAmount != null && progress.budgetAmount > 0}
        {@const pct = Math.round(Math.min(1, progress.spentAmount / progress.budgetAmount) * 100)}
        <div
          class="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div class="bg-accent-gradient h-full rounded-full" style="width: {pct}%"></div>
        </div>
      {/if}
    </div>
  {/if}

  <p class="text-sm leading-relaxed text-slate-400">
    {activeType === "income" ? m.plan_settle_tagline_income() : m.plan_settle_tagline()}
  </p>

  <section class="space-y-3">
    <h2 class="text-eyebrow text-slate-400">{m.plan_settle_candidates()}</h2>

    {#if rankedQuery.isPending}
      {#each [0, 1, 2] as _, i (i)}
        <div class="h-20 animate-pulse rounded-2xl bg-slate-800/50"></div>
      {/each}
    {:else if suggestions.length === 0}
      <div class="space-y-1 py-4 text-center text-sm text-slate-400">
        <p>{m.plan_settle_no_eligible()}</p>
        <p class="text-xs text-slate-400">{m.plan_settle_no_eligible_hint()}</p>
      </div>
    {:else}
      {#each suggestions as ranked (ranked.tx.id)}
        <div class="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold text-slate-100">{ranked.tx.description}</p>
              <p class="mt-0.5 text-xs text-slate-400">
                {formatDate(ranked.tx.date)}{ranked.tx.category_name
                  ? ` · ${ranked.tx.category_name}`
                  : ""}
              </p>
            </div>
            <span
              class={cn(
                "shrink-0 text-sm font-bold tabular-nums",
                ranked.tx.type === "income" ? "text-emerald-300" : "text-rose-300"
              )}
            >
              {amountSign(ranked.tx.type)}{formatCurrency(ranked.tx.amount)}
            </span>
          </div>

          <div class="mt-2.5 flex flex-wrap items-center gap-2">
            <span
              class={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                rankBadgeClass(ranked.rankLabel)
              )}
            >
              <Sparkles size={9} strokeWidth={2} aria-hidden="true" />
              {rankLabel(ranked)}
            </span>

            {#each ranked.reasons as reason (reason.key)}
              <span
                class={cn(
                  "rounded-full border px-1.5 py-0.5 text-[10px]",
                  reason.signal === "match"
                    ? "border-white/10 text-slate-400"
                    : "border-amber-500/30 text-amber-400"
                )}
              >
                {reason.signal === "match" ? "✓" : "ⓘ"}
                {reasonLabel(reason.key, reason.label)}
              </span>
            {/each}
          </div>

          <div class="mt-3 flex gap-2">
            <button
              type="button"
              onclick={() => linkMutation.mutate(ranked.tx.id)}
              disabled={linkMutation.isPending}
              class="bg-accent-gradient focus-visible:ring-accent inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-slate-900 shadow-[0_0_12px_var(--color-accent-glow)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            >
              <Link2 size={13} strokeWidth={2} aria-hidden="true" />
              {m.plan_settle_link()}
            </button>
            <button
              type="button"
              onclick={() => dismissMutation.mutate(ranked.tx.id)}
              class="focus-visible:ring-accent inline-flex min-h-11 items-center rounded-full border border-white/10 px-4 text-sm font-medium text-slate-400 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
            >
              {m.plan_settle_reject()}
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </section>

  {#if linkedForType.length > 0}
    <section class="space-y-2">
      <h2 class="text-eyebrow text-slate-400">{m.plan_settle_linked_heading()}</h2>
      <ul class="space-y-1">
        {#each linkedForType as tx (tx.id)}
          <li
            class="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2 text-xs"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-slate-200">{tx.description}</p>
              <p class="mt-0.5 text-slate-400">{formatDate(tx.date)}</p>
            </div>
            <span
              class={cn(
                "font-semibold tabular-nums",
                tx.type === "income" ? "text-emerald-300" : "text-rose-300"
              )}
            >
              {amountSign(tx.type)}{formatCurrency(tx.amount)}
            </span>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <button
    type="button"
    onclick={() => (showManualTxDialog = true)}
    class="focus-visible:ring-accent mx-auto block text-sm text-emerald-400 hover:underline focus-visible:ring-2 focus-visible:outline-none"
  >
    {activeType === "income" ? m.plan_settle_manual_add() : m.plan_settle_manual_footer()}
  </button>
</div>

<TransactionDialog
  open={showManualTxDialog}
  onclose={() => (showManualTxDialog = false)}
  planContext={manualPlanContext}
/>
