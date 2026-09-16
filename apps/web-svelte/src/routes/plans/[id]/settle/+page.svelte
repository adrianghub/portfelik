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
    fetchPlanProgressSnapshot,
    fetchRankedEligibleTransactions,
    linkPlanTransaction,
  } from "$lib/services/plan-settlement";
  import TransactionDialog, {
    type PlanTransactionContext,
  } from "$lib/components/transactions/TransactionDialog.svelte";
  import { fetchPlanDebtTerms } from "$lib/services/plan-debt";
  import { fetchPlanById } from "$lib/services/plans";
  import type { TransactionType } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { requireSessionUserId, session } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import { ArrowLeft, Link2 } from "lucide-svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();
  const id = $derived($page.params.id ?? "");

  let showManualTxDialog = $state(false);
  /** Optimistic local copy; the durable source is plan_settlement_dismissals. */
  const dismissed = new SvelteSet<string>();

  const planQuery = createQuery(() => ({
    queryKey: qk.plan(session.userId!, id),
    queryFn: () => fetchPlanById(id),
    enabled: () => !!session.userId && !!id,
  }));
  const activeType = $derived<TransactionType>("expense");

  const manualPlanContext = $derived.by((): PlanTransactionContext | null => {
    const plan = planQuery.data;
    if (!plan) return null;
    return {
      planId: id,
      type: activeType,
      planKind: plan.kind ?? "save",
      groupId: plan.group_id,
      categoryId: plan.category_id,
    };
  });

  const rankedQuery = createQuery(() => ({
    queryKey: qk.planRanked(session.userId!, id, activeType),
    queryFn: () => fetchRankedEligibleTransactions(id, { type: activeType }),
    enabled: () => !!session.userId && !!id,
  }));

  const linkedQuery = createQuery(() => ({
    queryKey: qk.planLinks(session.userId!, id),
    queryFn: () => fetchLinkedTransactions(id),
    enabled: () => !!session.userId && !!id,
  }));

  const progressSnapshotQuery = createQuery(() => ({
    queryKey: qk.planProgressList(session.userId!, id, "snapshot"),
    queryFn: () => fetchPlanProgressSnapshot(id),
    enabled: () => !!session.userId && !!id && planQuery.data?.kind === "save",
  }));

  const dismissedQuery = createQuery(() => ({
    queryKey: qk.planDismissed(session.userId!, id),
    queryFn: () => fetchDismissedTransactionIds(id),
    enabled: () => !!session.userId && !!id,
  }));

  const dismissMutation = createMutation(() => ({
    mutationFn: (txId: string) => dismissPlanSuggestion(id, txId),
    onMutate: (txId: string) => {
      dismissed.add(txId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: qk.planDismissed(requireSessionUserId(), id),
      });
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
          progressSnapshot: progressSnapshotQuery.data ?? null,
        })
      : null
  );
  const progressAmount = $derived(
    progress ? (planQuery.data?.kind === "save" ? progress.savedAmount : progress.spentAmount) : 0
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

  async function warnIfPreAnchorLink(linkedTxId: string) {
    const plan = planQuery.data;
    if (plan?.kind !== "debt") return;
    const terms = await fetchPlanDebtTerms(id);
    if (!terms?.balance_anchor_date) return;
    const linked = await fetchLinkedTransactions(id);
    const newlyLinked = linked.find((tx) => tx.id === linkedTxId);
    if (newlyLinked?.date && newlyLinked.date <= terms.balance_anchor_date) {
      toast.warning(m.plan_debt_pre_anchor_link_ignored());
    }
  }

  const linkMutation = createMutation(() => ({
    mutationFn: (txId: string) =>
      linkPlanTransaction(id, txId, { planKind: planQuery.data?.kind ?? "save" }),
    onSuccess: async (_data, txId) => {
      const u = requireSessionUserId();
      await queryClient.invalidateQueries({ queryKey: qk.planLinks(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planRanked(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planEligible(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgress(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planMatches(u) });
      await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planDebtTerms(u, id) });
      try {
        await warnIfPreAnchorLink(txId);
      } catch {
        /* toast is best-effort */
      }
      toast.success(m.plan_settle_linked());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const settleTitle = $derived(
    planQuery.data?.kind === "save" ? m.plan_save_link_cta() : m.plan_debt_link_payments()
  );

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
      <h1 class="text-2xl font-semibold text-white">{settleTitle}</h1>
      {#if planQuery.data}
        <p class="mt-0.5 truncate text-sm text-slate-400">{planQuery.data.name}</p>
      {/if}
    </div>
  </div>

  {#if progress}
    <div class="rounded-2xl border border-white/5 bg-slate-900/50 px-4 py-4">
      <p class="text-eyebrow text-slate-400">{m.plan_settle_progress_eyebrow()}</p>
      <div class="mt-3 text-2xl font-semibold text-slate-100 tabular-nums">
        {formatCurrency(progressAmount)}
      </div>
    </div>
  {/if}

  <p class="text-sm text-slate-400">{m.plan_settle_whole_transaction_notice()}</p>

  <section class="space-y-3" aria-labelledby="settle-suggestions-heading">
    <h2 id="settle-suggestions-heading" class="text-eyebrow text-slate-400">
      {m.plan_settle_candidates()}
    </h2>

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
    {m.plan_settle_manual_add()}
  </button>
</div>

<TransactionDialog
  open={showManualTxDialog}
  onclose={() => (showManualTxDialog = false)}
  planContext={manualPlanContext}
/>
