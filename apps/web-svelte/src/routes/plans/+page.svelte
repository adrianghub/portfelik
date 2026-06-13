<script lang="ts">
  import { afterNavigate, beforeNavigate } from "$app/navigation";
  import { page } from "$app/stores";
  import PlanCard from "$lib/components/plans/PlanCard.svelte";
  import NetWorthHero from "$lib/components/plans/NetWorthHero.svelte";
  import SurplusCard from "$lib/components/plans/SurplusCard.svelte";
  import { buildPlanningQueueActions } from "$lib/services/planning-queue";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Fab from "$lib/components/ui/Fab.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups, fetchMyGroupRoles } from "$lib/services/groups";
  import { fetchPlanProgressForPlans } from "$lib/services/plan-settlement";
  import {
    upsertPlanDebtTerms,
    fetchPlanDebtTermsByPlanIds,
    normalizeDebtTermsInput,
  } from "$lib/services/plan-debt";
  import {
    collectNetWorthDebtBalances,
    computeNetWorth,
    fetchFinancialSnapshot,
    upsertFinancialSnapshot,
  } from "$lib/services/financial-snapshots";
  import {
    computeMonthlySurplus,
    currentCalendarMonthBounds,
    gateObservedDebtCoverage,
    sumDebtMonthlyPayments,
    sumSaveMonthlyNeeded,
  } from "$lib/services/financial-surplus";
  import { extractPostgrestError, postgrestErrorCode } from "$lib/services/supabase-errors";
  import {
    createPlan,
    canManagePlan,
    defaultDebtPlanEndDate,
    deletePlan,
    derivePlanBucket,
    fetchPlans,
    updatePlan,
  } from "$lib/services/plans";
  import { supabase } from "$lib/supabase";
  import type { Plan, PlanKind, PlanSummary } from "$lib/types";
  import { cn } from "$lib/utils";
  import { syncListViewUrl } from "$lib/utils/navigation";
  import { parseScopeFilter, type ScopeFilter } from "$lib/utils/list-view-url";
  import {
    restoreScrollPosition,
    saveScrollPosition,
    scrollRestoreKey,
  } from "$lib/utils/scroll-restore";
  import {
    createMutation as createSvelteMutation,
    createQuery,
    useQueryClient,
  } from "@tanstack/svelte-query";
  import { Plus } from "lucide-svelte";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { computeLedgerSummary } from "$lib/services/transaction-cashflow";
  import { fetchTransactions } from "$lib/services/transactions";

  const queryClient = useQueryClient();
  const plansHubPath = "/plans";

  beforeNavigate(({ from, to }) => {
    if (from?.url.pathname === plansHubPath && to && to.url.pathname !== plansHubPath) {
      saveScrollPosition(scrollRestoreKey(plansHubPath));
    }
  });

  afterNavigate(({ to }) => {
    if (to?.url.pathname === plansHubPath) {
      restoreScrollPosition(scrollRestoreKey(plansHubPath));
    }
  });

  const groupFilter = $derived(parseScopeFilter($page.url.searchParams));

  function setGroupFilter(scope: ScopeFilter) {
    syncListViewUrl(plansHubPath, $page.url.searchParams, { group: scope });
  }

  let currentUserId = $state<string | null>(null);
  let hubOnboardingDismissed = $state(false);
  onMount(async () => {
    hubOnboardingDismissed = localStorage.getItem("plans-hub-onboarding") === "1";
    const { data } = await supabase.auth.getSession();
    currentUserId = data.session?.user.id ?? null;
  });

  function dismissHubOnboarding() {
    hubOnboardingDismissed = true;
    localStorage.setItem("plans-hub-onboarding", "1");
  }

  const plansQuery = createQuery(() => ({
    queryKey: ["plans"],
    queryFn: fetchPlans,
  }));

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
  }));

  const groupRolesQuery = createQuery(() => ({
    queryKey: ["my-group-roles"],
    queryFn: fetchMyGroupRoles,
  }));

  const monthBounds = $derived(currentCalendarMonthBounds());

  const monthTxQuery = createQuery(() => ({
    queryKey: ["transactions", "plans-surplus", monthBounds.start, monthBounds.end],
    queryFn: () => fetchTransactions(monthBounds.start, monthBounds.end),
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  const categoryMap = $derived(new Map((categoriesQuery.data ?? []).map((c) => [c.id, c.name])));
  const groupMap = $derived(new Map((groupsQuery.data ?? []).map((g) => [g.id, g.name])));
  const planIds = $derived((plansQuery.data ?? []).map((p) => p.id));

  const progressQuery = createQuery(() => ({
    queryKey: ["plan-progress-list", planIds],
    queryFn: () => fetchPlanProgressForPlans(planIds),
    enabled: planIds.length > 0,
  }));

  const debtPlanIds = $derived(
    (plansQuery.data ?? []).filter((p) => p.kind === "debt").map((p) => p.id)
  );

  const debtTermsQuery = createQuery(() => ({
    queryKey: ["plan-debt-terms-list", debtPlanIds],
    queryFn: () => fetchPlanDebtTermsByPlanIds(debtPlanIds),
    enabled: debtPlanIds.length > 0,
  }));

  const snapshotQuery = createQuery(() => ({
    queryKey: ["financial-snapshot"],
    queryFn: fetchFinancialSnapshot,
  }));

  // Debts are valued as of today (matching the plan detail headline); only assets keep
  // the manual snapshot date.
  const linkedExpensesByPlanId = $derived(
    Object.fromEntries(
      Object.entries(progressQuery.data ?? {}).map(([planId, p]) => [planId, p.linkedExpenses])
    )
  );

  const debtBalances = $derived(
    collectNetWorthDebtBalances(
      plansQuery.data ?? [],
      debtTermsQuery.data ?? {},
      todayIsoLocal(),
      linkedExpensesByPlanId
    )
  );

  const netWorth = $derived(computeNetWorth(snapshotQuery.data ?? null, debtBalances));

  function planCanManage(plan: PlanSummary): boolean {
    if (!currentUserId) return false;
    return canManagePlan(plan, currentUserId, groupRolesQuery.data ?? new Map());
  }

  const summaries = $derived(
    (plansQuery.data ?? []).map((plan): PlanSummary => {
      const progress = progressQuery.data?.[plan.id];
      return {
        ...plan,
        kind: plan.kind ?? "spend",
        spentAmount: progress?.spentAmount ?? 0,
        incomeAmount: progress?.incomeAmount ?? 0,
        savedAmount: progress?.savedAmount ?? 0,
        linkedCount: progress?.linkedCount ?? 0,
        eligibleCount: progress?.eligibleCount ?? 0,
        monthlyNeeded: progress?.monthlyNeeded ?? null,
        monthlyActual: progress?.monthlyActual ?? null,
        monthlyActualBasis: progress?.monthlyActualBasis,
        bucket: derivePlanBucket(plan),
      };
    })
  );

  const scopedMonthTxs = $derived.by(() => {
    if (!monthTxQuery.data) return [];
    return monthTxQuery.data.filter((tx) => {
      if (groupFilter === "all") return true;
      if (groupFilter === "own") return tx.group_id === null;
      return tx.group_id === groupFilter;
    });
  });

  const scopedSummaries = $derived(
    summaries.filter((p) => {
      if (groupFilter === "all") return true;
      if (groupFilter === "own") return p.group_id === null;
      return p.group_id === groupFilter;
    })
  );

  const scopedDebtTerms = $derived.by(() => {
    const terms = debtTermsQuery.data ?? {};
    const scopedIds = new Set(
      (plansQuery.data ?? [])
        .filter((p) => {
          if (groupFilter === "all") return true;
          if (groupFilter === "own") return p.group_id === null;
          return p.group_id === groupFilter;
        })
        .map((p) => p.id)
    );
    return Object.fromEntries(Object.entries(terms).filter(([planId]) => scopedIds.has(planId)));
  });

  const monthlySurplus = $derived.by(() => {
    const monthSummary = monthTxQuery.data ? computeLedgerSummary(scopedMonthTxs) : null;
    if (!monthSummary) return null;
    // Observed debt-payment coverage: sum of current-month linked expenses across active debt
    // plans. Pass it only when coverage is actually observed (> 0); an unlinked-but-imported
    // rata would otherwise be double-counted and the estimate note would vanish.
    const observedDebtCoverage = progressQuery.data
      ? scopedSummaries
          .filter((p) => p.kind === "debt" && p.bucket === "active")
          .reduce((sum, p) => sum + (progressQuery.data?.[p.id]?.linkedExpenseCurrentMonth ?? 0), 0)
      : 0;
    const debtPaymentsInExpenses = gateObservedDebtCoverage(observedDebtCoverage);
    // Deposits already made this month (linked income on active save plans) are credited
    // against the monthly pace - saving toward a goal must not read as falling behind.
    const saveContributionsThisMonth = progressQuery.data
      ? scopedSummaries
          .filter((p) => p.kind === "save" && p.bucket === "active")
          .reduce((sum, p) => sum + (progressQuery.data?.[p.id]?.linkedIncomeCurrentMonth ?? 0), 0)
      : 0;
    return computeMonthlySurplus({
      totalIncome: monthSummary.total_income,
      totalExpenses: monthSummary.total_expenses,
      debtMonthlyPayments: sumDebtMonthlyPayments(scopedSummaries, scopedDebtTerms),
      saveMonthlyNeeded: sumSaveMonthlyNeeded(scopedSummaries),
      debtPaymentsInExpenses,
      saveContributionsThisMonth,
    });
  });

  const planningActions = $derived.by(() => {
    if (!monthlySurplus) return [];
    return buildPlanningQueueActions({
      summaries: scopedSummaries,
      monthlySurplus,
      debtTerms: scopedDebtTerms,
    });
  });

  const hasActivePlans = $derived((plansQuery.data?.length ?? 0) > 0);

  const filteredPlans = $derived(
    summaries.filter((p) => {
      if (groupFilter === "all") return true;
      if (groupFilter === "own") return p.group_id === null;
      return p.group_id === groupFilter;
    })
  );
  const activePlans = $derived(
    filteredPlans.filter((p) => p.kind === "spend" && p.bucket === "active")
  );
  const upcomingPlans = $derived(
    filteredPlans.filter((p) => p.kind === "spend" && p.bucket === "upcoming")
  );
  const finishedPlans = $derived(
    filteredPlans.filter((p) => p.kind === "spend" && p.bucket === "finished")
  );
  const savePlans = $derived(filteredPlans.filter((p) => p.kind === "save"));
  const debtPlans = $derived(filteredPlans.filter((p) => p.kind === "debt"));

  function todayIsoLocal(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  let showForm = $state(false);
  let editing = $state<PlanSummary | null>(null);
  let planKind = $state<PlanKind>("spend");
  let name = $state("");
  let startDate = $state(todayIsoLocal());
  let endDate = $state(todayIsoLocal());
  let budgetAmount = $state("");
  let targetAmount = $state("");
  let debtOriginal = $state("");
  let debtBalance = $state("");
  let debtRate = $state("1");
  let debtPayment = $state("");
  let categoryId = $state("");
  let groupId = $state("");

  let showNetWorthForm = $state(false);
  let snapshotDate = $state("");
  let snapshotCash = $state("");
  let snapshotInvest = $state("");
  let snapshotEstate = $state("");

  function openNetWorthForm() {
    const snap = snapshotQuery.data;
    snapshotDate = snap?.as_of_date ?? todayIsoLocal();
    snapshotCash = snap ? String(snap.cash_amount) : "";
    snapshotInvest = snap ? String(snap.investments_amount) : "";
    snapshotEstate = snap ? String(snap.real_estate_amount) : "";
    showNetWorthForm = true;
  }

  const snapshotMutation = createSvelteMutation(() => ({
    mutationFn: () =>
      upsertFinancialSnapshot({
        as_of_date: snapshotDate,
        cash_amount: snapshotCash === "" ? 0 : Number(snapshotCash),
        investments_amount: snapshotInvest === "" ? 0 : Number(snapshotInvest),
        real_estate_amount: snapshotEstate === "" ? 0 : Number(snapshotEstate),
      }),
    onSuccess: async () => {
      showNetWorthForm = false;
      toast.success(m.plans_net_worth_toast_saved());
      await queryClient.invalidateQueries({ queryKey: ["financial-snapshot"] });
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function applyDebtDateDefaults() {
    startDate = todayIsoLocal();
    endDate = defaultDebtPlanEndDate(startDate);
  }

  function resetForm(plan?: Plan) {
    editing = plan as PlanSummary | null;
    planKind = plan?.kind ?? "spend";
    name = plan?.name ?? "";
    if (plan) {
      startDate = plan.start_date;
      endDate = plan.end_date;
    } else if (planKind === "debt") {
      applyDebtDateDefaults();
    } else {
      startDate = todayIsoLocal();
      endDate = todayIsoLocal();
    }
    budgetAmount = plan?.budget_amount != null ? String(plan.budget_amount) : "";
    targetAmount = plan?.target_amount != null ? String(plan.target_amount) : "";
    debtOriginal = "";
    debtBalance = "";
    debtRate = "1";
    debtPayment = "";
    if (plan?.kind === "debt") {
      const terms = debtTermsQuery.data?.[plan.id];
      if (terms) {
        debtOriginal = String(terms.original_amount);
        debtBalance = String(terms.current_balance);
        debtRate = String(terms.annual_rate);
        debtPayment = String(terms.monthly_payment);
      }
    }
    categoryId = plan?.category_id ?? "";
    groupId = plan?.group_id ?? "";
    showForm = true;
  }

  function formPayload() {
    return {
      name,
      kind: planKind,
      start_date: startDate,
      end_date: endDate,
      budget_amount: planKind === "spend" && budgetAmount !== "" ? Number(budgetAmount) : null,
      target_amount:
        planKind === "save" && targetAmount !== ""
          ? Number(targetAmount)
          : planKind === "debt" && debtOriginal !== ""
            ? Number(debtOriginal)
            : null,
      category_id: categoryId || null,
      group_id: groupId || null,
    };
  }

  function debtTermsPayload() {
    return {
      original_amount: Number(debtOriginal),
      current_balance: debtBalance !== "" ? Number(debtBalance) : Number(debtOriginal),
      annual_rate: Number(debtRate),
      monthly_payment: Number(debtPayment),
    };
  }

  function toastPlanError(err: unknown) {
    console.error("[plans]", err);
    const message = err instanceof Error ? err.message : "";
    switch (message) {
      case "debt_original_required":
        toast.error(m.plan_debt_original_required());
        return;
      case "debt_payment_required":
        toast.error(m.plan_debt_payment_required());
        return;
      case "debt_rate_invalid":
        toast.error(m.plan_debt_rate_invalid());
        return;
      case "debt_balance_exceeds_original":
        toast.error(m.plan_debt_balance_exceeds_original());
        return;
      case "debt_terms_save_failed": {
        const causeCode = err instanceof Error ? postgrestErrorCode(err.cause) : null;
        if (causeCode === "42P01" || causeCode === "PGRST205" || causeCode === "42703") {
          toast.error(m.plan_db_migration_required());
          return;
        }
        if (causeCode === "42501") {
          toast.error(m.plan_db_permission_denied());
          return;
        }
        toast.error(m.plan_debt_terms_save_failed());
        return;
      }
      case "name_required":
        toast.error(m.plan_form_name_required());
        return;
      case "date_required":
      case "date_order":
        toast.error(m.plan_form_dates_invalid());
        return;
      case "target_required":
        toast.error(m.plan_form_target_required());
        return;
      case "budget_invalid":
        toast.error(m.plan_form_budget_invalid());
        return;
      default: {
        const pgCode = postgrestErrorCode(err);
        if (pgCode === "42P01" || pgCode === "PGRST205" || pgCode === "42703") {
          toast.error(m.plan_db_migration_required());
          return;
        }
        if (pgCode === "42501") {
          toast.error(m.plan_db_permission_denied());
          return;
        }
        if (pgCode === "23514" || pgCode === "23505") {
          toast.error(m.plan_db_constraint_failed());
          return;
        }
        const pg = extractPostgrestError(err);
        if (pg?.message) {
          toast.error(pg.message);
          return;
        }
        toast.error(m.toast_error());
      }
    }
  }

  function validatedDebtTerms() {
    return normalizeDebtTermsInput(debtTermsPayload());
  }

  const createMutation = createSvelteMutation(() => ({
    mutationFn: async () => {
      const debtTerms = planKind === "debt" ? validatedDebtTerms() : null;
      const plan = await createPlan(formPayload());
      if (planKind === "debt" && debtTerms) {
        try {
          await upsertPlanDebtTerms(plan.id, debtTerms);
        } catch (err) {
          console.error("[plans] plan_debt_terms upsert failed", err);
          try {
            await deletePlan(plan.id);
          } catch (rollbackErr) {
            console.error("[plans] debt plan rollback failed", rollbackErr);
          }
          throw new Error("debt_terms_save_failed", { cause: err });
        }
      }
      return plan;
    },
    onSuccess: async () => {
      showForm = false;
      toast.success(m.plan_toast_created());
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-debt-terms-list"] });
    },
    onError: (err) => toastPlanError(err),
  }));

  const updateMutation = createSvelteMutation(() => ({
    mutationFn: async () => {
      const id = editing!.id;
      const plan = await updatePlan(id, formPayload());
      if (planKind === "debt") {
        await upsertPlanDebtTerms(id, validatedDebtTerms());
      }
      return plan;
    },
    onSuccess: async () => {
      const id = editing?.id;
      showForm = false;
      editing = null;
      toast.success(m.plan_toast_updated());
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-debt-terms-list"] });
      if (id) {
        await queryClient.invalidateQueries({ queryKey: ["plan", id] });
        await queryClient.invalidateQueries({ queryKey: ["plan-debt-terms", id] });
      }
    },
    onError: (err) => toastPlanError(err),
  }));

  function submitForm(e: SubmitEvent) {
    e.preventDefault();
    if (planKind === "debt") {
      try {
        validatedDebtTerms();
      } catch (err) {
        toastPlanError(err);
        return;
      }
    }
    if (editing) updateMutation.mutate();
    else createMutation.mutate();
  }

  let deleteTargetId = $state<string | null>(null);
  const deleteMutation = createSvelteMutation(() => ({
    mutationFn: (id: string) => deletePlan(id),
    onSuccess: async () => {
      toast.success(m.plan_toast_deleted());
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress-list"] });
      await queryClient.invalidateQueries({ queryKey: ["plan-debt-terms-list"] });
    },
    onError: () => toast.error(m.toast_error()),
    onSettled: () => (deleteTargetId = null),
  }));
</script>

<svelte:head>
  <title>{m.nav_plans()} · Portfelik</title>
</svelte:head>

<div class="container mx-auto max-w-3xl space-y-5 px-4 py-6">
  <div class="flex items-center justify-between gap-3">
    <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">{m.nav_plans()}</h1>
    <button
      type="button"
      onclick={() => resetForm()}
      class="bg-accent-gradient focus-visible:ring-accent hidden items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none md:inline-flex"
    >
      <Plus size={16} aria-hidden="true" />
      {m.plan_form_title_add()}
    </button>
  </div>

  <p class="text-sm text-slate-400">{m.plans_tagline()}</p>

  {#if !hubOnboardingDismissed && !hasActivePlans}
    <div
      class="flex items-start justify-between gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3"
      role="status"
    >
      <p class="text-sm text-slate-300">{m.plans_hub_onboarding()}</p>
      <button
        type="button"
        onclick={dismissHubOnboarding}
        class="focus-visible:ring-accent shrink-0 rounded-full border border-white/10 px-3 py-1 text-xs font-medium text-slate-200 hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.plans_hub_onboarding_dismiss()}
      </button>
    </div>
  {/if}

  {#if snapshotQuery.isLoading}
    <div class="h-36 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
  {:else}
    <NetWorthHero summary={netWorth} onedit={openNetWorthForm} />
  {/if}

  {#if monthTxQuery.isLoading}
    <div class="h-28 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
  {:else if monthlySurplus}
    <SurplusCard summary={monthlySurplus} actions={planningActions} />
  {/if}

  {#if plansQuery.isLoading}
    <div class="grid gap-3 sm:grid-cols-2">
      {#each Array(4) as _, i (i)}
        <div class="h-32 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
      {/each}
    </div>
  {:else if plansQuery.isError}
    <p class="text-sm text-rose-600">{m.common_error_title()}</p>
  {:else}
    {#if (plansQuery.data?.length ?? 0) === 0}
      <p class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-400">
        {m.plans_empty_hint()}
      </p>
    {/if}

    <div role="tablist" aria-label={m.group_filter_label()} class="flex flex-wrap gap-1">
      {#each [{ id: "all", label: m.group_filter_all() }, { id: "own", label: m.group_filter_own() }] as filter (filter.id)}
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === filter.id}
          onclick={() => setGroupFilter(filter.id as ScopeFilter)}
          class={cn(
            "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
            groupFilter === filter.id
              ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
              : "border border-white/5 text-slate-300 hover:bg-white/5"
          )}
        >
          {filter.label}
        </button>
      {/each}
      {#each groupsQuery.data ?? [] as group (group.id)}
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === group.id}
          onclick={() => setGroupFilter(group.id)}
          class={cn(
            "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
            groupFilter === group.id
              ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
              : "border border-white/5 text-slate-300 hover:bg-white/5"
          )}
        >
          {group.name}
        </button>
      {/each}
    </div>

    {#each [{ title: m.plans_section_active(), plans: activePlans, empty: m.plans_section_active_empty() }, { title: m.plans_section_upcoming(), plans: upcomingPlans, empty: m.plans_section_upcoming_empty() }, { title: m.plans_section_finished(), plans: finishedPlans, empty: m.plans_section_finished_empty() }] as section (section.title)}
      {#if section.plans.length > 0 || section.title === m.plans_section_active()}
        <section class="space-y-2">
          <h2 class="text-xs font-medium tracking-wide text-slate-400 uppercase">
            {m.plans_section_spend()} · {section.title}
          </h2>
          {#if section.plans.length === 0}
            <p
              class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-400"
            >
              {section.empty}
            </p>
          {:else}
            {#each section.plans as plan (plan.id)}
              <PlanCard
                {plan}
                categoryName={categoryMap.get(plan.category_id ?? "")}
                groupName={groupMap.get(plan.group_id ?? "")}
                onedit={planCanManage(plan) ? resetForm : undefined}
                ondelete={planCanManage(plan) ? (id) => (deleteTargetId = id) : undefined}
              />
            {/each}
          {/if}
        </section>
      {/if}
    {/each}

    <section class="space-y-2">
      <h2 class="text-xs font-medium tracking-wide text-slate-400 uppercase">
        {m.plans_section_save()}
      </h2>
      {#if savePlans.length === 0}
        <p
          class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-400"
        >
          {m.plans_section_save_empty()}
        </p>
      {:else}
        {#each savePlans as plan (plan.id)}
          <PlanCard
            {plan}
            categoryName={categoryMap.get(plan.category_id ?? "")}
            groupName={groupMap.get(plan.group_id ?? "")}
            onedit={planCanManage(plan) ? resetForm : undefined}
            ondelete={planCanManage(plan) ? (id) => (deleteTargetId = id) : undefined}
          />
        {/each}
      {/if}
    </section>

    <section class="space-y-2">
      <h2 class="text-xs font-medium tracking-wide text-slate-400 uppercase">
        {m.plans_section_debt()}
      </h2>
      {#if debtPlans.length === 0}
        <p
          class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-400"
        >
          {m.plans_section_debt_empty()}
        </p>
      {:else}
        {#each debtPlans as plan (plan.id)}
          <PlanCard
            {plan}
            debtTerms={debtTermsQuery.data?.[plan.id]}
            linkedExpenses={progressQuery.data?.[plan.id]?.linkedExpenses ?? []}
            categoryName={categoryMap.get(plan.category_id ?? "")}
            groupName={groupMap.get(plan.group_id ?? "")}
            onedit={planCanManage(plan) ? resetForm : undefined}
            ondelete={planCanManage(plan) ? (id) => (deleteTargetId = id) : undefined}
          />
        {/each}
      {/if}
    </section>
  {/if}
</div>

<Fab onclick={() => resetForm()} aria-label={m.plan_form_title_add()} />

<Dialog
  open={showForm}
  onclose={() => {
    showForm = false;
    editing = null;
  }}
  title={editing ? m.plan_form_title_edit() : m.plan_form_title_add()}
>
  <form onsubmit={submitForm} class="space-y-4">
    <div class="space-y-1">
      <p class="text-xs font-medium text-slate-300">{m.plan_form_kind()}</p>
      <div class="grid grid-cols-3 gap-2">
        {#each [{ kind: "spend" as PlanKind, label: m.plan_kind_spend() }, { kind: "save" as PlanKind, label: m.plan_kind_save() }, { kind: "debt" as PlanKind, label: m.plan_kind_debt() }] as tile (tile.kind)}
          <button
            type="button"
            disabled={!!editing}
            onclick={() => {
              planKind = tile.kind;
              if (!editing && tile.kind === "debt") applyDebtDateDefaults();
            }}
            class={cn(
              "rounded-xl border px-2 py-2 text-xs font-semibold transition-colors",
              planKind === tile.kind
                ? "border-accent/40 bg-accent/15 text-accent"
                : "border-white/10 text-slate-400 hover:bg-white/5"
            )}
          >
            {tile.label}
          </button>
        {/each}
      </div>
    </div>

    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="plan-name">
        {m.plan_form_name()}
      </label>
      <input
        id="plan-name"
        type="text"
        required
        bind:value={name}
        class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-2">
      <DayPicker
        id="plan-start"
        bind:value={startDate}
        label={m.plan_form_start_date()}
        yearsPast={planKind === "debt" ? 50 : 100}
        yearsAhead={planKind === "debt" ? 1 : 15}
        required
      />
      <DayPicker
        id="plan-end"
        bind:value={endDate}
        label={planKind === "debt" ? m.plan_form_end_date_debt() : m.plan_form_end_date()}
        yearsPast={planKind === "debt" ? 0 : 100}
        yearsAhead={planKind === "debt" ? 100 : 15}
        required
      />
    </div>
    {#if planKind === "debt"}
      <p class="text-xs text-slate-500">{m.plan_form_debt_dates_hint()}</p>
    {/if}

    {#if planKind === "spend"}
      <div class="space-y-1">
        <label class="text-xs font-medium text-slate-300" for="plan-budget">
          {m.plan_form_budget()}
        </label>
        <input
          id="plan-budget"
          type="number"
          min="0.01"
          step="0.01"
          bind:value={budgetAmount}
          placeholder={m.plan_form_budget_placeholder()}
          class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
        />
      </div>
    {:else if planKind === "save"}
      <div class="space-y-1">
        <label class="text-xs font-medium text-slate-300" for="plan-target">
          {m.plan_form_target()}
        </label>
        <input
          id="plan-target"
          type="number"
          min="0.01"
          step="0.01"
          required
          bind:value={targetAmount}
          placeholder={m.plan_form_target_placeholder()}
          class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
        />
      </div>
    {:else}
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1">
          <label class="text-xs font-medium text-slate-300" for="debt-original"
            >{m.plan_debt_original()}</label
          >
          <input
            id="debt-original"
            type="number"
            min="0.01"
            step="0.01"
            required
            bind:value={debtOriginal}
            class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div class="space-y-1">
          <label class="text-xs font-medium text-slate-300" for="debt-balance"
            >{m.plan_debt_balance()}</label
          >
          <input
            id="debt-balance"
            type="number"
            min="0"
            step="0.01"
            bind:value={debtBalance}
            class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          />
        </div>
        <div class="space-y-1">
          <label class="text-xs font-medium text-slate-300" for="debt-rate"
            >{m.plan_debt_rate()}</label
          >
          <input
            id="debt-rate"
            type="number"
            min="0"
            step="0.01"
            required
            placeholder={m.plan_debt_rate_placeholder()}
            bind:value={debtRate}
            class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
        </div>
        <div class="space-y-1">
          <label class="text-xs font-medium text-slate-300" for="debt-payment"
            >{m.plan_debt_payment()}</label
          >
          <input
            id="debt-payment"
            type="number"
            min="0.01"
            step="0.01"
            required
            bind:value={debtPayment}
            class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
          />
        </div>
      </div>
    {/if}

    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="plan-category">
        {m.plan_form_category()}
      </label>
      <select
        id="plan-category"
        bind:value={categoryId}
        class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur focus:ring-2 focus:outline-none"
      >
        <option value="">{m.plan_form_no_category()}</option>
        {#each categoriesQuery.data ?? [] as category (category.id)}
          <option value={category.id}>{category.name}</option>
        {/each}
      </select>
    </div>

    {#if (groupsQuery.data?.length ?? 0) > 0}
      <div class="space-y-1">
        <label class="text-xs font-medium text-slate-300" for="plan-group">
          {m.plan_form_group()}
        </label>
        <select
          id="plan-group"
          bind:value={groupId}
          class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur focus:ring-2 focus:outline-none"
        >
          <option value="">{m.plan_form_no_group()}</option>
          {#each groupsQuery.data ?? [] as group (group.id)}
            <option value={group.id}>{group.name}</option>
          {/each}
        </select>
      </div>
    {/if}

    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => {
          showForm = false;
          editing = null;
        }}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={createMutation.isPending || updateMutation.isPending}
        class="bg-accent-gradient focus-visible:ring-accent flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        {createMutation.isPending || updateMutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>

<Dialog
  open={showNetWorthForm}
  onclose={() => (showNetWorthForm = false)}
  title={m.plans_net_worth_edit_title()}
>
  <form
    class="space-y-4"
    onsubmit={(e) => {
      e.preventDefault();
      snapshotMutation.mutate();
    }}
  >
    <p class="text-xs text-slate-400">{m.plans_net_worth_manual_note()}</p>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="snapshot-date">
        {m.plans_net_worth_as_of_label()}
      </label>
      <DayPicker
        id="snapshot-date"
        bind:value={snapshotDate}
        label={m.plans_net_worth_as_of_label()}
        showLabel={false}
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="snapshot-cash">
        {m.plans_net_worth_cash()}
      </label>
      <input
        id="snapshot-cash"
        type="number"
        min="0"
        step="0.01"
        bind:value={snapshotCash}
        placeholder="0"
        class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="snapshot-invest">
        {m.plans_net_worth_investments()}
      </label>
      <input
        id="snapshot-invest"
        type="number"
        min="0"
        step="0.01"
        bind:value={snapshotInvest}
        placeholder="0"
        class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="snapshot-estate">
        {m.plans_net_worth_real_estate()}
      </label>
      <input
        id="snapshot-estate"
        type="number"
        min="0"
        step="0.01"
        bind:value={snapshotEstate}
        placeholder="0"
        class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
      />
    </div>
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showNetWorthForm = false)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={snapshotMutation.isPending}
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
      >
        {snapshotMutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>

<ConfirmDialog
  open={!!deleteTargetId}
  message={m.plan_delete_confirm()}
  pending={deleteMutation.isPending}
  onclose={() => (deleteTargetId = null)}
  onconfirm={() => deleteTargetId && deleteMutation.mutate(deleteTargetId)}
/>
