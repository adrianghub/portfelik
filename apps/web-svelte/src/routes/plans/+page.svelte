<script lang="ts">
  import PlanCard from "$lib/components/plans/PlanCard.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Fab from "$lib/components/ui/Fab.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import { fetchPlanProgressForPlans } from "$lib/services/plan-settlement";
  import { upsertPlanDebtTerms, fetchPlanDebtTermsByPlanIds } from "$lib/services/plan-debt";
  import {
    createPlan,
    deletePlan,
    derivePlanBucket,
    fetchPlans,
    updatePlan,
  } from "$lib/services/plans";
  import type { Plan, PlanKind, PlanSummary } from "$lib/types";
  import { cn } from "$lib/utils";
  import {
    createMutation as createSvelteMutation,
    createQuery,
    useQueryClient,
  } from "@tanstack/svelte-query";
  import { Plus } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();

  const plansQuery = createQuery(() => ({
    queryKey: ["plans"],
    queryFn: fetchPlans,
  }));

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
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

  let groupFilter = $state<"all" | "own" | string>("all");

  const debtPlanIds = $derived(
    (plansQuery.data ?? []).filter((p) => p.kind === "debt").map((p) => p.id)
  );

  const debtTermsQuery = createQuery(() => ({
    queryKey: ["plan-debt-terms-list", debtPlanIds],
    queryFn: () => fetchPlanDebtTermsByPlanIds(debtPlanIds),
    enabled: debtPlanIds.length > 0,
  }));

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
        bucket: derivePlanBucket(plan),
      };
    })
  );

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
  let debtRate = $state("7.18");
  let debtPayment = $state("");
  let categoryId = $state("");
  let groupId = $state("");

  function resetForm(plan?: Plan) {
    editing = plan as PlanSummary | null;
    planKind = plan?.kind ?? "spend";
    name = plan?.name ?? "";
    startDate = plan?.start_date ?? todayIsoLocal();
    endDate = plan?.end_date ?? plan?.start_date ?? todayIsoLocal();
    budgetAmount = plan?.budget_amount != null ? String(plan.budget_amount) : "";
    targetAmount = plan?.target_amount != null ? String(plan.target_amount) : "";
    debtOriginal = "";
    debtBalance = "";
    debtRate = "7.18";
    debtPayment = "";
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
      current_balance: Number(debtBalance || debtOriginal),
      annual_rate: Number(debtRate),
      monthly_payment: Number(debtPayment),
    };
  }

  const createMutation = createSvelteMutation(() => ({
    mutationFn: async () => {
      const plan = await createPlan(formPayload());
      if (planKind === "debt") {
        await upsertPlanDebtTerms(plan.id, debtTermsPayload());
      }
      return plan;
    },
    onSuccess: async () => {
      showForm = false;
      toast.success(m.plan_toast_created());
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const updateMutation = createSvelteMutation(() => ({
    mutationFn: () => updatePlan(editing!.id, formPayload()),
    onSuccess: async () => {
      const id = editing?.id;
      showForm = false;
      editing = null;
      toast.success(m.plan_toast_updated());
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
      if (id) await queryClient.invalidateQueries({ queryKey: ["plan", id] });
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function submitForm(e: SubmitEvent) {
    e.preventDefault();
    if (editing) updateMutation.mutate();
    else createMutation.mutate();
  }

  let deleteTargetId = $state<string | null>(null);
  const deleteMutation = createSvelteMutation(() => ({
    mutationFn: (id: string) => deletePlan(id),
    onSuccess: async () => {
      toast.success(m.plan_toast_deleted());
      await queryClient.invalidateQueries({ queryKey: ["plans"] });
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
          onclick={() => (groupFilter = filter.id as "all" | "own")}
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
          onclick={() => (groupFilter = group.id)}
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
                onedit={resetForm}
                ondelete={(id) => (deleteTargetId = id)}
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
            onedit={resetForm}
            ondelete={(id) => (deleteTargetId = id)}
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
            categoryName={categoryMap.get(plan.category_id ?? "")}
            groupName={groupMap.get(plan.group_id ?? "")}
            onedit={resetForm}
            ondelete={(id) => (deleteTargetId = id)}
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
            onclick={() => (planKind = tile.kind)}
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
      <DayPicker id="plan-start" bind:value={startDate} label={m.plan_form_start_date()} required />
      <DayPicker id="plan-end" bind:value={endDate} label={m.plan_form_end_date()} required />
    </div>

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
            bind:value={debtRate}
            class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
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

<ConfirmDialog
  open={!!deleteTargetId}
  message={m.plan_delete_confirm()}
  pending={deleteMutation.isPending}
  onclose={() => (deleteTargetId = null)}
  onconfirm={() => deleteTargetId && deleteMutation.mutate(deleteTargetId)}
/>
