<script lang="ts">
  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import * as m from "$lib/paraglide/messages";
  import {
    computePlanProgress,
    addPlanContribution,
    fetchLinkedTransactions,
    fetchPlanProgressSnapshot,
    fetchSuggestionCount,
    linkPlanTransaction,
    unlinkPlanTransaction,
    suggestPlanContribution,
    setSavePlanProgress,
  } from "$lib/services/plan-settlement";
  import DebtPlanDetail from "$lib/components/plans/DebtPlanDetail.svelte";
  import PlanForwardNav from "$lib/components/plans/PlanForwardNav.svelte";
  import SavePlanDetail from "$lib/components/plans/SavePlanDetail.svelte";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import TransactionDialog, {
    type PlanTransactionContext,
  } from "$lib/components/transactions/TransactionDialog.svelte";
  import { detectRecurringDebtPayments } from "$lib/services/debt-payment-detect";
  import {
    deriveDebtDisplayBalance,
    fetchPlanDebtTerms,
    saveDebtPlan,
    syncDebtBalanceFromLinks,
    type PlanDebtTermsInput,
  } from "$lib/services/plan-debt";
  import {
    derivePlanBucket,
    fetchPlanById,
    todayIso,
    updatePlan,
    canManagePlan,
  } from "$lib/services/plans";
  import { fetchMyGroupRoles } from "$lib/services/groups";
  import { session, requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import type { GroupMemberRole, PlanKind, TransactionType } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { navigateBack } from "$lib/utils/navigation";
  import { planSettleHref } from "$lib/utils/plan-routes";
  import { toastError } from "$lib/toast-error";
  import {
    restoreScrollPosition,
    saveScrollPosition,
    scrollRestoreKey,
  } from "$lib/utils/scroll-restore";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { ArrowLeft, CalendarDays, Link2Off, Users } from "lucide-svelte";
  import { tick } from "svelte";
  import { toast } from "svelte-sonner";
  import { localDateIso } from "$lib/date-local";

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

  const groupRolesQuery = createQuery(() => ({
    queryKey: qk.myGroupRoles(session.userId!),
    queryFn: fetchMyGroupRoles,
    enabled: () => !!session.userId,
  }));

  const planQuery = createQuery(() => ({
    queryKey: qk.plan(session.userId!, id),
    queryFn: () => fetchPlanById(id),
    enabled: () => !!session.userId && !!id,
  }));

  const linkedQuery = createQuery(() => ({
    queryKey: qk.planLinks(session.userId!, id),
    queryFn: () => fetchLinkedTransactions(id),
    enabled: () => !!session.userId && !!id,
  }));

  const suggestionCountQuery = createQuery(() => ({
    queryKey: qk.planSuggestionCount(session.userId!, id),
    queryFn: () => fetchSuggestionCount(id),
    enabled: () => !!session.userId && !!id,
  }));

  const progressSnapshotQuery = createQuery(() => ({
    queryKey: qk.planProgressList(session.userId!, id, "snapshot"),
    queryFn: () => fetchPlanProgressSnapshot(id),
    enabled: () => !!session.userId && !!id && planQuery.data?.kind === "save",
  }));

  const debtTermsQuery = createQuery(() => ({
    queryKey: qk.planDebtTerms(session.userId!, id),
    queryFn: () => fetchPlanDebtTerms(id),
    enabled: () => !!session.userId && !!id && planQuery.data?.kind === "debt",
  }));

  const linkedTxIds = $derived(new Set((linkedQuery.data ?? []).map((tx) => tx.id)));

  const paymentDetectQuery = createQuery(() => ({
    queryKey: qk.planDebtDetect(session.userId!, id, [...linkedTxIds].sort().join(",")),
    queryFn: async () => {
      const plan = planQuery.data!;
      const terms = debtTermsQuery.data!;
      return detectRecurringDebtPayments({
        monthlyPayment: Number(terms.monthly_payment),
        userId: plan.user_id,
        groupId: plan.group_id,
        excludeTransactionIds: linkedTxIds,
      });
    },
    enabled: () =>
      !!session.userId &&
      !!planQuery.data &&
      planQuery.data.kind === "debt" &&
      !!debtTermsQuery.data &&
      !!linkedQuery.data,
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
          eligibleCount: suggestionCountQuery.data ?? 0,
        })
      : null
  );

  const expenses = $derived((linkedQuery.data ?? []).filter((tx) => tx.type === "expense"));
  const incomes = $derived((linkedQuery.data ?? []).filter((tx) => tx.type === "income"));

  const linkedExpenseTotal = $derived(expenses.reduce((sum, tx) => sum + tx.amount, 0));

  const derivedDebtBalance = $derived(
    planQuery.data?.kind === "debt" && debtTermsQuery.data
      ? deriveDebtDisplayBalance(
          debtTermsQuery.data,
          planQuery.data.start_date,
          expenses.map((tx) => ({ amount: tx.amount, date: tx.date })),
          todayIso()
        )
      : null
  );

  const planBucket = $derived(planQuery.data ? derivePlanBucket(planQuery.data) : null);
  const planIsUpcoming = $derived(planBucket === "upcoming");
  const canRecordProgress = $derived(
    planBucket === "active" && planQuery.data?.status === "active"
  );

  const canManage = $derived.by(() => {
    const plan = planQuery.data;
    if (!plan || !session.userId) return false;
    return canManagePlan(plan, session.userId, groupRolesQuery.data ?? new Map());
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
      planKind: plan.kind ?? "save",
      groupId: plan.group_id,
      categoryId: plan.category_id,
      startDate: plan.start_date,
      endDate: plan.end_date,
    };
  });

  function openManualTx(type: TransactionType) {
    manualTxType = type;
    showManualTxDialog = true;
  }

  function defaultManualTxType(kind: PlanKind): TransactionType {
    void kind;
    return "expense";
  }

  let contributionOpen = $state(false);
  let contributionAmount = $state<number | null>(null);
  let contributionDate = $state(localDateIso());
  let contributionDescription = $state("");
  let contributionAmountInput = $state<HTMLInputElement | null>(null);

  function openContribution() {
    if (!progress) return;
    contributionAmount = suggestPlanContribution({
      remaining: progress.remaining,
      monthlyNeeded: progress.monthlyNeeded,
      contributedThisMonth: progress.saveContributionsCurrentMonth,
      recentAmount: expenses[0]?.amount,
    });
    contributionDate = localDateIso();
    contributionDescription = "";
    contributionOpen = true;
    void tick().then(() => contributionAmountInput?.focus());
  }

  const contributionMutation = createMutation(() => ({
    mutationFn: () =>
      addPlanContribution({
        planId: id,
        amount: contributionAmount ?? 0,
        date: contributionDate,
        description: contributionDescription,
      }),
    onSuccess: async () => {
      contributionOpen = false;
      toast.success(m.plan_contribution_saved());
      const u = requireSessionUserId();
      await queryClient.invalidateQueries({ queryKey: qk.transactions.all(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planLinks(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planEligible(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planSuggestionCount(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planDebtTerms(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planDebtDetect(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgress(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
      await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
    },
    onError: (err) => toastError(err),
  }));

  let correctionOpen = $state(false);
  let correctedSavedAmount = $state<number | null>(null);
  let correctionDate = $state(localDateIso());
  let correctionNote = $state("");

  function openCorrection() {
    if (!progress) return;
    correctedSavedAmount = progress.savedAmount;
    correctionDate = localDateIso();
    correctionNote = "";
    correctionOpen = true;
  }

  const correctionMutation = createMutation(() => ({
    mutationFn: () =>
      setSavePlanProgress({
        planId: id,
        savedAmount: correctedSavedAmount ?? 0,
        effectiveDate: correctionDate,
        note: correctionNote,
      }),
    onSuccess: async () => {
      correctionOpen = false;
      toast.success(m.plan_progress_correction_saved());
      const u = requireSessionUserId();
      await queryClient.invalidateQueries({
        queryKey: qk.planProgressList(u, id, "snapshot"),
      });
      await queryClient.invalidateQueries({ queryKey: qk.planSuggestionCount(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgress(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
      await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
    },
    onError: (err) => toastError(err),
  }));

  let unlinkPendingId = $state<string | null>(null);
  const unlinkMutation = createMutation(() => ({
    mutationFn: (txId: string) => unlinkPlanTransaction(id, txId),
    onSuccess: async () => {
      const u = requireSessionUserId();
      await queryClient.invalidateQueries({ queryKey: qk.planLinks(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planEligible(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgress(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planDebtTerms(u, id) });
      toast.success(m.plan_settle_unlinked());
    },
    onError: (err) => toastError(err),
  }));

  const confirmPaymentMutation = createMutation(() => ({
    mutationFn: async (txId: string) => {
      const plan = planQuery.data;
      await linkPlanTransaction(id, txId, { planKind: plan?.kind ?? "save" });
    },
    onSuccess: async () => {
      toast.success(m.plan_settle_linked());
      const u = requireSessionUserId();
      await queryClient.invalidateQueries({ queryKey: qk.planLinks(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planEligible(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planSuggestionCount(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planDebtTerms(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planDebtDetect(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgress(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
      await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
    },
    onError: (err) => toastError(err),
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
      const u = requireSessionUserId();
      await queryClient.invalidateQueries({ queryKey: qk.plan(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
    },
    onError: (err) => toastError(err),
  }));

  const debtTermsMutation = createMutation(() => ({
    mutationFn: async (patch: {
      terms: PlanDebtTermsInput;
      start_date: string;
      end_date: string;
    }) => {
      const plan = planQuery.data!;
      const existing = debtTermsQuery.data;
      return saveDebtPlan({
        plan_id: id,
        name: plan.name,
        group_id: plan.group_id,
        category_id: plan.category_id,
        start_date: patch.start_date,
        end_date: patch.end_date,
        target_amount: plan.target_amount,
        original_amount: patch.terms.original_amount,
        current_balance: patch.terms.current_balance,
        annual_rate: patch.terms.annual_rate,
        monthly_payment: patch.terms.monthly_payment,
        first_payment_date:
          patch.terms.first_payment_date !== undefined
            ? patch.terms.first_payment_date
            : (existing?.first_payment_date ?? null),
        first_payment_amount:
          patch.terms.first_payment_amount !== undefined
            ? patch.terms.first_payment_amount
            : (existing?.first_payment_amount ?? null),
        reset_balance_anchor: patch.terms.reset_balance_anchor,
        clear_balance_anchor: patch.terms.clear_balance_anchor,
      });
    },
    onSuccess: async () => {
      toast.success(m.plan_toast_updated());
      const u = requireSessionUserId();
      await queryClient.invalidateQueries({ queryKey: qk.planDebtTerms(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.plan(u, id) });
      await queryClient.invalidateQueries({ queryKey: qk.plans(u) });
      await queryClient.invalidateQueries({ queryKey: qk.planProgressList(u) });
    },
    onError: (err) => toastError(err),
  }));

  const syncBalanceMutation = createMutation(() => ({
    mutationFn: async () => {
      await syncDebtBalanceFromLinks(id);
    },
    onSuccess: async () => {
      toast.success(m.plan_debt_sync_done());
      await queryClient.invalidateQueries({
        queryKey: qk.planDebtTerms(requireSessionUserId(), id),
      });
    },
    onError: (err) => toastError(err),
  }));
</script>

<svelte:head>
  {#if planQuery.data}
    <title>{planQuery.data.name} · JakStoimy</title>
  {/if}
</svelte:head>

<div class="mobile-detail-bottom container mx-auto max-w-5xl space-y-6 px-4 pt-6 md:pb-8">
  {#if planQuery.isLoading}
    <div class="space-y-3">
      <div class="h-8 w-48 animate-pulse rounded-lg bg-slate-800"></div>
      <div class="h-28 animate-pulse rounded-2xl bg-slate-800/70"></div>
    </div>
  {:else if planQuery.isError}
    <QueryError error={planQuery.error} onRetry={() => planQuery.refetch()} />
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
        onAdjust={canManage
          ? async (patch) => {
              await saveAdjustMutation.mutateAsync(patch);
            }
          : undefined}
        adjusting={saveAdjustMutation.isPending}
        onContribute={canRecordProgress ? openContribution : undefined}
        onCorrect={canManage && canRecordProgress ? openCorrection : undefined}
      />
    {:else if plan.kind === "debt" && debtTermsQuery.data}
      {#if plan.group_id && !canManage}
        <p
          class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-2 text-sm text-slate-400"
        >
          {m.plan_shared_readonly_hint()}
        </p>
      {/if}
      {#if paymentDetectQuery.data?.[0] && canManage}
        <div
          class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2.5"
        >
          <p class="text-sm text-emerald-200">
            {m.plan_debt_detect_banner({
              amount: formatCurrency(paymentDetectQuery.data[0].tx.amount),
              date: formatDate(paymentDetectQuery.data[0].tx.date),
            })}
          </p>
          <button
            type="button"
            onclick={() => confirmPaymentMutation.mutate(paymentDetectQuery.data![0].tx.id)}
            disabled={confirmPaymentMutation.isPending}
            class="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 disabled:opacity-50"
          >
            {confirmPaymentMutation.isPending ? m.common_saving() : m.plan_debt_confirm_payment()}
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
        linkedExpenses={expenses.map((tx) => ({ amount: tx.amount, date: tx.date }))}
        onSyncBalance={canManage ? () => syncBalanceMutation.mutateAsync() : undefined}
        onDebtPlanSave={canManage
          ? async (patch) => {
              await debtTermsMutation.mutateAsync(patch);
            }
          : undefined}
        refinancedFromPlanId={plan.refinanced_from_plan_id}
        replacedByPlanId={plan.replaced_by_plan_id}
        syncing={syncBalanceMutation.isPending}
        termsSaving={debtTermsMutation.isPending}
      />
      <PlanForwardNav href={settleHref} title={m.plan_debt_link_payments()} variant="action" />
    {/if}

    {#if plan.kind !== "save"}
      <button
        type="button"
        onclick={() => openManualTx(defaultManualTxType(plan.kind ?? "save"))}
        class="focus-visible:ring-accent w-full rounded-xl border border-dashed border-white/10 px-4 py-2.5 text-sm text-slate-300 transition-colors hover:border-white/20 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.plan_detail_manual_add()}
      </button>
    {/if}

    {#if plan.kind !== "debt" || linkedQuery.data?.length}
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-eyebrow text-slate-400">
          {plan.kind === "save"
            ? m.plan_detail_linked_header_save()
            : m.plan_detail_linked_header()}
        </h2>
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

      <div class={cn("grid gap-4", plan.kind !== "save" && "lg:grid-cols-2")}>
        {#if plan.kind === "save" || plan.kind === "debt"}
          {@render LinkedSection({
            title: plan.kind === "save" ? null : m.plan_linked_expenses(),
            transactions: expenses,
            amountClass: plan.kind === "save" ? "text-emerald-300" : "text-rose-300",
            sign: plan.kind === "save" ? "" : "−",
            onunlink: (txId) => unlinkMutation.mutate(txId),
            pendingId: unlinkPendingId,
            setpending: (txId) => (unlinkPendingId = txId),
            loading: unlinkMutation.isPending,
            onmanualadd: plan.kind === "save" ? undefined : () => openManualTx("expense"),
          })}
        {/if}
        {#if incomes.length > 0}
          {@render LinkedSection({
            title: m.plan_linked_income(),
            transactions: incomes,
            amountClass: "text-emerald-300",
            sign: "+",
            onunlink: (txId) => unlinkMutation.mutate(txId),
            pendingId: unlinkPendingId,
            setpending: (txId) => (unlinkPendingId = txId),
            loading: unlinkMutation.isPending,
            onmanualadd: () => openManualTx("expense"),
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

<Dialog
  open={contributionOpen}
  onclose={() => (contributionOpen = false)}
  title={m.plan_contribution_add()}
>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      contributionMutation.mutate();
    }}
    class="space-y-4"
  >
    <p
      class="rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2.5 text-xs leading-relaxed text-sky-100"
    >
      {m.plan_contribution_transaction_notice()}
    </p>
    <p class="text-xs font-medium text-slate-400">
      {planQuery.data?.group_id
        ? m.plan_contribution_scope_group()
        : m.plan_contribution_scope_private()}
    </p>
    <div class="space-y-1">
      <label for="contribution-amount" class="text-xs font-medium text-slate-300"
        >{m.plan_contribution_amount()}</label
      >
      <input
        bind:this={contributionAmountInput}
        id="contribution-amount"
        type="number"
        min="0.01"
        step="0.01"
        required
        bind:value={contributionAmount}
        class="focus:border-accent/40 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none"
      />
    </div>
    <DayPicker
      id="contribution-date"
      value={contributionDate}
      onchange={(value) => (contributionDate = value)}
      label={m.plan_contribution_date()}
    />
    <div class="space-y-1">
      <label for="contribution-note" class="text-xs font-medium text-slate-300"
        >{m.plan_contribution_note()}</label
      >
      <input
        id="contribution-note"
        type="text"
        bind:value={contributionDescription}
        class="focus:border-accent/40 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none"
      />
    </div>
    <button
      type="submit"
      disabled={contributionMutation.isPending || !contributionAmount || contributionAmount <= 0}
      class="bg-accent-gradient w-full rounded-full px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
    >
      {contributionMutation.isPending ? m.common_saving() : m.plan_contribution_add()}
    </button>
  </form>
</Dialog>

<Dialog
  open={correctionOpen}
  onclose={() => (correctionOpen = false)}
  title={m.plan_progress_correction_title()}
>
  <form
    onsubmit={(event) => {
      event.preventDefault();
      correctionMutation.mutate();
    }}
    class="space-y-4"
  >
    <p
      class="rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2.5 text-xs leading-relaxed text-slate-300"
    >
      {m.plan_progress_correction_notice()}
    </p>
    <div class="space-y-1">
      <label for="progress-correction-amount" class="text-xs font-medium text-slate-300">
        {m.plan_progress_correction_amount()}
      </label>
      <input
        id="progress-correction-amount"
        type="number"
        min="0"
        step="0.01"
        required
        bind:value={correctedSavedAmount}
        class="focus:border-accent/40 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none"
      />
    </div>
    <DayPicker
      id="progress-correction-date"
      value={correctionDate}
      onchange={(value) => (correctionDate = value)}
      label={m.plan_progress_correction_date()}
    />
    <div class="space-y-1">
      <label for="progress-correction-note" class="text-xs font-medium text-slate-300">
        {m.plan_progress_correction_note()}
      </label>
      <input
        id="progress-correction-note"
        type="text"
        maxlength="240"
        bind:value={correctionNote}
        class="focus:border-accent/40 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none"
      />
    </div>
    <button
      type="submit"
      disabled={correctionMutation.isPending ||
        correctedSavedAmount == null ||
        correctedSavedAmount < 0}
      class="bg-accent-gradient w-full rounded-full px-4 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
    >
      {correctionMutation.isPending ? m.common_saving() : m.plan_progress_correction_save()}
    </button>
  </form>
</Dialog>

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
  title: string | null;
  transactions: import("$lib/types").TransactionWithCategory[];
  amountClass: string;
  sign: string;
  onunlink: (txId: string) => void;
  pendingId: string | null;
  setpending: (txId: string) => void;
  loading: boolean;
  onmanualadd?: () => void;
})}
  <section class="min-w-0 space-y-2">
    {#if title}
      <h2 class="text-eyebrow text-slate-400">{title}</h2>
    {/if}
    {#if transactions.length === 0}
      <div
        class="space-y-2 rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-400"
      >
        <p>{m.plan_linked_empty()}</p>
        {#if onmanualadd}
          <button
            type="button"
            onclick={onmanualadd}
            class="focus-visible:ring-accent text-xs font-medium text-emerald-400 hover:underline focus-visible:ring-2 focus-visible:outline-none"
          >
            {m.plan_detail_manual_add()}
          </button>
        {/if}
      </div>
    {:else}
      <ul class="space-y-1">
        {#each transactions as tx (tx.id)}
          <li
            class="flex min-w-0 items-center justify-between gap-2 rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2 text-xs"
          >
            <div class="min-w-0 flex-1">
              <div class="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                <p class="truncate font-medium text-slate-200">{tx.description}</p>
                <span
                  class="w-fit shrink-0 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400"
                >
                  {m.plan_linked_badge()}
                </span>
              </div>
              <p class="mt-0.5 truncate text-slate-400">
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
