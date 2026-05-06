<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { fetchCategories, deleteCategory } from "$lib/services/categories";
  import type { Category } from "$lib/types";
  import { cn } from "$lib/utils";
  import CategoryDialog from "./CategoryDialog.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";

  const queryClient = useQueryClient();

  const query = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  let dialogOpen = $state(false);
  let editTarget = $state<Category | null>(null);
  let deleteTargetId = $state<string | null>(null);

  const deleteMutation = createMutation(() => ({
    mutationFn: () => deleteCategory(deleteTargetId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      toast.success(m.toast_category_deleted());
      deleteTargetId = null;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function openAdd() {
    editTarget = null;
    dialogOpen = true;
  }

  function openEdit(cat: Category) {
    editTarget = cat;
    dialogOpen = true;
  }
</script>

{#if query.isLoading}
  <div class="space-y-2" aria-busy="true" aria-label={m.common_loading()}>
    {#each [0, 1, 2, 3, 4] as _, i (i)}
      <div class="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800"></div>
    {/each}
  </div>
{:else if query.isError}
  <p class="text-sm text-rose-600" role="alert">{m.common_error_title()}</p>
{:else if query.data}
  <!-- Mobile card list -->
  <ul class="space-y-1.5 sm:hidden">
    {#each query.data as cat (cat.id)}
      <li
        class="flex items-center justify-between rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="truncate text-sm text-zinc-900 dark:text-white">{cat.name}</span>
          {#if !cat.user_id}
            <span class="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{m.categories_system()}</span>
          {/if}
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span
            class={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              cat.type === "income" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            )}
          >
            {cat.type === "income" ? m.common_income() : m.common_expense()}
          </span>
          {#if cat.user_id}
            <button
              onclick={() => openEdit(cat)}
              class="p-1 text-zinc-400 transition-colors hover:text-zinc-600"
              aria-label={m.common_edit()}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
              >
            </button>
            <button
              onclick={() => (deleteTargetId = cat.id)}
              class="p-1 text-zinc-400 transition-colors hover:text-rose-600"
              aria-label={m.common_delete()}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                ><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path
                  d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                /></svg
              >
            </button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>

  <!-- Desktop table -->
  <div class="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white sm:block dark:border-zinc-700 dark:bg-zinc-900">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
          <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >{m.categories_col_name()}</th
          >
          <th scope="col" class="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400"
            >{m.categories_col_type()}</th
          >
          <th scope="col" class="px-4 py-3 text-right text-xs font-medium text-zinc-500 dark:text-zinc-400"></th>
        </tr>
      </thead>
      <tbody>
        {#each query.data as cat (cat.id)}
          <tr class="border-b border-zinc-50 last:border-0 dark:border-zinc-800">
            <td class="px-4 py-3 text-zinc-900 dark:text-white">
              {cat.name}
              {#if !cat.user_id}
                <span class="ml-1.5 text-xs text-zinc-400 dark:text-zinc-500">{m.categories_system()}</span>
              {/if}
            </td>
            <td class="px-4 py-3">
              <span
                class={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  cat.type === "income"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-rose-50 text-rose-700"
                )}
              >
                {cat.type === "income" ? m.common_income() : m.common_expense()}
              </span>
            </td>
            <td class="px-4 py-3 text-right">
              {#if cat.user_id}
                <div class="flex items-center justify-end gap-1">
                  <button
                    onclick={() => openEdit(cat)}
                    class="rounded p-1.5 text-zinc-400 transition-colors hover:text-zinc-600"
                    aria-label={m.common_edit()}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      ><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg
                    >
                  </button>
                  <button
                    onclick={() => (deleteTargetId = cat.id)}
                    class="rounded p-1.5 text-zinc-400 transition-colors hover:text-rose-600"
                    aria-label={m.common_delete()}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      ><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path
                        d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
                      /></svg
                    >
                  </button>
                </div>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if query.data.length === 0}
    <p class="py-8 text-center text-sm text-zinc-400">{m.categories_empty()}</p>
  {/if}

  <button
    onclick={openAdd}
    class="mt-4 w-full rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-300"
  >
    + {m.category_form_title_add()}
  </button>
{/if}

<CategoryDialog open={dialogOpen} onclose={() => (dialogOpen = false)} initial={editTarget} />

<ConfirmDialog
  open={!!deleteTargetId}
  message={m.common_confirm_delete_description()}
  onconfirm={() => deleteMutation.mutate()}
  onclose={() => (deleteTargetId = null)}
  pending={deleteMutation.isPending}
/>
