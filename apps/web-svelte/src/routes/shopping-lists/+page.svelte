<script lang="ts">
  import ShoppingListCard from "$lib/components/shopping-lists/ShoppingListCard.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import * as m from "$lib/paraglide/messages";
  import { fetchUserGroups } from "$lib/services/groups";
  import {
    createShoppingList,
    deleteShoppingList,
    fetchShoppingLists,
  } from "$lib/services/shopping-lists";
  import {
    createMutation,
    createQuery,
    useQueryClient,
  } from "@tanstack/svelte-query";

  const queryClient = useQueryClient();

  const query = createQuery(() => ({
    queryKey: ["shopping_lists"],
    queryFn: fetchShoppingLists,
  }));

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
  }));

  const active = $derived(
    query.data?.filter((l) => l.status === "active") ?? [],
  );
  const completed = $derived(
    query.data?.filter((l) => l.status === "completed") ?? [],
  );

  // Create dialog
  let showCreate = $state(false);
  let newName = $state("");
  let newGroupId = $state("");

  const createMut = createMutation(() => ({
    mutationFn: () =>
      createShoppingList({ name: newName, group_id: newGroupId || null }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      newName = "";
      newGroupId = "";
      showCreate = false;
    },
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
      deleteTargetId = null;
    },
  }));
</script>

<div class="container mx-auto max-w-3xl px-4 py-6 space-y-5">
  <div class="flex items-center justify-between">
    <h1 class="text-xl font-semibold text-zinc-900">
      {m.shopping_lists_title()}
    </h1>
    <button
      onclick={() => {
        showCreate = true;
        newName = "";
        newGroupId = "";
      }}
      class="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors"
    >
      + {m.common_add()}
    </button>
  </div>

  {#if query.isLoading}
    <div class="space-y-2">
      {#each [0, 1, 2] as _}
        <div class="h-16 rounded-xl bg-zinc-100 animate-pulse"></div>
      {/each}
    </div>
  {:else if query.isError}
    <p class="text-sm text-rose-600">{m.common_error_title()}</p>
  {:else if (query.data?.length ?? 0) === 0}
    <p class="text-sm text-zinc-400 text-center py-12">
      {m.shopping_lists_empty()}
    </p>
  {:else}
    {#if active.length > 0}
      <section class="space-y-2">
        <h2 class="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          {m.shopping_lists_active()}
        </h2>
        {#each active as list}
          <ShoppingListCard {list} ondelete={(id) => (deleteTargetId = id)} />
        {/each}
      </section>
    {/if}

    {#if completed.length > 0}
      <section class="space-y-2">
        <h2 class="text-xs font-medium text-zinc-500 uppercase tracking-wide">
          {m.shopping_lists_completed()}
        </h2>
        {#each completed as list}
          <ShoppingListCard {list} ondelete={(id) => (deleteTargetId = id)} />
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
        class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
      />
    </div>
    {#if groupsQuery.data && groupsQuery.data.length > 0}
      <div class="space-y-1">
        <label class="text-xs font-medium text-zinc-600" for="sl-group"
          >{m.shopping_list_form_group()}</label
        >
        <select
          id="sl-group"
          bind:value={newGroupId}
          class="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 bg-white"
        >
          <option value="">{m.shopping_list_form_no_group()}</option>
          {#each groupsQuery.data as group}
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
        class="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={createMut.isPending}
        class="flex-1 rounded-lg bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
      >
        {createMut.isPending ? m.common_saving() : m.common_save()}
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
