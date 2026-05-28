<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import DoneView from "$lib/components/shopping-lists/DoneView.svelte";
  import PlanningView from "$lib/components/shopping-lists/PlanningView.svelte";
  import ShoppingView from "$lib/components/shopping-lists/ShoppingView.svelte";
  import DayPicker from "$lib/components/ui/DayPicker.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
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
  import { cn, formatDate } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { ArrowLeft, MoreVertical, Pencil, Users } from "lucide-svelte";
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

  const expenseCategories = $derived(
    categoriesQuery.data?.filter((c) => c.type === "expense") ?? []
  );

  const listKey = $derived(["shopping_list", id] as const);
  const mode = $derived(query.data ? deriveShoppingListMode(query.data) : "planning");
  const isPlanning = $derived(mode === "planning");
  const isShopping = $derived(mode === "shopping");
  const isDone = $derived(mode === "done");

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
  let showUncheckedComplete = $state(false);
  let completeAmount = $state("");
  let completeCategoryId = $state("");

  function openCompleteDialog() {
    completeAmount = "";
    completeCategoryId = query.data?.category_id ?? "";
    showComplete = true;
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
    mutationFn: () => completeShoppingList(id, parseFloat(completeAmount), completeCategoryId),
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
          colors: ["#34d399", "#bef264", "#a7f3d0", "#86efac"],
        });
      } catch {
        // Confetti is decorative; ignore environment failures.
      }
      await goto("/shopping-lists");
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
      await goto(`/shopping-lists/${newList.id}`);
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

<div class="container mx-auto max-w-2xl space-y-4 px-4 pt-6 pb-56 md:pb-6">
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
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onclick={() => goto("/shopping-lists")}
          class="shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-100"
          aria-label={m.common_back()}
        >
          <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <h1 class="truncate text-2xl font-semibold text-slate-900 dark:text-white">{list.name}</h1>
        {#if list.group_id}
          <span
            class="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-emerald-300 uppercase"
            title={m.group_badge_shared()}
          >
            <Users size={11} strokeWidth={2} aria-hidden="true" />
            {m.group_badge_shared()}
          </span>
        {/if}
      </div>
      <div class="flex items-center gap-1">
        {#if isPlanning}
          <button
            type="button"
            onclick={openRenameListDialog}
            class="shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-100"
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
              class="shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-100"
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
        <span
          class={cn(
            "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
            isPlanning && "bg-blue-50 text-blue-700",
            isShopping && "bg-emerald-500/15 text-emerald-200",
            isDone && "bg-slate-100 text-slate-500"
          )}
        >
          {#if isPlanning}{m.shopping_list_mode_planning()}{/if}
          {#if isShopping}{m.shopping_list_mode_shopping()}{/if}
          {#if isDone}{m.shopping_list_mode_done()}{/if}
        </span>
      </div>
    </div>

    {#if list.planned_for}
      <div class="text-xs text-slate-400 dark:text-slate-500">
        {m.shopping_list_planned_for_label({ date: plannedForLabel(list.planned_for) })}
      </div>
    {/if}

    {#if isPlanning}
      <PlanningView
        {list}
        startingShopping={startMutation.isPending}
        onStartShopping={() => startMutation.mutate()}
      />
    {:else if isShopping}
      <ShoppingView {list} onComplete={requestComplete} />
    {:else}
      <DoneView
        {list}
        duplicating={duplicateMutation.isPending}
        onDuplicate={() => duplicateMutation.mutate()}
      />
    {/if}
  {/if}
</div>

<Dialog
  open={showComplete}
  onclose={() => (showComplete = false)}
  title={m.shopping_list_complete_title()}
>
  <form onsubmit={submitComplete} class="space-y-4">
    <p class="text-sm text-slate-300">{m.shopping_list_complete_creates_tx_hint()}</p>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="comp-amount">
        {m.shopping_list_complete_amount()}
      </label>
      <input
        id="comp-amount"
        type="number"
        min="0.01"
        step="0.01"
        required
        bind:value={completeAmount}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="comp-cat">
        {m.shopping_list_complete_category()}
      </label>
      <select
        id="comp-cat"
        required
        bind:value={completeCategoryId}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
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
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:opacity-50"
      >
        {completeMutation.isPending ? m.common_saving() : m.shopping_list_complete_submit()}
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
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none"
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
      class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
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
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
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
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:opacity-50"
      >
        {renameListMutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>
