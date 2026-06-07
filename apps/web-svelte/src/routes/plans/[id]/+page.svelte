<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import * as m from "$lib/paraglide/messages";
  import {
    computePlanProgress,
    fetchEligibleSettlementTransactions,
    fetchLinkedTransactions,
    unlinkPlanTransaction,
  } from "$lib/services/plan-settlement";
  import DebtPlanDetail from "$lib/components/plans/DebtPlanDetail.svelte";
  import SavePlanDetail from "$lib/components/plans/SavePlanDetail.svelte";
  import { detectRecurringDebtPayments } from "$lib/services/debt-payment-detect";
  import {
    deriveDebtBalanceFromLinks,
    fetchPlanDebtTerms,
    setDebtAnchorTransaction,
    upsertPlanDebtTerms,
    updatePlanDebtBalance,
  } from "$lib/services/plan-debt";
  import { fetchPlanById, updatePlan, canManagePlan } from "$lib/services/plans";
  import { fetchMyGroupRoles } from "$lib/services/groups";
  import { supabase } from "$lib/supabase";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { polishPluralForm } from "$lib/utils/polish-plural";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { ArrowLeft, CalendarDays, ChevronRight, Link2Off, Sparkles, Users } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();
  const id = $derived($page.params.id ?? "");

  let currentUserId = $state<string | null>(null);
  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    currentUserId = data.session?.user.id ?? null;
  });

  const groupRolesQuery = createQuery(() => ({
    queryKey: ["my-group-roles"],
    queryFn: fetchMyGroupRoles,
  }));

  const planQuery = createQuery(() => ({
    queryKey: ["plan", id],
    queryFn: () => fetchPlanById(id),
    enabled: !!id,
  }));

  const linkedQuery = createQuery(() => ({
    queryKey: ["plan-links", id],
    queryFn: () => fetchLinkedTransactions(id),
    enabled: !!id,
  }));

  const eligibleQuery = createQuery(() => ({
    queryKey: ["plan-eligible", id],
    queryFn: () => fetchEligibleSettlementTransactions(id),
    enabled: !!id,
  }));

  const debtTermsQuery = createQuery(() => ({
    queryKey: ["plan-debt-terms", id],
    queryFn: () => fetchPlanDebtTerms(id),
    enabled: !!id && planQuery.data?.kind === "debt",
  }));

  const paymentDetectQuery = createQuery(() => ({
    queryKey: ["plan-debt-detect", id],
    queryFn: async () => {
      const plan = planQuery.data!;
      const terms = debtTermsQuery.data!;
      return detectRecurringDebtPayments({
        monthlyPayment: Number(terms.monthly_payment),
        userId: plan.user_id,
        groupId: plan.group_id,
      });
    },
    enabled: !!planQuery.data && planQuery.data.kind === "debt" && !!debtTermsQuery.data,
  }));

  const progress = $derived(
    planQuery.data
      ? computePlanProgress({
          planId: id,
          planName: planQuery.data.name,
          kind: planQuery.data.kind ?? "spend",
          budgetAmount: planQuery.data.budget_amount,
          targetAmount: planQuery.data.target_amount,
          endDate: planQuery.data.end_date,
          linkedTransactions: linkedQuery.data ?? [],
          eligibleCount: eligibleQuery.data?.length ?? 0,
        })
      : null
  );

  const expenses = $derived((linkedQuery.data ?? []).filter((tx) => tx.type === "expense"));
  const incomes = $derived((linkedQuery.data ?? []).filter((tx) => tx.type === "income"));

  const derivedDebtBalance = $derived(
    planQuery.data?.kind === "debt" && debtTermsQuery.data
      ? deriveDebtBalanceFromLinks(Number(debtTermsQuery.data.original_amount), expenses)
      : null
  );

  const canManage = $derived.by(() => {
    const plan = planQuery.data;
    if (!plan || !currentUserId) return false;
    return canManagePlan(plan, currentUserId, groupRolesQuery.data ?? new Map());
  });

  function settleCtaSubtitle(count: number): string {
    const form = polishPluralForm(count);
    if (form === "one") return m.plan_detail_settle_cta_subtitle_one({ count });
    if (form === "few") return m.plan_detail_settle_cta_subtitle_few({ count });
    return m.plan_detail_settle_cta_subtitle_many({ count });
  }

  let unlinkPendingId = $state<string | null>(null);
  const unlinkMutation = createMutation(() => ({
    mutationFn: (txId: string) => unlinkPlanTransaction(id, txId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-links", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-eligible", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress-list"] });
      toast.success(m.plan_settle_unlinked());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const confirmPaymentMutation = createMutation(() => ({
    mutationFn: (txId: string) => setDebtAnchorTransaction(id, txId),
    onSuccess: async () => {
      toast.success(m.plan_settle_linked());
      await queryClient.invalidateQueries({ queryKey: ["plan-debt-terms", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-debt-detect", id] });
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const saveAdjustMutation = createMutation(() => ({
    mutationFn: (patch: { target_amount: number; end_date: string }) => {
      const plan = planQuery.data!;
      return updatePlan(id, {
        name: plan.name,
        kind: "save",
        start_date: plan.start_date,
        end_date: patch.end_date,
        target_amount: patch.target_amount,
        category_id: plan.category_id,
        group_id: plan.group_id,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan", id] });
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress-list"] });
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const debtTermsMutation = createMutation(() => ({
    mutationFn: (input: Parameters<typeof upsertPlanDebtTerms>[1]) =>
      upsertPlanDebtTerms(id, input),
    onSuccess: async () => {
      toast.success(m.plan_toast_updated());
      await queryClient.invalidateQueries({ queryKey: ["plan-debt-terms", id] });
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const syncBalanceMutation = createMutation(() => ({
    mutationFn: async () => {
      if (derivedDebtBalance == null) return;
      await updatePlanDebtBalance(id, derivedDebtBalance);
    },
    onSuccess: async () => {
      toast.success(m.plan_debt_sync_done());
      await queryClient.invalidateQueries({ queryKey: ["plan-debt-terms", id] });
    },
    onError: () => toast.error(m.toast_error()),
  }));
</script>

<svelte:head>
  {#if planQuery.data}
    <title>{planQuery.data.name} · Portfelik</title>
  {/if}
</svelte:head>

<div class="mobile-detail-bottom container mx-auto max-w-5xl space-y-6 px-4 pt-6 md:pb-8">
  {#if planQuery.isLoading}
    <div class="space-y-3">
      <div class="h-8 w-48 animate-pulse rounded-lg bg-slate-800"></div>
      <div class="h-28 animate-pulse rounded-2xl bg-slate-800/70"></div>
    </div>
  {:else if planQuery.isError}
    <p class="text-sm text-rose-600">{m.common_error_title()}</p>
  {:else if planQuery.data}
    {@const plan = planQuery.data}
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0 space-y-3">
        <div class="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onclick={() => goto("/plans")}
            class="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
            aria-label={m.common_back()}
          >
            <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <h1 class="truncate text-2xl font-semibold text-slate-900 md:text-3xl dark:text-white">
            {plan.name}
          </h1>
        </div>
        <div class="flex flex-wrap items-center gap-2 pl-8 text-sm text-slate-400">
          <span class="inline-flex items-center gap-1">
            <CalendarDays size={14} strokeWidth={1.8} aria-hidden="true" />
            {formatDate(plan.start_date)} - {formatDate(plan.end_date)}
          </span>
          {#if plan.group_id}
            <span
              class="border-accent/20 bg-accent/10 text-accent inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
            >
              <Users size={11} strokeWidth={2} aria-hidden="true" />
              {m.group_badge_shared()}
            </span>
          {/if}
        </div>
        {#if plan.group_id}
          <a
            href="/settings"
            class="focus-visible:ring-accent pl-8 text-xs font-medium text-emerald-400 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {m.plan_group_roles_link()}
          </a>
        {/if}
      </div>
    </div>

    {#if plan.kind === "save" && progress}
      {#if plan.group_id && !canManage}
        <p
          class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-2 text-sm text-slate-400"
        >
          {m.plan_shared_readonly_hint()}
        </p>
      {/if}
      <SavePlanDetail
        {plan}
        {progress}
        onAdjust={canManage ? (patch) => saveAdjustMutation.mutate(patch) : undefined}
        adjusting={saveAdjustMutation.isPending}
      />
    {:else if plan.kind === "debt" && debtTermsQuery.data}
      {#if plan.group_id && !canManage}
        <p
          class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-2 text-sm text-slate-400"
        >
          {m.plan_shared_readonly_hint()}
        </p>
      {/if}
      {#if paymentDetectQuery.data?.[0] && !debtTermsQuery.data.anchor_transaction_id && canManage}
        <div
          class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5"
        >
          <p class="text-sm text-emerald-200">
            {m.plan_debt_detect_banner({
              amount: formatCurrency(Number(debtTermsQuery.data.monthly_payment)),
            })}
          </p>
          <button
            type="button"
            onclick={() => confirmPaymentMutation.mutate(paymentDetectQuery.data![0].tx.id)}
            class="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300"
          >
            {m.plan_debt_confirm_payment()}
          </button>
        </div>
      {/if}
      <DebtPlanDetail
        planId={id}
        terms={debtTermsQuery.data}
        derivedBalance={derivedDebtBalance}
        onSyncBalance={canManage ? () => syncBalanceMutation.mutate() : undefined}
        onTermsSave={canManage ? (input) => debtTermsMutation.mutate(input) : undefined}
        syncing={syncBalanceMutation.isPending}
        termsSaving={debtTermsMutation.isPending}
      />
      <a
        href="/plans/{id}/settle"
        class="focus-visible:ring-accent inline-flex items-center gap-1 text-sm font-semibold text-emerald-400 hover:underline focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.plan_debt_link_payments()}
        <ChevronRight size={14} aria-hidden="true" />
      </a>
    {:else if progress}
      <section
        class="rounded-2xl border border-white/5 bg-slate-900/60 bg-[radial-gradient(circle_at_90%_20%,rgba(45,212,191,0.18),transparent_38%)] p-5"
        aria-label={m.plan_detail_progress_title()}
      >
        <p class="text-eyebrow text-slate-400">{m.plan_detail_progress_title()}</p>
        {#if progress.budgetAmount != null && progress.budgetAmount > 0}
          {@const pct = Math.round(Math.min(1, progress.spentAmount / progress.budgetAmount) * 100)}
          <div class="mt-5 flex flex-wrap items-end justify-between gap-3">
            <p class="text-accent text-4xl font-semibold tabular-nums">
              {formatCurrency(progress.spentAmount)}
              <span class="text-xl font-medium text-slate-500">
                z {formatCurrency(progress.budgetAmount)}
              </span>
            </p>
          </div>
          <div
            class="mt-5 h-2 overflow-hidden rounded-full bg-slate-800"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              class="bg-accent-gradient h-full rounded-full transition-all duration-500"
              style="width: {pct}%"
            ></div>
          </div>
          <div class="mt-3 flex items-center justify-between gap-3 text-sm">
            <p class="text-slate-400">
              {m.plan_detail_remaining({ amount: formatCurrency(progress.remaining ?? 0) })}
            </p>
            <p class="text-accent font-semibold tabular-nums">{pct}%</p>
          </div>
        {:else}
          <p class="text-accent mt-4 text-4xl font-semibold tabular-nums">
            {formatCurrency(progress.spentAmount)}
          </p>
        {/if}

        <div class="mt-5 grid gap-2 border-t border-white/5 pt-4 sm:grid-cols-2">
          <div>
            <p class="text-eyebrow text-slate-500">{m.plan_metric_income()}</p>
            <p class="mt-1 text-sm font-semibold text-emerald-300 tabular-nums">
              {formatCurrency(progress.incomeAmount)}
            </p>
          </div>
          <div>
            <p class="text-eyebrow text-slate-500">{m.plan_metric_balance()}</p>
            <p
              class={cn(
                "mt-1 text-sm font-semibold tabular-nums",
                progress.balance >= 0 ? "text-emerald-300" : "text-rose-300"
              )}
            >
              {progress.balance >= 0 ? "+" : "−"}{formatCurrency(Math.abs(progress.balance))}
            </p>
          </div>
        </div>
      </section>
    {/if}

    {#if plan.kind === "spend" && progress && progress.eligibleCount > 0}
      <a
        href="/plans/{id}/settle"
        class="bg-accent-gradient focus-visible:ring-accent flex w-full items-center justify-between rounded-2xl p-4 shadow-[0_0_24px_var(--color-accent-glow)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
        aria-label={m.plan_detail_history_link()}
      >
        <div class="flex items-center gap-3">
          <span class="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/20">
            <Sparkles size={19} class="text-slate-900" aria-hidden="true" />
          </span>
          <div>
            <p class="text-lg font-semibold text-slate-900">{m.plan_detail_history_link()}</p>
            <p class="text-sm text-slate-800">
              {settleCtaSubtitle(progress.eligibleCount)}
            </p>
          </div>
        </div>
        <ChevronRight size={22} class="text-slate-900" aria-hidden="true" />
      </a>
    {/if}

    {#if plan.kind === "spend"}
      <button
        type="button"
        disabled
        class="w-full rounded-xl border border-dashed border-white/10 px-4 py-2.5 text-sm text-slate-500"
        title={m.plan_detail_manual_fallback()}
      >
        {m.plan_detail_manual_fallback()}
      </button>
    {/if}

    {#if plan.kind !== "debt" || linkedQuery.data?.length}
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-eyebrow text-slate-400">{m.plan_detail_linked_header()}</h2>
        {#if progress}
          <p class="text-xs text-slate-500">
            {progress.linkedCount}
            {#if plan.kind === "save"}
              · {formatCurrency(progress.savedAmount)}
            {:else}
              · {formatCurrency(progress.spentAmount)}
            {/if}
          </p>
        {/if}
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        {#if plan.kind !== "save"}
          {@render LinkedSection({
            title: m.plan_linked_expenses(),
            transactions: expenses,
            amountClass: "text-rose-300",
            sign: "−",
            onunlink: (txId) => unlinkMutation.mutate(txId),
            pendingId: unlinkPendingId,
            setpending: (txId) => (unlinkPendingId = txId),
            loading: unlinkMutation.isPending,
          })}
        {/if}
        {@render LinkedSection({
          title: m.plan_linked_income(),
          transactions: incomes,
          amountClass: "text-emerald-300",
          sign: "+",
          onunlink: (txId) => unlinkMutation.mutate(txId),
          pendingId: unlinkPendingId,
          setpending: (txId) => (unlinkPendingId = txId),
          loading: unlinkMutation.isPending,
        })}
      </div>
    {/if}
  {/if}
</div>

{#snippet LinkedSection({
  title,
  transactions,
  amountClass,
  sign,
  onunlink,
  pendingId,
  setpending,
  loading,
}: {
  title: string;
  transactions: import("$lib/types").TransactionWithCategory[];
  amountClass: string;
  sign: string;
  onunlink: (txId: string) => void;
  pendingId: string | null;
  setpending: (txId: string) => void;
  loading: boolean;
})}
  <section class="space-y-2">
    <h2 class="text-eyebrow text-slate-400">{title}</h2>
    {#if transactions.length === 0}
      <p class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-400">
        {m.plan_linked_empty()}
      </p>
    {:else}
      <ul class="space-y-1">
        {#each transactions as tx (tx.id)}
          <li
            class="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2 text-xs"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="truncate font-medium text-slate-200">{tx.description}</p>
                <span
                  class="shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"
                >
                  {m.plan_linked_badge()}
                </span>
              </div>
              <p class="mt-0.5 text-slate-400">
                {formatDate(tx.date)}{tx.category_name ? ` · ${tx.category_name}` : ""}
              </p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span class={cn("font-semibold tabular-nums", amountClass)}>
                {sign}{formatCurrency(tx.amount)}
              </span>
              <button
                type="button"
                onclick={() => onunlink(tx.id)}
                disabled={loading && pendingId === tx.id}
                aria-label={m.plan_settle_unlink()}
                class="rounded-full p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-rose-400 disabled:opacity-40"
                onmousedown={() => setpending(tx.id)}
              >
                <Link2Off size={13} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}
