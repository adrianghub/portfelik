<script lang="ts">
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import Fab from "$lib/components/ui/Fab.svelte";
  import * as m from "$lib/paraglide/messages";
  import {
    createShoppingItemCategory,
    deleteShoppingItemCategory,
    ensureDefaultShoppingItemCategories,
    fetchShoppingItemCategories,
    swapShoppingItemCategoryPositions,
    updateShoppingItemCategory,
  } from "$lib/services/shopping-item-categories";
  import type { ShoppingItemCategory } from "$lib/types";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { ArrowDown, ArrowUp, Pencil, Plus, Tags, Trash2 } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();
  const query = createQuery(() => ({
    queryKey: ["shopping_item_categories"],
    queryFn: fetchShoppingItemCategories,
  }));

  let dialogOpen = $state(false);
  let editTarget = $state<ShoppingItemCategory | null>(null);
  let categoryName = $state("");
  let deleteTarget = $state<ShoppingItemCategory | null>(null);

  const categories = $derived(query.data ?? []);

  const saveMutation = createMutation(() => ({
    mutationFn: async () => {
      const name = categoryName.trim();
      if (!name) throw new Error("name_required");
      if (editTarget) return updateShoppingItemCategory(editTarget.id, { name });
      return createShoppingItemCategory({ name, position: categories.length });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_item_categories"] });
      toast.success(
        editTarget ? m.shopping_item_category_updated() : m.shopping_item_category_created()
      );
      closeDialog();
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const deleteMutation = createMutation(() => ({
    mutationFn: () => deleteShoppingItemCategory(deleteTarget!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_item_categories"] });
      toast.success(m.shopping_item_category_deleted());
      deleteTarget = null;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const resetMutation = createMutation(() => ({
    mutationFn: ensureDefaultShoppingItemCategories,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_item_categories"] });
      toast.success(m.shopping_item_categories_defaults_restored());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const moveMutation = createMutation(() => ({
    mutationFn: ({
      current,
      next,
    }: {
      current: ShoppingItemCategory;
      next: ShoppingItemCategory;
    }) => swapShoppingItemCategoryPositions(current, next),
    onMutate: async ({ current, next }) => {
      await queryClient.cancelQueries({ queryKey: ["shopping_item_categories"] });
      const previous = queryClient.getQueryData<ShoppingItemCategory[]>([
        "shopping_item_categories",
      ]);
      if (previous) {
        queryClient.setQueryData<ShoppingItemCategory[]>(
          ["shopping_item_categories"],
          previous
            .map((category) =>
              category.id === current.id
                ? { ...category, position: next.position }
                : category.id === next.id
                  ? { ...category, position: current.position }
                  : category
            )
            .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "pl"))
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(["shopping_item_categories"], ctx.previous);
      }
      toast.error(m.toast_error());
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["shopping_item_categories"] }),
  }));

  function openAdd() {
    editTarget = null;
    categoryName = "";
    dialogOpen = true;
  }

  function openEdit(category: ShoppingItemCategory) {
    editTarget = category;
    categoryName = category.name;
    dialogOpen = true;
  }

  function closeDialog() {
    dialogOpen = false;
    editTarget = null;
    categoryName = "";
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    saveMutation.mutate();
  }

  function move(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    const current = categories[index];
    const next = categories[nextIndex];
    if (!current || !next) return;
    moveMutation.mutate({ current, next });
  }
</script>

{#if query.isLoading}
  <div class="space-y-2" aria-busy="true" aria-label={m.common_loading()}>
    {#each [0, 1, 2, 3, 4] as _, i (i)}
      <div class="h-10 animate-pulse rounded-xl bg-slate-800/60"></div>
    {/each}
  </div>
{:else if query.isError}
  <div class="space-y-3">
    <p class="text-sm text-rose-300" role="alert">{m.common_error_title()}</p>
    <button
      type="button"
      onclick={() => query.refetch()}
      class="rounded-full border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
    >
      {m.common_retry()}
    </button>
  </div>
{:else}
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-sm text-slate-400">{m.shopping_item_categories_hint()}</p>
      <div class="flex items-center gap-2">
        <button
          type="button"
          onclick={() => resetMutation.mutate()}
          disabled={resetMutation.isPending}
          class="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50"
        >
          {m.shopping_item_categories_restore_defaults()}
        </button>
        <button
          type="button"
          onclick={openAdd}
          class="bg-accent-gradient focus-visible:ring-accent hidden items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none md:inline-flex"
        >
          <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
          {m.shopping_item_category_add()}
        </button>
      </div>
    </div>

    {#if categories.length === 0}
      <EmptyState
        title={m.shopping_item_categories_empty()}
        body={m.shopping_item_categories_empty_hint()}
      >
        {#snippet icon()}
          <Tags size={28} strokeWidth={1.4} />
        {/snippet}
      </EmptyState>
    {:else}
      <ul class="space-y-1.5">
        {#each categories as category, index (category.id)}
          <li
            class="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-slate-900/50 px-3 py-2"
          >
            <span class="min-w-0 truncate text-sm text-slate-100">{category.name}</span>
            <div class="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onclick={() => move(index, -1)}
                disabled={index === 0 || moveMutation.isPending}
                class="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200 disabled:opacity-30"
                aria-label={m.common_move_up()}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                onclick={() => move(index, 1)}
                disabled={index === categories.length - 1 || moveMutation.isPending}
                class="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200 disabled:opacity-30"
                aria-label={m.common_move_down()}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                onclick={() => openEdit(category)}
                class="rounded p-1.5 text-slate-500 hover:bg-white/5 hover:text-slate-200"
                aria-label={m.common_edit()}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onclick={() => (deleteTarget = category)}
                class="rounded p-1.5 text-slate-500 hover:bg-rose-500/10 hover:text-rose-300"
                aria-label={m.common_delete()}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<Dialog
  open={dialogOpen}
  onclose={closeDialog}
  title={editTarget ? m.shopping_item_category_edit_title() : m.shopping_item_category_add_title()}
>
  <form onsubmit={submit} class="space-y-4">
    <input
      type="text"
      bind:value={categoryName}
      required
      placeholder={m.shopping_item_category_name_placeholder()}
      class="focus:border-accent/40 focus:ring-accent/30 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:ring-2 focus:outline-none"
    />
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={closeDialog}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={saveMutation.isPending || !categoryName.trim()}
        class="bg-accent-gradient focus-visible:ring-accent flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      >
        {saveMutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>

<ConfirmDialog
  open={!!deleteTarget}
  message={m.shopping_item_category_delete_confirm({
    name: deleteTarget?.name ?? "",
  })}
  onconfirm={() => deleteMutation.mutate()}
  onclose={() => (deleteTarget = null)}
  pending={deleteMutation.isPending}
/>

<Fab onclick={openAdd} aria-label={m.shopping_item_category_add()} />
