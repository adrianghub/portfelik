<script lang="ts">
  import { goto } from "$app/navigation";
  import { accentConfettiColors } from "$lib/theme/accent-presets";
  import { page } from "$app/stores";
  import DoneView from "$lib/components/shopping-lists/DoneView.svelte";
  import PlanSettleSheet from "$lib/components/shopping-lists/PlanSettleSheet.svelte";
  import PlanningView from "$lib/components/shopping-lists/PlanningView.svelte";
  import ShoppingView from "$lib/components/shopping-lists/ShoppingView.svelte";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import {
    computePlanProgress,
    fetchLinkedTransactions,
    fetchEligibleSettlementTransactions,
    unlinkPlanTransaction,
  } from "$lib/services/plan-settlement";
  import {
    completeShoppingList,
    deriveShoppingListMode,
    duplicateShoppingList,
    fetchShoppingListById,
    returnShoppingListToPlanning,
    startShoppingList,
    updateShoppingList,
  } from "$lib/services/shopping-lists";
  import type { ShoppingListWithItems } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import {
    ArrowLeft,
    CalendarDays,
    Link2,
    Link2Off,
    List,
    ListPlus,
    MoreVertical,
    Pencil,
    Sparkles,
    X,
    Users,
  } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();
  const id = $derived($page.params.id ?? "");

  const query = createQuery(() => ({
    queryKey: ["shopping_list", id],
    queryFn: () => fetchShoppingListById(id),
    enabled: !!id,
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
  }));

  const linkedTransactionsQuery = createQuery(() => ({
    queryKey: ["plan-links", id],
    queryFn: () => fetchLinkedTransactions(id),
    enabled: !!id,
  }));

  const expenseCategories = $derived(
    categoriesQuery.data?.filter((c) => c.type === "expense") ?? []
  );

  const listKey = $derived(["shopping_list", id] as const);
  const mode = $derived(query.data ? deriveShoppingListMode(query.data) : "planning");
  const isPlanning = $derived(mode === "planning");
  const isShopping = $derived(mode === "shopping");
  const isDone = $derived(mode === "done");
  let showChecklist = $state(false);
  const hasChecklistState = $derived(!!query.data && mode !== "planning");
  const showChecklistSection = $derived(hasChecklistState || showChecklist);
  const itemTotal = $derived(query.data?.shopping_list_items.length ?? 0);
  const itemDone = $derived(query.data?.shopping_list_items.filter((i) => i.completed).length ?? 0);
  const hasItems = $derived(itemTotal > 0);
  const eligibleQuery = createQuery(() => ({
    queryKey: ["plan-eligible", id],
    queryFn: () => fetchEligibleSettlementTransactions(id),
    enabled: !!id,
  }));

  const settlementProgress = $derived(
    query.data
      ? computePlanProgress({
          planId: id,
          planName: query.data.name,
          plannedAmount: query.data.total_amount,
          linkedTransactions: linkedTransactionsQuery.data ?? [],
          eligibleCount: eligibleQuery.data?.length ?? 0,
        })
      : null
  );

  let showRenameList = $state(false);
  let renameListName = $state("");
  let renameListGroupId = $state<string | null>(null);
  let renameListDate = $state("");
  let menuOpen = $state(false);

  function toDateInput(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function openRenameListDialog() {
    menuOpen = false;
    renameListName = query.data?.name ?? "";
    renameListGroupId = query.data?.group_id ?? null;
    renameListDate = query.data?.planned_for ?? toDateInput(query.data?.created_at);
    showRenameList = true;
  }

  const renameListMutation = createMutation(() => ({
    mutationFn: (vars: { name: string; group_id: string | null; planned_for: string }) =>
      updateShoppingList(id, vars),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          name: vars.name,
          group_id: vars.group_id,
          planned_for: vars.planned_for,
        });
      }
      showRenameList = false;
      return { previous };
    },
    onSuccess: () => toast.success(m.toast_shopping_list_updated()),
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  function submitRenameList(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = renameListName.trim();
    if (!trimmed || !renameListDate) return;
    renameListMutation.mutate({
      name: trimmed,
      group_id: renameListGroupId,
      planned_for: renameListDate,
    });
  }

  const startMutation = createMutation(() => ({
    mutationFn: () => startShoppingList(id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_started_at: new Date().toISOString(),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  const returnMutation = createMutation(() => ({
    mutationFn: () => returnShoppingListToPlanning(id),
    onMutate: async () => {
      menuOpen = false;
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_started_at: null,
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  let showComplete = $state(false);
  let showSettle = $state(false);
  let showBroadSheet = $state(false);
  let unlinkPendingId = $state<string | null>(null);
  let showUncheckedComplete = $state(false);
  let completeAmount = $state("");
  let completeCategoryId = $state("");
  let createTx = $state(false);

  function openCompleteDialog() {
    completeAmount = "";
    completeCategoryId = query.data?.category_id ?? "";
    createTx = false;
    showComplete = true;
  }

  function openSettleSheet() {
    showSettle = true;
  }

  function requestComplete() {
    const data = query.data;
    if (!data) return;
    const total = data.shopping_list_items.length;
    const done = data.shopping_list_items.filter((i) => i.completed).length;
    if (total > 0 && done < total) {
      showUncheckedComplete = true;
      return;
    }
    openCompleteDialog();
  }

  function continueCompleteDialog() {
    showUncheckedComplete = false;
    openCompleteDialog();
  }

  const completeMutation = createMutation(() => ({
    mutationFn: () =>
      completeShoppingList(
        id,
        completeAmount === "" ? null : parseFloat(completeAmount),
        completeCategoryId || null,
        createTx
      ),
    onSuccess: async () => {
      showComplete = false;
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.shopping_list_completed_celebration());
      try {
        const { default: confetti } = await import("canvas-confetti");
        confetti({
          particleCount: 100,
          spread: 75,
          origin: { y: 0.7 },
          colors: accentConfettiColors(),
        });
      } catch {
        // Confetti is decorative; ignore environment failures.
      }
      await goto("/plans");
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? "";
      if (msg.includes("list_empty")) {
        toast.error(m.toast_list_empty());
        return;
      }
      toast.error(m.toast_error());
    },
  }));

  function submitComplete(e: Event) {
    e.preventDefault();
    completeMutation.mutate();
  }

  const duplicateMutation = createMutation(() => ({
    mutationFn: () => duplicateShoppingList(id),
    onSuccess: async (newList) => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      toast.success(m.toast_shopping_list_duplicated());
      await goto(`/plans/${newList.id}`);
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const unlinkMutation = createMutation(() => ({
    mutationFn: (txId: string) => unlinkPlanTransaction(id, txId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-links", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-eligible", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      toast.success(m.plan_settle_unlinked());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function plannedForLabel(date: string | null | undefined): string {
    if (!date) return "";
    const parts = date.split("-").map(Number);
    if (parts.length === 3 && parts.every((n) => !Number.isNaN(n))) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return formatDate(d.toISOString());
    }
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return date ?? "";
    return formatDate(d.toISOString());
  }
</script>

<div class="mobile-detail-bottom container mx-auto max-w-5xl space-y-6 px-4 pt-6 md:pb-8">
  {#if query.isLoading}
    <div class="space-y-3">
      <div class="h-8 w-48 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"></div>
      <div class="space-y-2">
        {#each [0, 1, 2, 3, 4] as _, i (i)}
          <div class="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800"></div>
        {/each}
      </div>
    </div>
  {:else if query.isError}
    <p class="text-sm text-rose-600">{m.common_error_title()}</p>
  {:else if query.data}
    {@const list = query.data}
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
            {list.name}
          </h1>
        </div>
        <div class="flex flex-wrap items-center gap-2 pl-8">
          {#if list.group_id}
            <span
              class="border-accent/20 bg-accent/10 text-accent inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase"
              title={m.group_badge_shared()}
            >
              <Users size={11} strokeWidth={2} aria-hidden="true" />
              {m.group_badge_shared()}
            </span>
          {/if}
          <span
            class={cn(
              "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
              isPlanning && "bg-blue-50 text-blue-700",
              isShopping && "bg-accent/15 text-accent",
              isDone && "bg-slate-100 text-slate-400"
            )}
          >
            {#if isPlanning}{m.shopping_list_mode_planning()}{/if}
            {#if isShopping}{m.shopping_list_mode_shopping()}{/if}
            {#if isDone}{m.shopping_list_mode_done()}{/if}
          </span>
        </div>
      </div>
      <div class="flex items-center gap-1">
        {#if isPlanning}
          <button
            type="button"
            onclick={openRenameListDialog}
            class="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
            aria-label={m.shopping_list_rename_title()}
          >
            <Pencil size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
        {/if}
        {#if isShopping}
          <div class="relative">
            <button
              type="button"
              onclick={() => (menuOpen = !menuOpen)}
              class="shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
              aria-label={m.common_more_actions()}
              aria-expanded={menuOpen}
            >
              <MoreVertical size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            {#if menuOpen}
              <div
                role="menu"
                class="absolute right-0 z-30 mt-1 w-48 overflow-hidden rounded-xl border border-white/10 bg-slate-900/95 shadow-xl backdrop-blur"
              >
                <button
                  type="button"
                  onclick={() => returnMutation.mutate()}
                  disabled={returnMutation.isPending}
                  class="block w-full px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/5 disabled:opacity-50"
                >
                  {m.shopping_list_back_to_planning()}
                </button>
                <button
                  type="button"
                  onclick={openRenameListDialog}
                  class="block w-full px-3 py-2 text-left text-sm text-slate-200 transition-colors hover:bg-white/5"
                >
                  {m.shopping_list_rename_title()}
                </button>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    {#if settlementProgress?.plannedAmount != null && settlementProgress.plannedAmount > 0}
      {@const ratio = Math.min(
        1,
        settlementProgress.linkedAmount / settlementProgress.plannedAmount
      )}
      {@const pct = Math.round(ratio * 100)}
      <section
        class="rounded-2xl border border-white/5 bg-slate-900/60 p-5"
        aria-label={m.plan_detail_progress_title()}
      >
        <p class="text-eyebrow mb-3 text-slate-400">{m.plan_detail_progress_title()}</p>
        <div class="flex items-baseline gap-2">
          <span class="text-accent text-3xl font-bold tabular-nums">
            {formatCurrency(settlementProgress.linkedAmount)}
          </span>
          <span class="text-sm text-slate-400">
            z {formatCurrency(settlementProgress.plannedAmount)}
          </span>
        </div>
        <div
          class="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"
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
        <div class="mt-2 flex items-center justify-between gap-2 text-xs">
          <span class="text-slate-400">
            {m.plan_detail_remaining({ amount: formatCurrency(settlementProgress.remaining ?? 0) })}
          </span>
          <span
            class={cn("font-semibold tabular-nums", pct >= 90 ? "text-amber-400" : "text-accent")}
          >
            {pct}%
          </span>
        </div>
      </section>
    {:else}
      <div class="flex items-center gap-2 text-sm text-slate-400">
        <CalendarDays size={14} strokeWidth={1.8} aria-hidden="true" />
        {list.planned_for ? plannedForLabel(list.planned_for) : m.plan_detail_no_date()}
      </div>
    {/if}

    {#if (settlementProgress?.eligibleCount ?? 0) > 0 && !isDone}
      <a
        href="/plans/{id}/settle"
        class="bg-accent-gradient focus-visible:ring-accent flex w-full items-center justify-between rounded-2xl p-4 shadow-[0_0_24px_var(--color-accent-glow)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
        aria-label={m.plan_settle_action()}
      >
        <div class="flex items-center gap-3">
          <Sparkles size={20} class="text-slate-900" aria-hidden="true" />
          <div>
            <p class="text-sm font-semibold text-slate-900">{m.plan_settle_action()}</p>
            <p class="text-xs text-slate-800">
              {m.plan_detail_settle_cta_subtitle({ count: settlementProgress?.eligibleCount ?? 0 })}
            </p>
          </div>
        </div>
        <span aria-hidden="true" class="text-lg font-bold text-slate-900">→</span>
      </a>
    {:else if !isDone}
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          onclick={openSettleSheet}
          class="focus-visible:ring-accent inline-flex h-9 items-center rounded-full border border-white/10 px-4 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
        >
          {m.plan_settle_action()}
        </button>
        {#if isShopping}
          <button
            type="button"
            onclick={requestComplete}
            class="focus-visible:ring-accent inline-flex h-9 items-center rounded-full border border-white/10 px-4 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
          >
            {m.shopping_list_complete_fallback()}
          </button>
        {/if}
      </div>
    {/if}

    {#if (linkedTransactionsQuery.data ?? []).length > 0}
      <section class="space-y-2">
        <div class="flex items-center justify-between gap-2">
          <h2 class="text-eyebrow text-slate-400">{m.plan_detail_linked_header()}</h2>
          <span class="text-xs text-slate-400 tabular-nums">
            {linkedTransactionsQuery.data?.length ?? 0} ·
            {formatCurrency(settlementProgress?.linkedAmount ?? 0)}
          </span>
        </div>
        <ul class="space-y-1">
          {#each linkedTransactionsQuery.data ?? [] as tx (tx.id)}
            <li
              class="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2 text-xs"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-slate-200">{tx.description}</p>
                <p class="mt-0.5 text-slate-400">
                  {formatDate(tx.date)}{tx.category_name ? ` · ${tx.category_name}` : ""}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <span
                  class="border-accent/20 bg-accent/10 text-accent rounded-full border px-2 py-0.5 text-[10px] font-medium"
                >
                  {m.plan_linked_badge()}
                </span>
                <span class="font-semibold text-rose-300 tabular-nums">
                  −{formatCurrency(tx.amount)}
                </span>
                <button
                  type="button"
                  onclick={() => unlinkMutation.mutate(tx.id)}
                  disabled={unlinkMutation.isPending && unlinkPendingId === tx.id}
                  aria-label={m.plan_settle_unlink()}
                  class="rounded-full p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-rose-400 disabled:opacity-40"
                  onmousedown={() => (unlinkPendingId = tx.id)}
                >
                  <Link2Off size={13} strokeWidth={1.8} aria-hidden="true" />
                </button>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if !isDone}
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          onclick={() => (showBroadSheet = true)}
          class="focus-visible:ring-accent inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-4 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
        >
          <Link2 size={14} strokeWidth={1.8} aria-hidden="true" />
          {m.plan_detail_history_link()}
        </button>
        {#if !showChecklistSection}
          <button
            type="button"
            onclick={() => (showChecklist = true)}
            class="focus-visible:ring-accent inline-flex h-9 items-center gap-2 rounded-full border border-white/10 px-4 text-sm font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300 focus-visible:ring-2 focus-visible:outline-none"
          >
            {#if hasItems}
              <List size={14} strokeWidth={1.8} aria-hidden="true" />
              {m.plan_detail_checklist_title()} · {itemDone}/{itemTotal}
            {:else}
              <ListPlus size={14} strokeWidth={1.8} aria-hidden="true" />
              {m.common_add()}
              {m.plan_detail_checklist_title()}
            {/if}
          </button>
        {/if}
      </div>
    {/if}

    {#if showChecklistSection}
      <section class="space-y-3 border-t border-white/5 pt-4">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-slate-100">
            {m.plan_detail_checklist_title()}
          </h2>
          <div class="flex items-center gap-2">
            {#if itemTotal > 0}
              <span class="shrink-0 text-xs text-slate-400 tabular-nums">
                {m.plan_detail_checklist_progress({ completed: itemDone, total: itemTotal })}
              </span>
            {/if}
            {#if isPlanning}
              <button
                type="button"
                onclick={() => (showChecklist = false)}
                aria-label={m.common_close()}
                class="rounded-full p-1 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-300"
              >
                <X size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            {/if}
          </div>
        </div>

        {#if isPlanning}
          <PlanningView
            {list}
            startingShopping={startMutation.isPending}
            onStartShopping={() => startMutation.mutate()}
          />
        {:else if isShopping}
          <ShoppingView {list} onComplete={openSettleSheet} />
        {:else}
          <DoneView
            {list}
            duplicating={duplicateMutation.isPending}
            onDuplicate={() => duplicateMutation.mutate()}
          />
        {/if}
      </section>
    {/if}
  {/if}
</div>

<Dialog
  open={showComplete}
  onclose={() => (showComplete = false)}
  title={m.shopping_list_complete_title()}
>
  <form onsubmit={submitComplete} class="space-y-4">
    <label class="flex cursor-pointer items-center gap-3 select-none">
      <input type="checkbox" bind:checked={createTx} class="sr-only" />
      <div
        class="relative h-5 w-9 rounded-full transition-colors {createTx
          ? 'bg-accent-gradient shadow-[0_0_12px_var(--color-accent-glow)]'
          : 'bg-slate-700'}"
      >
        <div
          class="absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform {createTx
            ? 'translate-x-4'
            : 'translate-x-0'}"
        ></div>
      </div>
      <span class="text-sm text-slate-200">{m.shopping_list_complete_create_tx_toggle()}</span>
    </label>
    <p class="text-sm text-slate-300">
      {createTx
        ? m.shopping_list_complete_creates_tx_hint()
        : m.shopping_list_complete_no_tx_hint()}
    </p>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="comp-amount">
        {createTx ? m.shopping_list_complete_amount() : m.shopping_list_complete_amount_optional()}
      </label>
      <input
        id="comp-amount"
        type="number"
        min="0.01"
        step="0.01"
        required={createTx}
        bind:value={completeAmount}
        class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="comp-cat">
        {createTx
          ? m.shopping_list_complete_category()
          : m.shopping_list_complete_category_optional()}
      </label>
      <select
        id="comp-cat"
        required={createTx}
        bind:value={completeCategoryId}
        class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
      >
        <option value="">{m.transaction_form_select_category()}</option>
        {#each expenseCategories as cat (cat.id)}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>
    {#if completeMutation.isError}
      <p class="text-sm text-rose-600">{m.common_error_title()}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showComplete = false)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={completeMutation.isPending}
        class="bg-accent-gradient focus-visible:ring-accent flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        {completeMutation.isPending
          ? m.common_saving()
          : createTx
            ? m.shopping_list_complete_submit()
            : m.shopping_list_complete_submit_no_tx()}
      </button>
    </div>
  </form>
</Dialog>

<Dialog
  open={showUncheckedComplete}
  onclose={() => (showUncheckedComplete = false)}
  title={m.shopping_list_unchecked_confirm_title()}
>
  <div class="space-y-4">
    <p class="text-sm text-slate-300">{m.shopping_list_unchecked_confirm_body()}</p>
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showUncheckedComplete = false)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="button"
        onclick={continueCompleteDialog}
        class="bg-accent-gradient focus-visible:ring-accent flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none"
      >
        {m.shopping_list_unchecked_confirm_submit()}
      </button>
    </div>
  </div>
</Dialog>

<Dialog
  open={showRenameList}
  onclose={() => (showRenameList = false)}
  title={m.shopping_list_rename_title()}
>
  <form onsubmit={submitRenameList} class="space-y-3">
    <input
      type="text"
      bind:value={renameListName}
      placeholder={m.shopping_list_rename_placeholder()}
      required
      class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
    />
    <DayPicker
      id="list-date"
      bind:value={renameListDate}
      label={m.shopping_list_planned_for_input_label()}
      required
    />
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-400" for="list-share-group">
        {m.shopping_list_share_label()}
      </label>
      <select
        id="list-share-group"
        bind:value={renameListGroupId}
        class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur focus:ring-2 focus:outline-none"
      >
        <option value={null}>{m.shopping_list_share_private()}</option>
        {#each groupsQuery.data ?? [] as group (group.id)}
          <option value={group.id}>{group.name}</option>
        {/each}
      </select>
    </div>
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showRenameList = false)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={renameListMutation.isPending || !renameListName.trim() || !renameListDate}
        class="bg-accent-gradient focus-visible:ring-accent flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        {renameListMutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>

<PlanSettleSheet
  open={showSettle}
  planId={id}
  planName={query.data?.name ?? ""}
  plannedAmount={query.data?.total_amount ?? null}
  onclose={() => (showSettle = false)}
/>

<PlanSettleSheet
  open={showBroadSheet}
  planId={id}
  planName={query.data?.name ?? ""}
  plannedAmount={query.data?.total_amount ?? null}
  mode="broad"
  onclose={() => (showBroadSheet = false)}
/>
