<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { session, requireSessionUserId } from "$lib/auth/session.svelte";
  import { qk } from "$lib/query-keys";
  import { fetchCategories, updateCategory } from "$lib/services/categories";
  import type { Category } from "$lib/types";
  import { cn } from "$lib/utils";
  import CategoryDialog from "./CategoryDialog.svelte";
  import { toast } from "svelte-sonner";
  import { toastError } from "$lib/toast-error";
  import QueryError from "$lib/components/ui/QueryError.svelte";
  import * as m from "$lib/paraglide/messages";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import Fab from "$lib/components/ui/Fab.svelte";
  import { Plus, Tag, Archive, RotateCcw } from "lucide-svelte";
  import VisualIcon from "$lib/components/ui/VisualIcon.svelte";
  import { categoryColor } from "$lib/services/spending-category-display";

  const queryClient = useQueryClient();

  const query = createQuery(() => ({
    queryKey: qk.categories(session.userId!),
    queryFn: fetchCategories,
    enabled: !!session.userId,
  }));

  let dialogOpen = $state(false);
  let editTarget = $state<Category | null>(null);
  let archivedOnly = $state(false);
  const displayedCategories = $derived(
    (query.data ?? []).filter((category) =>
      archivedOnly ? !!category.archived_at : !category.archived_at
    )
  );
  const archiveMutation = createMutation(() => ({
    mutationFn: (category: Category) =>
      updateCategory(category.id, {
        archived_at: category.archived_at ? null : new Date().toISOString(),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.categories(requireSessionUserId()) });
      toast.success(m.category_archive_saved());
    },
    onError: (err) => toastError(err),
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

<div class="mb-3 flex items-center justify-between gap-3">
  <button
    type="button"
    aria-pressed={archivedOnly}
    onclick={() => (archivedOnly = !archivedOnly)}
    class="min-h-11 rounded-full border border-white/10 px-3 text-sm text-slate-300"
    >{archivedOnly ? m.categories_show_active() : m.categories_show_archived()}</button
  >
  <button
    onclick={openAdd}
    class="bg-accent-gradient focus-visible:ring-accent hidden items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:outline-none md:inline-flex"
  >
    <Plus size={15} strokeWidth={2.2} aria-hidden="true" />
    {m.category_form_title_add()}
  </button>
</div>

{#if query.isLoading}
  <div class="space-y-2" aria-busy="true" aria-label={m.common_loading()}>
    {#each [0, 1, 2, 3, 4] as _, i (i)}
      <div class="h-10 animate-pulse rounded-xl bg-slate-800/60"></div>
    {/each}
  </div>
{:else if query.isError}
  <QueryError error={query.error} onRetry={() => query.refetch()} />
{:else if query.data}
  <!-- Mobile card list -->
  <ul class="space-y-1.5 sm:hidden">
    {#each displayedCategories as cat (cat.id)}
      <li
        class="flex items-center justify-between rounded-xl border border-white/5 bg-slate-900/50 px-4 py-3"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span style:color={categoryColor(cat.id, cat.color)}><VisualIcon name={cat.icon} /></span>
          <span class="truncate text-sm text-slate-100">{cat.name}</span>
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <span
            class={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              cat.type === "income" ? "bg-accent/10 text-accent" : "bg-rose-500/10 text-rose-300"
            )}
          >
            {cat.type === "income" ? m.common_income() : m.common_expense()}
          </span>
          <button
            onclick={() => openEdit(cat)}
            class="flex size-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
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
            type="button"
            onclick={() => archiveMutation.mutate(cat)}
            disabled={archiveMutation.isPending ||
              (!cat.archived_at &&
                ["inne", "inne wydatki", "inne przychody"].includes(cat.name.trim().toLowerCase()))}
            class="flex size-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
            aria-label={cat.archived_at ? m.category_restore() : m.category_archive()}
            title={["inne", "inne wydatki", "inne przychody"].includes(
              cat.name.trim().toLowerCase()
            )
              ? m.category_default_active()
              : cat.archived_at
                ? m.category_restore()
                : m.category_archive()}
          >
            {#if cat.archived_at}<RotateCcw size={16} aria-hidden="true" />{:else}<Archive
                size={16}
                aria-hidden="true"
              />{/if}
          </button>
        </div>
      </li>
    {/each}
  </ul>

  <!-- Desktop table -->
  <div
    class="hidden overflow-hidden rounded-xl border border-slate-200 bg-white sm:block dark:border-slate-700 dark:bg-slate-900"
  >
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-slate-100 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
          <th scope="col" class="text-eyebrow px-4 py-3 text-left text-slate-400"
            >{m.categories_col_name()}</th
          >
          <th scope="col" class="text-eyebrow px-4 py-3 text-left text-slate-400"
            >{m.categories_col_type()}</th
          >
          <th scope="col" class="text-eyebrow px-4 py-3 text-right text-slate-400"></th>
        </tr>
      </thead>
      <tbody>
        {#each displayedCategories as cat (cat.id)}
          <tr class="border-b border-slate-50 last:border-0 dark:border-slate-800">
            <td class="px-4 py-3 text-slate-100">
              <span class="inline-flex items-center gap-2"
                ><span style:color={categoryColor(cat.id, cat.color)}
                  ><VisualIcon name={cat.icon} /></span
                >{cat.name}</span
              >
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
              <div class="flex items-center justify-end gap-1">
                <button
                  onclick={() => openEdit(cat)}
                  class="rounded p-1.5 text-slate-400 transition-colors hover:text-slate-600"
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
                  type="button"
                  onclick={() => archiveMutation.mutate(cat)}
                  disabled={archiveMutation.isPending ||
                    (!cat.archived_at &&
                      ["inne", "inne wydatki", "inne przychody"].includes(
                        cat.name.trim().toLowerCase()
                      ))}
                  class="flex size-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
                  aria-label={cat.archived_at ? m.category_restore() : m.category_archive()}
                  title={["inne", "inne wydatki", "inne przychody"].includes(
                    cat.name.trim().toLowerCase()
                  )
                    ? m.category_default_active()
                    : cat.archived_at
                      ? m.category_restore()
                      : m.category_archive()}
                >
                  {#if cat.archived_at}<RotateCcw size={16} aria-hidden="true" />{:else}<Archive
                      size={16}
                      aria-hidden="true"
                    />{/if}
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  {#if displayedCategories.length === 0}
    <EmptyState title={m.categories_empty()} body={m.categories_empty_hint()}>
      {#snippet icon()}
        <Tag size={28} strokeWidth={1.4} />
      {/snippet}
    </EmptyState>
  {/if}
{/if}

<CategoryDialog open={dialogOpen} onclose={() => (dialogOpen = false)} initial={editTarget} />

<Fab onclick={openAdd} aria-label={m.category_form_title_add()} />
