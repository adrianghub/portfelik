<script lang="ts">
  import ShoppingListCard from "$lib/components/shopping-lists/ShoppingListCard.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Fab from "$lib/components/ui/Fab.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import { ShoppingBasket } from "lucide-svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchUserGroups } from "$lib/services/groups";
  import { fetchCategories } from "$lib/services/categories";
  import {
    createShoppingList,
    deleteShoppingList,
    duplicateShoppingList,
    fetchShoppingLists,
    updateShoppingList,
  } from "$lib/services/shopping-lists";
  import type { ShoppingListSummary } from "$lib/types";
  import { cn } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();

  const query = createQuery(() => ({
    queryKey: ["shopping_lists"],
    queryFn: fetchShoppingLists,
  }));

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
  }));

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  const expenseCategories = $derived(
    categoriesQuery.data?.filter((c) => c.type === "expense") ?? []
  );

  let groupFilter = $state<"all" | "own" | string>("all");
  const filteredLists = $derived(
    (query.data ?? []).filter((l) => {
      if (groupFilter === "all") return true;
      if (groupFilter === "own") return l.group_id === null;
      return l.group_id === groupFilter;
    })
  );
  const upcoming = $derived(filteredLists.filter((l) => l.bucket === "upcoming"));
  const active = $derived(filteredLists.filter((l) => l.bucket === "active"));
  const archived = $derived(filteredLists.filter((l) => l.bucket === "archived"));

  function todayIsoLocal(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  // Create dialog
  let showCreate = $state(false);
  let newName = $state("");
  let newGroupId = $state("");
  let newCategoryId = $state("");
  let newPlannedFor = $state(todayIsoLocal());

  const createMut = createMutation(() => ({
    mutationFn: () =>
      createShoppingList({
        name: newName,
        group_id: newGroupId || null,
        category_id: newCategoryId || null,
        planned_for: newPlannedFor || null,
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["shopping_lists"] });
      const previous = queryClient.getQueryData<ShoppingListSummary[]>(["shopping_lists"]);
      const optimistic: ShoppingListSummary = {
        id: "__optimistic_" + crypto.randomUUID(),
        name: newName,
        status: "active",
        user_id: "",
        group_id: newGroupId || null,
        category_id: newCategoryId || null,
        total_amount: null,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        item_total: 0,
        item_completed: 0,
        linked_transaction_id: null,
        planned_for: newPlannedFor,
        shopping_started_at: null,
        bucket: newPlannedFor > todayIsoLocal() ? "upcoming" : "active",
        mode: "planning",
      };
      queryClient.setQueryData<ShoppingListSummary[]>(
        ["shopping_lists"],
        [optimistic, ...(previous ?? [])]
      );
      showCreate = false;
      return { previous };
    },
    onSuccess: () => {
      newName = "";
      newGroupId = "";
      newCategoryId = "";
      newPlannedFor = todayIsoLocal();
      toast.success(m.toast_shopping_list_created());
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["shopping_lists"], ctx.previous);
      showCreate = true;
      toast.error(m.toast_error());
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["shopping_lists"] }),
  }));

  function submitCreate(e: Event) {
    e.preventDefault();
    createMut.mutate();
  }

  // Delete
  let deleteTargetId = $state<string | null>(null);

  const deleteMut = createMutation(() => ({
    mutationFn: (id: string) => deleteShoppingList(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ["shopping_lists"] });
      const previous = queryClient.getQueryData<ShoppingListSummary[]>(["shopping_lists"]);
      queryClient.setQueryData<ShoppingListSummary[]>(
        ["shopping_lists"],
        (previous ?? []).filter((l) => l.id !== id)
      );
      return { previous };
    },
    onSuccess: () => toast.success(m.toast_shopping_list_deleted()),
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["shopping_lists"], ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: () => {
      deleteTargetId = null;
      queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  // Duplicate
  const duplicateMut = createMutation(() => ({
    mutationFn: (id: string) => duplicateShoppingList(id),
    onSuccess: async () => {
      toast.success(m.toast_shopping_list_duplicated());
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // Edit
  let editTarget = $state<ShoppingListSummary | null>(null);
  let editName = $state("");
  let editGroupId = $state("");
  let editCategoryId = $state("");
  let editPlannedFor = $state("");

  function openEdit(list: ShoppingListSummary) {
    editTarget = list;
    editName = list.name;
    editGroupId = list.group_id ?? "";
    editCategoryId = list.category_id ?? "";
    editPlannedFor = list.planned_for;
  }

  const updateMut = createMutation(() => ({
    mutationFn: () =>
      updateShoppingList(editTarget!.id, {
        name: editName,
        group_id: editGroupId || null,
        category_id: editCategoryId || null,
        planned_for: editPlannedFor,
      }),
    onMutate: async () => {
      const target = editTarget;
      if (!target) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: ["shopping_lists"] });
      const previous = queryClient.getQueryData<ShoppingListSummary[]>(["shopping_lists"]);
      const today = todayIsoLocal();
      const patch = {
        name: editName,
        group_id: editGroupId || null,
        category_id: editCategoryId || null,
        planned_for: editPlannedFor,
      };
      queryClient.setQueryData<ShoppingListSummary[]>(
        ["shopping_lists"],
        (previous ?? []).map((l) =>
          l.id === target.id
            ? {
                ...l,
                ...patch,
                bucket: l.completed_at
                  ? "archived"
                  : l.shopping_started_at || editPlannedFor <= today
                    ? "active"
                    : "upcoming",
              }
            : l
        )
      );
      return { previous };
    },
    onSuccess: () => {
      editTarget = null;
      toast.success(m.toast_shopping_list_updated());
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["shopping_lists"], ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["shopping_lists"] }),
  }));

  function submitEdit(e: Event) {
    e.preventDefault();
    updateMut.mutate();
  }
</script>

<div class="container mx-auto max-w-3xl space-y-5 px-4 py-6">
  <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
    {m.shopping_lists_title()}
  </h1>

  {#if query.isLoading}
    <div class="grid gap-3 sm:grid-cols-2">
      {#each Array(4) as _, i (i)}
        <div class="rounded-2xl border border-white/5 bg-slate-900/60 p-4 backdrop-blur">
          <div class="mb-3 h-4 w-2/3 animate-pulse rounded bg-slate-800/60"></div>
          <div class="space-y-2">
            <div class="h-3 w-full animate-pulse rounded bg-slate-800/60"></div>
            <div class="h-3 w-4/5 animate-pulse rounded bg-slate-800/60"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if query.isError}
    <p class="text-sm text-rose-600">{m.common_error_title()}</p>
  {:else if (query.data?.length ?? 0) === 0}
    <EmptyState title={m.shopping_lists_empty()} body={m.shopping_lists_empty_hint()}>
      {#snippet icon()}
        <ShoppingBasket size={28} strokeWidth={1.4} />
      {/snippet}
    </EmptyState>
  {:else}
    {#if groupsQuery.data && groupsQuery.data.length > 0}
      <div role="tablist" aria-label="Grupa" class="flex flex-wrap gap-1">
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === "all"}
          onclick={() => (groupFilter = "all")}
          class={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
            groupFilter === "all"
              ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
              : "border border-white/5 text-slate-300 hover:bg-white/5"
          )}
        >
          {m.group_filter_all()}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === "own"}
          onclick={() => (groupFilter = "own")}
          class={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
            groupFilter === "own"
              ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
              : "border border-white/5 text-slate-300 hover:bg-white/5"
          )}
        >
          {m.group_filter_own()}
        </button>
        {#each groupsQuery.data as g (g.id)}
          <button
            type="button"
            role="tab"
            aria-selected={groupFilter === g.id}
            onclick={() => (groupFilter = g.id)}
            class={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none",
              groupFilter === g.id
                ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
                : "border border-white/5 text-slate-300 hover:bg-white/5"
            )}
          >
            {g.name}
          </button>
        {/each}
      </div>
    {/if}

    <section class="space-y-2">
      <h2 class="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {m.shopping_lists_section_active()}
      </h2>
      {#if active.length === 0}
        <p
          class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-500"
        >
          {m.shopping_lists_section_active_empty()}
        </p>
      {:else}
        {#each active as list (list.id)}
          <ShoppingListCard
            {list}
            variant="active"
            onedit={openEdit}
            ondelete={(id) => (deleteTargetId = id)}
          />
        {/each}
      {/if}
    </section>

    <section class="space-y-2">
      <h2 class="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {m.shopping_lists_section_upcoming()}
      </h2>
      {#if upcoming.length === 0}
        <p
          class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-500"
        >
          {m.shopping_lists_section_upcoming_empty()}
        </p>
      {:else}
        {#each upcoming as list (list.id)}
          <ShoppingListCard
            {list}
            variant="upcoming"
            onedit={openEdit}
            ondelete={(id) => (deleteTargetId = id)}
          />
        {/each}
      {/if}
    </section>

    <section class="space-y-2">
      <h2 class="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
        {m.shopping_lists_section_archived()}
      </h2>
      {#if archived.length === 0}
        <p
          class="rounded-xl border border-white/5 bg-slate-900/35 px-3 py-3 text-sm text-slate-500"
        >
          {m.shopping_lists_section_archived_empty()}
        </p>
      {:else}
        {#each archived as list (list.id)}
          <ShoppingListCard
            {list}
            variant="archived"
            onduplicate={(id) => duplicateMut.mutate(id)}
          />
        {/each}
      {/if}
    </section>
  {/if}
</div>

<Fab
  onclick={() => {
    showCreate = true;
    newName = "";
    newGroupId = "";
    newCategoryId = "";
    newPlannedFor = todayIsoLocal();
  }}
  aria-label={m.shopping_list_form_title_add()}
/>

<!-- Create dialog -->
<Dialog
  open={showCreate}
  onclose={() => (showCreate = false)}
  title={m.shopping_list_form_title_add()}
>
  <form onsubmit={submitCreate} class="space-y-4">
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="sl-name"
        >{m.shopping_list_form_name()}</label
      >
      <input
        id="sl-name"
        type="text"
        required
        bind:value={newName}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="sl-planned"
        >{m.shopping_list_planned_for_input_label()}</label
      >
      <input
        id="sl-planned"
        type="date"
        required
        bind:value={newPlannedFor}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="sl-cat"
        >{m.shopping_list_form_category()}</label
      >
      <select
        id="sl-cat"
        bind:value={newCategoryId}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      >
        <option value="">{m.shopping_list_form_no_category()}</option>
        {#each expenseCategories as cat (cat.id)}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>
    {#if groupsQuery.data && groupsQuery.data.length > 0}
      <div class="space-y-1">
        <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="sl-group"
          >{m.shopping_list_form_group()}</label
        >
        <select
          id="sl-group"
          bind:value={newGroupId}
          class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
        >
          <option value="">{m.shopping_list_form_no_group()}</option>
          {#each groupsQuery.data as group (group.id)}
            <option value={group.id}>{group.name}</option>
          {/each}
        </select>
      </div>
    {/if}
    {#if createMut.isError}
      <p class="text-sm text-rose-600">{m.common_error_title()}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showCreate = false)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={createMut.isPending}
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:opacity-50"
      >
        {createMut.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>

<!-- Edit dialog -->
<Dialog
  open={!!editTarget}
  onclose={() => (editTarget = null)}
  title={m.shopping_list_form_title_edit()}
>
  <form onsubmit={submitEdit} class="space-y-4">
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="sl-edit-name"
        >{m.shopping_list_form_name()}</label
      >
      <input
        id="sl-edit-name"
        type="text"
        required
        bind:value={editName}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="sl-edit-planned"
        >{m.shopping_list_planned_for_input_label()}</label
      >
      <input
        id="sl-edit-planned"
        type="date"
        required
        bind:value={editPlannedFor}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="sl-edit-cat"
        >{m.shopping_list_form_category()}</label
      >
      <select
        id="sl-edit-cat"
        bind:value={editCategoryId}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      >
        <option value="">{m.shopping_list_form_no_category()}</option>
        {#each expenseCategories as cat (cat.id)}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>
    {#if groupsQuery.data && groupsQuery.data.length > 0}
      <div class="space-y-1">
        <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="sl-edit-group"
          >{m.shopping_list_form_group()}</label
        >
        <select
          id="sl-edit-group"
          bind:value={editGroupId}
          class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
        >
          <option value="">{m.shopping_list_form_no_group()}</option>
          {#each groupsQuery.data as group (group.id)}
            <option value={group.id}>{group.name}</option>
          {/each}
        </select>
      </div>
    {/if}
    {#if updateMut.isError}
      <p class="text-sm text-rose-600">{m.common_error_title()}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (editTarget = null)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={updateMut.isPending}
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:opacity-50"
      >
        {updateMut.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>

<ConfirmDialog
  open={!!deleteTargetId}
  message={m.common_confirm_delete_description()}
  onconfirm={() => deleteTargetId && deleteMut.mutate(deleteTargetId)}
  onclose={() => (deleteTargetId = null)}
  pending={deleteMut.isPending}
/>
