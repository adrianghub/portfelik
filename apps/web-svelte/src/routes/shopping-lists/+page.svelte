<script lang="ts">
  import ShoppingListCard from "$lib/components/shopping-lists/ShoppingListCard.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Fab from "$lib/components/ui/Fab.svelte";
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

  const active = $derived(query.data?.filter((l) => l.status === "active") ?? []);
  const completed = $derived(query.data?.filter((l) => l.status === "completed") ?? []);

  // Create dialog
  let showCreate = $state(false);
  let newName = $state("");
  let newGroupId = $state("");
  let newCategoryId = $state("");

  const createMut = createMutation(() => ({
    mutationFn: () =>
      createShoppingList({
        name: newName,
        group_id: newGroupId || null,
        category_id: newCategoryId || null,
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        item_total: 0,
        item_completed: 0,
      };
      queryClient.setQueryData<ShoppingListSummary[]>(
        ["shopping_lists"],
        [optimistic, ...(previous ?? [])]
      );
      const submitted = { newName, newGroupId, newCategoryId };
      newName = "";
      newGroupId = "";
      newCategoryId = "";
      showCreate = false;
      return { previous, submitted };
    },
    onSuccess: () => toast.success(m.toast_shopping_list_created()),
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["shopping_lists"], ctx.previous);
      if (ctx?.submitted) {
        newName = ctx.submitted.newName;
        newGroupId = ctx.submitted.newGroupId;
        newCategoryId = ctx.submitted.newCategoryId;
        showCreate = true;
      }
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
    mutationFn: () => deleteShoppingList(deleteTargetId!),
    onMutate: async () => {
      const targetId = deleteTargetId;
      if (!targetId) return { previous: undefined, targetId };
      await queryClient.cancelQueries({ queryKey: ["shopping_lists"] });
      const previous = queryClient.getQueryData<ShoppingListSummary[]>(["shopping_lists"]);
      queryClient.setQueryData<ShoppingListSummary[]>(
        ["shopping_lists"],
        (previous ?? []).filter((l) => l.id !== targetId)
      );
      deleteTargetId = null;
      return { previous, targetId };
    },
    onSuccess: () => toast.success(m.toast_shopping_list_deleted()),
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["shopping_lists"], ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["shopping_lists"] }),
  }));

  // Duplicate
  const duplicateMut = createMutation(() => ({
    mutationFn: (id: string) => duplicateShoppingList(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      toast.success(m.toast_shopping_list_duplicated());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // Edit
  let editTarget = $state<ShoppingListSummary | null>(null);
  let editName = $state("");
  let editGroupId = $state("");
  let editCategoryId = $state("");

  function openEdit(list: ShoppingListSummary) {
    editTarget = list;
    editName = list.name;
    editGroupId = list.group_id ?? "";
    editCategoryId = list.category_id ?? "";
  }

  const updateMut = createMutation(() => ({
    mutationFn: () =>
      updateShoppingList(editTarget!.id, {
        name: editName,
        group_id: editGroupId || null,
        category_id: editCategoryId || null,
      }),
    onMutate: async () => {
      const target = editTarget;
      if (!target) return { previous: undefined };
      await queryClient.cancelQueries({ queryKey: ["shopping_lists"] });
      const previous = queryClient.getQueryData<ShoppingListSummary[]>(["shopping_lists"]);
      const patch = {
        name: editName,
        group_id: editGroupId || null,
        category_id: editCategoryId || null,
      };
      queryClient.setQueryData<ShoppingListSummary[]>(
        ["shopping_lists"],
        (previous ?? []).map((l) => (l.id === target.id ? { ...l, ...patch } : l))
      );
      editTarget = null;
      return { previous };
    },
    onSuccess: () => toast.success(m.toast_shopping_list_updated()),
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
  <div class="flex items-center justify-between">
    <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">
      {m.shopping_lists_title()}
    </h1>
    <button
      onclick={() => {
        showCreate = true;
        newName = "";
        newGroupId = "";
        newCategoryId = "";
      }}
      class="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
    >
      + {m.common_add()}
    </button>
  </div>

  {#if query.isLoading}
    <div class="grid gap-3 sm:grid-cols-2">
      {#each Array(4) as _, i (i)}
        <div
          class="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
        >
          <div class="mb-3 h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-700"></div>
          <div class="space-y-2">
            <div class="h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-700"></div>
            <div class="h-3 w-4/5 animate-pulse rounded bg-slate-100 dark:bg-slate-700"></div>
          </div>
        </div>
      {/each}
    </div>
  {:else if query.isError}
    <p class="text-sm text-rose-600">{m.common_error_title()}</p>
  {:else if (query.data?.length ?? 0) === 0}
    <p class="py-12 text-center text-sm text-slate-400 dark:text-slate-500">
      {m.shopping_lists_empty()}
    </p>
  {:else}
    {#if active.length > 0}
      <section class="space-y-2">
        <h2 class="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {m.shopping_lists_active()}
        </h2>
        {#each active as list (list.id)}
          <ShoppingListCard {list} onedit={openEdit} ondelete={(id) => (deleteTargetId = id)} />
        {/each}
      </section>
    {/if}

    {#if completed.length > 0}
      <section class="space-y-2">
        <h2 class="text-xs font-medium tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {m.shopping_lists_completed()}
        </h2>
        {#each completed as list (list.id)}
          <ShoppingListCard
            {list}
            onedit={openEdit}
            onduplicate={(id) => duplicateMut.mutate(id)}
            ondelete={(id) => (deleteTargetId = id)}
          />
        {/each}
      </section>
    {/if}
  {/if}
</div>

<Fab
  onclick={() => {
    showCreate = true;
    newName = "";
    newGroupId = "";
    newCategoryId = "";
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
        class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/10 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-white/10"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="sl-cat"
        >{m.shopping_list_form_category()}</label
      >
      <select
        id="sl-cat"
        bind:value={newCategoryId}
        class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/10 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-white/10"
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
          class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/10 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-white/10"
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
        class="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={createMut.isPending}
        class="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
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
        class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/10 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-white/10"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="sl-edit-cat"
        >{m.shopping_list_form_category()}</label
      >
      <select
        id="sl-edit-cat"
        bind:value={editCategoryId}
        class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/10 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-white/10"
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
          class="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500/10 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-white/10"
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
        class="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={updateMut.isPending}
        class="flex-1 rounded-lg bg-slate-900 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
      >
        {updateMut.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>

<ConfirmDialog
  open={!!deleteTargetId}
  message={m.common_confirm_delete_description()}
  onconfirm={() => deleteMut.mutate()}
  onclose={() => (deleteTargetId = null)}
  pending={deleteMut.isPending}
/>
