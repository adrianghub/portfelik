<script lang="ts">
  import ShoppingListCard from "$lib/components/shopping-lists/ShoppingListCard.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      toast.success(m.toast_shopping_list_created());
      newName = "";
      newGroupId = "";
      newCategoryId = "";
      showCreate = false;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function submitCreate(e: Event) {
    e.preventDefault();
    createMut.mutate();
  }

  // Delete
  let deleteTargetId = $state<string | null>(null);

  const deleteMut = createMutation(() => ({
    mutationFn: () => deleteShoppingList(deleteTargetId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      toast.success(m.toast_shopping_list_deleted());
      deleteTargetId = null;
    },
    onError: () => toast.error(m.toast_error()),
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      toast.success(m.toast_shopping_list_updated());
      editTarget = null;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function submitEdit(e: Event) {
    e.preventDefault();
    updateMut.mutate();
  }
</script>

<div class="container mx-auto max-w-3xl space-y-5 px-4 py-6">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-zinc-900">
      {m.shopping_lists_title()}
    </h1>
    <button
      onclick={() => {
        showCreate = true;
        newName = "";
        newGroupId = "";
        newCategoryId = "";
      }}
      class="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
    >
      + {m.common_add()}
    </button>
  </div>

  {#if query.isLoading}
    <div class="space-y-2">
      {#each [0, 1, 2] as _, i (i)}
        <div class="h-16 animate-pulse rounded-xl bg-zinc-100"></div>
      {/each}
    </div>
  {:else if query.isError}
    <p class="text-sm text-rose-600">{m.common_error_title()}</p>
  {:else if (query.data?.length ?? 0) === 0}
    <p class="py-12 text-center text-sm text-zinc-400">
      {m.shopping_lists_empty()}
    </p>
  {:else}
    {#if active.length > 0}
      <section class="space-y-2">
        <h2 class="text-xs font-medium tracking-wide text-zinc-500 uppercase">
          {m.shopping_lists_active()}
        </h2>
        {#each active as list (list.id)}
          <ShoppingListCard {list} onedit={openEdit} ondelete={(id) => (deleteTargetId = id)} />
        {/each}
      </section>
    {/if}

    {#if completed.length > 0}
      <section class="space-y-2">
        <h2 class="text-xs font-medium tracking-wide text-zinc-500 uppercase">
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

<!-- Create dialog -->
<Dialog
  open={showCreate}
  onclose={() => (showCreate = false)}
  title={m.shopping_list_form_title_add()}
>
  <form onsubmit={submitCreate} class="space-y-4">
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600" for="sl-name"
        >{m.shopping_list_form_name()}</label
      >
      <input
        id="sl-name"
        type="text"
        required
        bind:value={newName}
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600" for="sl-cat"
        >{m.shopping_list_form_category()}</label
      >
      <select
        id="sl-cat"
        bind:value={newCategoryId}
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      >
        <option value="">{m.shopping_list_form_no_category()}</option>
        {#each expenseCategories as cat (cat.id)}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>
    {#if groupsQuery.data && groupsQuery.data.length > 0}
      <div class="space-y-1">
        <label class="text-xs font-medium text-zinc-600" for="sl-group"
          >{m.shopping_list_form_group()}</label
        >
        <select
          id="sl-group"
          bind:value={newGroupId}
          class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
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
        class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={createMut.isPending}
        class="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
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
      <label class="text-xs font-medium text-zinc-600" for="sl-edit-name"
        >{m.shopping_list_form_name()}</label
      >
      <input
        id="sl-edit-name"
        type="text"
        required
        bind:value={editName}
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      />
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-zinc-600" for="sl-edit-cat"
        >{m.shopping_list_form_category()}</label
      >
      <select
        id="sl-edit-cat"
        bind:value={editCategoryId}
        class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
      >
        <option value="">{m.shopping_list_form_no_category()}</option>
        {#each expenseCategories as cat (cat.id)}
          <option value={cat.id}>{cat.name}</option>
        {/each}
      </select>
    </div>
    {#if groupsQuery.data && groupsQuery.data.length > 0}
      <div class="space-y-1">
        <label class="text-xs font-medium text-zinc-600" for="sl-edit-group"
          >{m.shopping_list_form_group()}</label
        >
        <select
          id="sl-edit-group"
          bind:value={editGroupId}
          class="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-zinc-900/10 focus:outline-none"
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
        class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={updateMut.isPending}
        class="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50"
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
