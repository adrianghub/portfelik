<script lang="ts">
  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import * as m from "$lib/paraglide/messages";
  import {
    computePlanProgress,
    fetchEligibleSettlementTransactions,
    fetchLinkedTransactions,
    unlinkPlanTransaction,
  } from "$lib/services/plan-settlement";
  import DebtPlanDetail from "$lib/components/plans/DebtPlanDetail.svelte";
  import PlanForwardNav from "$lib/components/plans/PlanForwardNav.svelte";
  import SavePlanDetail from "$lib/components/plans/SavePlanDetail.svelte";
  import TransactionDialog, {
    type PlanTransactionContext,
  } from "$lib/components/transactions/TransactionDialog.svelte";
  import { detectRecurringDebtPayments } from "$lib/services/debt-payment-detect";
  import {
    applyDebtBalanceFromLinks,
    deriveDebtBalanceFromLinks,
    fetchPlanDebtTerms,
    setDebtAnchorTransaction,
    upsertPlanDebtTerms,
    updatePlanDebtBalance,
  } from "$lib/services/plan-debt";
  import { derivePlanBucket, fetchPlanById, updatePlan, canManagePlan } from "$lib/services/plans";
  import { fetchMyGroupRoles } from "$lib/services/groups";
  import { supabase } from "$lib/supabase";
  import type { GroupMemberRole, PlanKind, TransactionType } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { navigateBack } from "$lib/utils/navigation";
  import { planSettleHref } from "$lib/utils/plan-routes";
  import {
    restoreScrollPosition,
    saveScrollPosition,
    scrollRestoreKey,
  } from "$lib/utils/scroll-restore";
  import { polishPluralForm } from "$lib/utils/polish-plural";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { ArrowLeft, CalendarDays, Link2Off, Users } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();
  const id = $derived($page.params.id ?? "");
  const planDetailPath = $derived(`/plans/${id}`);
  const settleHref = $derived(planSettleHref(id, $page.url.searchParams));

  beforeNavigate(({ from, to }) => {
    if (from?.url.pathname === planDetailPath && to && to.url.pathname !== planDetailPath) {
      saveScrollPosition(scrollRestoreKey(planDetailPath));
    }
  });

  afterNavigate(({ to }) => {
    if (to?.url.pathname === planDetailPath) {
      restoreScrollPosition(scrollRestoreKey(planDetailPath));
    }
  });

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
          startDate: planQuery.data.start_date,
          endDate: planQuery.data.end_date,
          linkedTransactions: linkedQuery.data ?? [],
          eligibleCount: eligibleQuery.data?.length ?? 0,
        })
      : null
  );

  const expenses = $derived((linkedQuery.data ?? []).filter((tx) => tx.type === "expense"));
  const incomes = $derived((linkedQuery.data ?? []).filter((tx) => tx.type === "income"));

  const linkedExpenseTotal = $derived(expenses.reduce((sum, tx) => sum + tx.amount, 0));

  const derivedDebtBalance = $derived(
    planQuery.data?.kind === "debt" && debtTermsQuery.data
      ? deriveDebtBalanceFromLinks(
          Number(debtTermsQuery.data.original_amount),
          Number(debtTermsQuery.data.annual_rate),
          expenses.map((tx) => ({ amount: tx.amount, date: tx.date }))
        )
      : null
  );

  const planIsUpcoming = $derived(
    planQuery.data ? derivePlanBucket(planQuery.data) === "upcoming" : false
  );

  const canManage = $derived.by(() => {
    const plan = planQuery.data;
    if (!plan || !currentUserId) return false;
    return canManagePlan(plan, currentUserId, groupRolesQuery.data ?? new Map());
  });

  function groupRoleLabel(role: GroupMemberRole | undefined): string {
    if (role === "owner") return m.groups_role_owner();
    if (role === "co_owner") return m.group_role_co_owner();
    return m.groups_role_member();
  }

  const myGroupRole = $derived.by(() => {
    const plan = planQuery.data;
    if (!plan?.group_id) return undefined;
    return groupRolesQuery.data?.get(plan.group_id);
  });

  let showManualTxDialog = $state(false);
  let manualTxType = $state<TransactionType>("expense");

  const manualPlanContext = $derived.by((): PlanTransactionContext | null => {
    const plan = planQuery.data;
    if (!plan) return null;
    return {
      planId: id,
      type: manualTxType,
      groupId: plan.group_id,
      categoryId: plan.category_id,
    };
  });

  function openManualTx(type: TransactionType) {
    manualTxType = type;
    showManualTxDialog = true;
  }

  function defaultManualTxType(kind: PlanKind): TransactionType {
    return kind === "save" ? "income" : "expense";
  }

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
      const plan = planQuery.data;
      if (plan?.kind === "debt") {
        const terms = await fetchPlanDebtTerms(id);
        const linked = await fetchLinkedTransactions(id);
        const expenses = linked.filter((tx) => tx.type === "expense");
        if (terms && expenses.length > 0) {
          try {
            await applyDebtBalanceFromLinks(
              id,
              Number(terms.original_amount),
              Number(terms.annual_rate),
              expenses.map((tx) => ({ amount: tx.amount, date: tx.date }))
            );
            await queryClient.invalidateQueries({ queryKey: ["plan-debt-terms", id] });
          } catch {
            toast.error(m.toast_error());
            return;
          }
        }
      }
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
    mutationFn: (patch: Partial<{ target_amount: number; end_date: string }>) => {
      const plan = planQuery.data!;
      return updatePlan(id, {
        name: plan.name,
        kind: "save",
        start_date: plan.start_date,
        end_date: patch.end_date ?? plan.end_date,
        target_amount: patch.target_amount ?? plan.target_amount ?? 0,
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

  const debtPlanDatesMutation = createMutation(() => ({
    mutationFn: (dates: { start_date: string; end_date: string }) => {
      const plan = planQuery.data!;
      return updatePlan(id, {
        name: plan.name,
        kind: "debt",
        start_date: dates.start_date,
        end_date: dates.end_date,
        target_amount: plan.target_amount,
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
            onclick={() => navigateBack("/plans")}
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
            {#if planIsUpcoming}
              {m.plan_card_planned_from({ date: formatDate(plan.start_date) })} · {m.plan_card_planned_until(
                { date: formatDate(plan.end_date) }
              )}
            {:else}
              {formatDate(plan.start_date)} - {formatDate(plan.end_date)}
            {/if}
          </span>
          {#if planIsUpcoming}
            <span
              class="shrink-0 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300 uppercase"
            >
              {m.plan_card_upcoming_badge()}
            </span>
          {/if}
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
            href="/settings?tab=groups&group={plan.group_id}"
            class="focus-visible:ring-accent pl-8 text-xs font-medium text-emerald-400 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {m.plan_group_roles_link({ role: groupRoleLabel(myGroupRole) })}
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
        planStartDate={plan.start_date}
        planEndDate={plan.end_date}
        derivedBalance={derivedDebtBalance}
        {linkedExpenseTotal}
        onSyncBalance={canManage ? () => syncBalanceMutation.mutate() : undefined}
        onTermsSave={canManage ? (input) => debtTermsMutation.mutate(input) : undefined}
        onPlanDatesSave={canManage ? (dates) => debtPlanDatesMutation.mutate(dates) : undefined}
        syncing={syncBalanceMutation.isPending}
        termsSaving={debtTermsMutation.isPending || debtPlanDatesMutation.isPending}
      />
      <PlanForwardNav href={settleHref} title={m.plan_debt_link_payments()} variant="action" />
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

        {#if plan.kind === "spend" && progress.incomeAmount > 0}
          <div class="mt-5 border-t border-white/5 pt-4">
            <p class="text-eyebrow text-slate-500">{m.plan_linked_funding()}</p>
            <p class="mt-1 text-sm font-semibold text-emerald-300 tabular-nums">
              {formatCurrency(progress.incomeAmount)}
            </p>
            <p class="mt-1 text-xs text-slate-500">{m.plan_linked_funding_hint()}</p>
          </div>
        {/if}
      </section>
    {/if}

    {#if plan.kind === "spend" && progress}
      <PlanForwardNav
        href={settleHref}
        title={m.plan_detail_history_link()}
        subtitle={progress.eligibleCount > 0
          ? settleCtaSubtitle(progress.eligibleCount)
          : undefined}
        ariaLabel={m.plan_detail_history_link()}
        variant="action"
      />
    {/if}

    <button
      type="button"
      onclick={() => openManualTx(defaultManualTxType(plan.kind ?? "spend"))}
      class="focus-visible:ring-accent w-full rounded-xl border border-dashed border-white/10 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-white/20 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
    >
      {m.plan_detail_manual_add()}
    </button>

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
            onmanualadd: () => openManualTx("expense"),
          })}
        {/if}
        {#if plan.kind !== "spend" || incomes.length > 0}
          {@render LinkedSection({
            title: plan.kind === "spend" ? m.plan_linked_funding() : m.plan_linked_income(),
            transactions: incomes,
            amountClass: "text-emerald-300",
            sign: "+",
            onunlink: (txId) => unlinkMutation.mutate(txId),
            pendingId: unlinkPendingId,
            setpending: (txId) => (unlinkPendingId = txId),
            loading: unlinkMutation.isPending,
            onmanualadd: () => openManualTx("income"),
          })}
        {/if}
      </div>
    {/if}
  {/if}
</div>

{#if planQuery.data}
  <TransactionDialog
    open={showManualTxDialog}
    onclose={() => (showManualTxDialog = false)}
    planContext={manualPlanContext}
  />
{/if}

{#snippet LinkedSection({
  title,
  transactions,
  amountClass,
  sign,
  onunlink,
  pendingId,
  setpending,
  loading,
  onmanualadd,
}: {
  title: string;
  transactions: import("$lib/types").TransactionWithCategory[];
  amountClass: string;
  sign: string;
  onunlink: (txId: string) => void;
  pendingId: string | null;
  setpending: (txId: string) => void;
  loading: boolean;
  onmanualadd: () => void;
})}
  <section class="space-y-2">
    <h2 class="text-eyebrow text-slate-400">{title}</h2>
    {#if transactions.length === 0}
      <div
        class="space-y-2 rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-400"
      >
        <p>{m.plan_linked_empty()}</p>
        <button
          type="button"
          onclick={onmanualadd}
          class="focus-visible:ring-accent text-xs font-medium text-emerald-400 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          {m.plan_detail_manual_add()}
        </button>
      </div>
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
