<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import ShoppingListItemEditSheet from "$lib/components/shopping-lists/ShoppingListItemEditSheet.svelte";
  import ShoppingListItemQuickAdd from "$lib/components/shopping-lists/ShoppingListItemQuickAdd.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import ProgressBar from "$lib/components/ui/ProgressBar.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import { motionDuration } from "$lib/motion";
  import * as m from "$lib/paraglide/messages";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import {
    completeShoppingList,
    createShoppingListItem,
    deleteAllShoppingListItems,
    deleteShoppingListItem,
    fetchShoppingListById,
    setAllShoppingListItemsCompleted,
    updateShoppingList,
    updateShoppingListItem,
  } from "$lib/services/shopping-lists";
  import type { ShoppingListItem, ShoppingListWithItems } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { Check, CheckCheck, ListPlus, Pencil, Square, Trash2, Users } from "lucide-svelte";
  import { toast } from "svelte-sonner";
  import { flip } from "svelte/animate";
  import { slide } from "svelte/transition";

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

  const expenseCategories = $derived(
    categoriesQuery.data?.filter((c) => c.type === "expense") ?? []
  );

  const listKey = $derived(["shopping_list", id] as const);

  // Toggle item completed — optimistic
  const toggleMutation = createMutation(() => ({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      updateShoppingListItem(itemId, { completed }),
    onMutate: async ({ itemId, completed }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.map((it) =>
            it.id === itemId ? { ...it, completed } : it
          ),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  // Add item — optimistic with temp id

  const addItemMutation = createMutation(() => ({
    mutationFn: ({
      name,
      quantity,
      unit,
      position,
    }: {
      shopping_list_id: string;
      name: string;
      quantity: number | null;
      unit: string | null;
      position: number;
    }) =>
      createShoppingListItem({
        shopping_list_id: id,
        name,
        quantity,
        unit,
        position,
      }),
    onMutate: async ({
      name,
      quantity,
      unit,
    }: {
      name: string;
      quantity: number | null;
      unit: string | null;
      position: number;
      shopping_list_id: string;
    }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      const tempId = "__optimistic_" + crypto.randomUUID();
      const tempItem: ShoppingListItem = {
        id: tempId,
        shopping_list_id: id,
        name,
        quantity,
        unit,
        completed: false,
        position: (previous?.shopping_list_items.length ?? 0) + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: [...previous.shopping_list_items, tempItem],
        });
      }
      return { previous, tempId };
    },
    onSuccess: (real, _vars, ctx) => {
      const cur = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (cur && ctx?.tempId) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...cur,
          shopping_list_items: cur.shopping_list_items.map((i) => (i.id === ctx.tempId ? real : i)),
        });
      }
      toast.success(m.toast_shopping_list_item_added());
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  // Delete item — optimistic
  const deleteItemMutation = createMutation(() => ({
    mutationFn: (itemId: string) => deleteShoppingListItem(itemId),
    onMutate: async (itemId) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.filter((it) => it.id !== itemId),
        });
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  async function restoreDeletedItem(item: ShoppingListItem) {
    try {
      await createShoppingListItem({
        shopping_list_id: item.shopping_list_id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        position: item.position,
      });
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    } catch {
      toast.error(m.toast_error());
    }
  }

  // Edit item (name + quantity + unit) — optimistic
  let editTarget = $state<ShoppingListItem | null>(null);

  const renameMutation = createMutation(() => ({
    mutationFn: (args: {
      id: string;
      updates: { name: string; quantity: number | null; unit: string | null };
    }) => updateShoppingListItem(args.id, args.updates),
    onMutate: async (args) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.map((it) =>
            it.id === args.id ? { ...it, ...args.updates } : it
          ),
        });
      }
      editTarget = null;
      return { previous };
    },
    onSuccess: (real) => {
      const cur = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (cur) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...cur,
          shopping_list_items: cur.shopping_list_items.map((it) => (it.id === real.id ? real : it)),
        });
      }
      toast.success(m.toast_shopping_list_item_renamed());
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  // Edit list — name + group sharing + date — optimistic
  let showRenameList = $state(false);
  let renameListName = $state("");
  let renameListGroupId = $state<string | null>(null);
  let renameListDate = $state("");

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
  }));

  const renameListMutation = createMutation(() => ({
    mutationFn: (vars: { name: string; group_id: string | null; created_at: string }) =>
      updateShoppingList(id, vars),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          name: vars.name,
          group_id: vars.group_id,
          created_at: vars.created_at,
        });
      }
      showRenameList = false;
      return { previous };
    },
    onSuccess: () => toast.success(m.toast_shopping_list_updated()),
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  function toDateInput(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function fromDateInput(dateStr: string, original: string): string {
    if (!dateStr) return original;
    const o = new Date(original);
    const [y, m2, d] = dateStr.split("-").map(Number);
    if (!y || !m2 || !d) return original;
    o.setFullYear(y, m2 - 1, d);
    return o.toISOString();
  }

  function openRenameListDialog() {
    renameListName = query.data?.name ?? "";
    renameListGroupId = query.data?.group_id ?? null;
    renameListDate = toDateInput(query.data?.created_at);
    showRenameList = true;
  }

  function submitRenameList(e: SubmitEvent) {
    e.preventDefault();
    const trimmed = renameListName.trim();
    if (!trimmed) return;
    const created_at = fromDateInput(
      renameListDate,
      query.data?.created_at ?? new Date().toISOString()
    );
    renameListMutation.mutate({ name: trimmed, group_id: renameListGroupId, created_at });
  }

  // Complete list — pre-fill category if list has one
  let showComplete = $state(false);
  let showUncheckedComplete = $state(false);
  let completeAmount = $state("");
  let completeCategoryId = $state("");

  const completeMutation = createMutation(() => ({
    mutationFn: () => completeShoppingList(id, parseFloat(completeAmount), completeCategoryId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      const completedAt = new Date().toISOString();
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          status: "completed",
          completed_at: completedAt,
        });
      }
      showComplete = false;
      return { previous };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.shopping_list_completed_celebration());
      const { default: confetti } = await import("canvas-confetti");
      confetti({
        particleCount: 100,
        spread: 75,
        origin: { y: 0.7 },
        colors: ["#34d399", "#bef264", "#a7f3d0", "#86efac"],
      });
      await goto("/shopping-lists");
    },
    onError: (err: unknown, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      const msg = (err as { message?: string })?.message ?? "";
      if (msg.includes("list_empty")) {
        toast.error(m.toast_list_empty());
        return;
      }
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  function submitComplete(e: Event) {
    e.preventDefault();
    completeMutation.mutate();
  }

  function openCompleteDialog() {
    showComplete = true;
    completeAmount = "";
    completeCategoryId = query.data?.category_id ?? "";
  }

  const isActive = $derived(query.data?.status === "active");
  const hasItems = $derived((query.data?.shopping_list_items?.length ?? 0) > 0);
  const itemTotal = $derived(query.data?.shopping_list_items.length ?? 0);
  const itemDone = $derived(query.data?.shopping_list_items.filter((i) => i.completed).length ?? 0);
  const hasUncheckedItems = $derived(hasItems && itemDone < itemTotal);
  let itemSearch = $state("");
  const sortedItems = $derived(
    [...(query.data?.shopping_list_items ?? [])].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return a.position - b.position;
    })
  );
  const visibleItems = $derived.by(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return sortedItems;
    return sortedItems.filter((i) => i.name.toLowerCase().includes(q));
  });

  function requestCompleteDialog() {
    if (hasUncheckedItems) {
      showUncheckedComplete = true;
      return;
    }
    openCompleteDialog();
  }

  function continueCompleteDialog() {
    showUncheckedComplete = false;
    openCompleteDialog();
  }

  function saveEdit(updates: { name: string; quantity: number | null; unit: string | null }) {
    if (!editTarget) return;
    renameMutation.mutate({ id: editTarget.id, updates });
  }
  function deleteItem(item: ShoppingListItem) {
    deleteItemMutation.mutate(item.id);
    toast.success(m.toast_shopping_list_item_deleted(), {
      action: {
        label: m.common_undo(),
        onClick: () => restoreDeletedItem(item),
      },
      duration: 6000,
    });
  }
  function toggleItem(item: ShoppingListItem) {
    if (!isActive) return;
    toggleMutation.mutate({ itemId: item.id, completed: !item.completed });
  }
  function rowClick(item: ShoppingListItem) {
    toggleItem(item);
  }
  function rowKeydown(e: KeyboardEvent, item: ShoppingListItem) {
    if (e.currentTarget !== e.target) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleItem(item);
    }
  }

  // Bulk
  let bulkDeleteConfirm = $state(false);

  const bulkToggleMutation = createMutation(() => ({
    mutationFn: (completed: boolean) => setAllShoppingListItemsCompleted(id, completed),
    onMutate: async (completed) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.map((it) => ({ ...it, completed })),
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

  const bulkDeleteMutation = createMutation(() => ({
    mutationFn: () => deleteAllShoppingListItems(id),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: [],
        });
      }
      bulkDeleteConfirm = false;
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
</script>

<div class="container mx-auto max-w-2xl space-y-4 px-4 pt-6 pb-56 md:pb-6">
  <a
    href="/shopping-lists"
    class="inline-flex items-center gap-1 text-sm text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
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
      stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
    >
    {m.common_back()}
  </a>

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
        {#if isActive}
          <button
            type="button"
            onclick={openRenameListDialog}
            class="shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-100"
            aria-label={m.shopping_list_rename_title()}
          >
            <Pencil size={15} strokeWidth={1.8} aria-hidden="true" />
          </button>
        {/if}
      </div>
      <span
        class={cn(
          "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
          list.status === "active" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"
        )}
      >
        {list.status === "active"
          ? m.shopping_lists_status_active()
          : m.shopping_lists_status_completed()}
      </span>
    </div>

    <div class="text-xs text-slate-400 dark:text-slate-500">{formatDate(list.created_at)}</div>

    {#if list.status === "active" && itemTotal > 0}
      <div class="mt-2 space-y-1">
        <p class="text-xs text-slate-400">
          {m.shopping_list_progress({ completed: itemDone, total: itemTotal })}
        </p>
        <ProgressBar
          value={itemDone}
          max={itemTotal}
          label={m.shopping_list_progress({ completed: itemDone, total: itemTotal })}
        />
      </div>
    {/if}

    {#if list.status === "completed" && list.total_amount != null}
      {#if list.linked_transaction_id}
        <a
          href={`/transactions?txId=${list.linked_transaction_id}`}
          class="mt-3 block rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200 transition-colors hover:bg-emerald-500/10 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:outline-none"
        >
          <p class="text-xs tracking-wide text-emerald-300/80 uppercase">
            {m.shopping_list_completed_tx_created()}
          </p>
          <p class="mt-0.5 tabular-nums">
            {formatCurrency(list.total_amount, "PLN")}
          </p>
        </a>
      {:else}
        <div
          class="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-200"
        >
          <p class="text-xs tracking-wide text-emerald-300/80 uppercase">
            {m.shopping_list_completed_tx_created()}
          </p>
          <p class="mt-0.5 tabular-nums">
            {formatCurrency(list.total_amount, "PLN")}
          </p>
        </div>
      {/if}
    {/if}

    {#if list.shopping_list_items.length === 0}
      <EmptyState title={m.shopping_list_items_empty()} body={m.shopping_list_items_empty_hint()}>
        {#snippet icon()}
          <ListPlus size={28} strokeWidth={1.4} />
        {/snippet}
      </EmptyState>
    {:else}
      {#if itemTotal > 5}
        <input
          type="search"
          bind:value={itemSearch}
          placeholder={m.shopping_list_items_search_placeholder()}
          class="w-full rounded-lg border border-white/5 bg-slate-900/40 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/30 focus:ring-1 focus:ring-emerald-400/20 focus:outline-none"
        />
      {/if}
      {#if isActive && itemTotal > 1}
        <div class="flex items-center justify-end gap-1 text-slate-500">
          <button
            type="button"
            onclick={() => bulkToggleMutation.mutate(hasUncheckedItems)}
            disabled={bulkToggleMutation.isPending}
            class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs opacity-60 transition hover:bg-white/5 hover:text-slate-200 hover:opacity-100"
          >
            {#if hasUncheckedItems}
              <CheckCheck size={13} strokeWidth={1.8} aria-hidden="true" />
              {m.shopping_list_items_bulk_check_all()}
            {:else}
              <Square size={13} strokeWidth={1.8} aria-hidden="true" />
              {m.shopping_list_items_bulk_uncheck_all()}
            {/if}
          </button>
          <button
            type="button"
            onclick={() => (bulkDeleteConfirm = true)}
            class="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs opacity-60 transition hover:bg-rose-500/10 hover:text-rose-300 hover:opacity-100"
          >
            <Trash2 size={13} strokeWidth={1.8} aria-hidden="true" />
            {m.shopping_list_items_bulk_delete_all()}
          </button>
        </div>
      {/if}
      <ul class="space-y-1">
        {#each visibleItems as item (item.id)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <li
            animate:flip={{ duration: motionDuration(240) }}
            in:slide={{ duration: motionDuration(180) }}
            out:slide={{ duration: motionDuration(160) }}
            class={cn(
              "flex min-w-0 items-center gap-3 rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2",
              isActive &&
                "cursor-pointer transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400/30 focus-visible:outline-none"
            )}
            role={isActive ? "button" : undefined}
            tabindex={isActive ? 0 : undefined}
            aria-label={isActive
              ? item.completed
                ? m.shopping_list_item_uncheck()
                : m.shopping_list_item_check()
              : undefined}
            onclick={() => rowClick(item)}
            onkeydown={(e) => rowKeydown(e, item)}
          >
            <div
              class={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                item.completed ? "border-emerald-400/60 bg-emerald-400/20" : "border-white/15"
              )}
              aria-hidden="true"
            >
              {#if item.completed}
                <Check size={11} strokeWidth={3} class="text-emerald-300" />
              {/if}
            </div>
            <span
              class={cn(
                "min-w-0 flex-1 truncate text-sm",
                item.completed ? "text-slate-500 line-through" : "text-slate-100"
              )}
            >
              {item.name}
            </span>
            {#if item.quantity != null}
              <span class="shrink-0 text-xs text-slate-500">
                {item.quantity}{item.unit ? ` ${item.unit}` : ""}
              </span>
            {/if}
            {#if isActive}
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  editTarget = item;
                }}
                class="shrink-0 rounded-md p-1 text-slate-500 opacity-60 transition hover:bg-white/5 hover:text-slate-200 hover:opacity-100"
                aria-label={m.shopping_list_item_edit()}
              >
                <Pencil size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
              <button
                type="button"
                onclick={(e) => {
                  e.stopPropagation();
                  deleteItem(item);
                }}
                class="shrink-0 rounded-md p-1 text-slate-500 opacity-60 transition hover:bg-rose-500/10 hover:text-rose-300 hover:opacity-100"
                aria-label={m.common_delete()}
              >
                <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if isActive}
      <!-- Inline quick-add -->
      <ShoppingListItemQuickAdd
        disabled={addItemMutation.isPending}
        onsubmit={({ name, quantity, unit }) =>
          addItemMutation.mutate({
            shopping_list_id: list.id,
            name,
            quantity,
            unit,
            position: list.shopping_list_items.length + 1,
          })}
      />
      <button
        type="button"
        onclick={requestCompleteDialog}
        disabled={!hasItems}
        title={hasItems ? m.shopping_list_complete_title() : m.shopping_list_requires_items()}
        aria-label={m.shopping_list_complete_title()}
        class="fixed right-4 z-40 flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-500/10 text-emerald-300 backdrop-blur transition-colors hover:bg-emerald-500/20 hover:text-emerald-200 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
        style="bottom: calc(5.75rem + env(safe-area-inset-bottom));"
      >
        <Check size={18} strokeWidth={2} aria-hidden="true" />
      </button>
    {/if}

    {#if list.total_amount != null}
      <div
        class="flex items-center justify-between rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3 backdrop-blur"
      >
        <span class="text-sm font-medium text-slate-200">{m.shopping_list_total()}</span>
        <span class="text-sm font-semibold text-slate-100">{formatCurrency(list.total_amount)}</span
        >
      </div>
    {/if}
  {/if}
</div>

<!-- Complete list dialog -->
<Dialog
  open={showComplete}
  onclose={() => (showComplete = false)}
  title={m.shopping_list_complete_title()}
>
  <form onsubmit={submitComplete} class="space-y-4">
    <p class="text-sm text-slate-300">{m.shopping_list_complete_creates_tx_hint()}</p>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="comp-amount"
        >{m.shopping_list_complete_amount()}</label
      >
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
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="comp-cat"
        >{m.shopping_list_complete_category()}</label
      >
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

<!-- Warn before opening completion form when shopping is still unchecked. -->
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

<ConfirmDialog
  open={bulkDeleteConfirm}
  message={m.shopping_list_items_bulk_delete_confirm()}
  onconfirm={() => bulkDeleteMutation.mutate()}
  onclose={() => (bulkDeleteConfirm = false)}
/>

{#if editTarget}
  <ShoppingListItemEditSheet
    item={editTarget}
    onclose={() => (editTarget = null)}
    onsave={saveEdit}
    saving={renameMutation.isPending}
  />
{/if}

<!-- Rename list dialog -->
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
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-400" for="list-date">
        {m.shopping_list_date_label()}
      </label>
      <input
        id="list-date"
        type="date"
        bind:value={renameListDate}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      />
    </div>
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
        disabled={renameListMutation.isPending || !renameListName.trim()}
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:opacity-50"
      >
        {renameListMutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>
