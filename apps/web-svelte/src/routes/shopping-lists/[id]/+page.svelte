<script lang="ts">
  import { page } from "$app/stores";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";
  import {
    fetchShoppingListById,
    updateShoppingListItem,
    createShoppingListItem,
    deleteShoppingListItem,
    completeShoppingList,
    fetchAttachableTransactions,
    attachShoppingListToTransaction,
  } from "$lib/services/shopping-lists";
  import type { ShoppingListItem, ShoppingListWithItems } from "$lib/types";
  import { fetchCategories } from "$lib/services/categories";
  import { formatCurrency, formatDate, cn } from "$lib/utils";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Sheet from "$lib/components/ui/Sheet.svelte";
  import ShoppingListSuggestions from "$lib/components/shopping-lists/ShoppingListSuggestions.svelte";
  import * as m from "$lib/paraglide/messages";
  import { Check, Link2, MoreHorizontal, Plus } from "lucide-svelte";
  import { flip } from "svelte/animate";
  import { slide } from "svelte/transition";
  import { motionDuration } from "$lib/motion";

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
  let showAddItem = $state(false);
  let itemName = $state("");
  let itemQty = $state("");
  let itemUnit = $state("");
  let suggestionRef = $state<{ handleKeydown: (e: KeyboardEvent) => void } | null>(null);

  const addItemMutation = createMutation(() => ({
    mutationFn: () =>
      createShoppingListItem({
        shopping_list_id: id,
        name: itemName,
        quantity: itemQty ? parseFloat(itemQty) : null,
        unit: itemUnit || null,
        position: (query.data?.shopping_list_items.length ?? 0) + 1,
      }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      const tempItem: ShoppingListItem = {
        id: "__optimistic_" + crypto.randomUUID(),
        shopping_list_id: id,
        name: itemName,
        quantity: itemQty ? parseFloat(itemQty) : null,
        unit: itemUnit || null,
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
      showAddItem = false;
      return { previous };
    },
    onSuccess: () => {
      itemName = "";
      itemQty = "";
      itemUnit = "";
      toast.success(m.toast_shopping_list_item_added());
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      showAddItem = true;
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
    onSuccess: () => toast.success(m.toast_shopping_list_item_deleted()),
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  // Rename item — optimistic, dual-key invalidation
  let showRename = $state(false);
  let renameTargetId = $state<string | null>(null);
  let renameValue = $state("");

  const renameMutation = createMutation(() => ({
    mutationFn: ({ itemId, name }: { itemId: string; name: string }) =>
      updateShoppingListItem(itemId, { name }),
    onMutate: async ({ itemId, name }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.map((it) =>
            it.id === itemId ? { ...it, name } : it
          ),
        });
      }
      showRename = false;
      return { previous };
    },
    onSuccess: () => toast.success(m.toast_shopping_list_item_renamed()),
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
    },
  }));

  // Complete list — pre-fill category if list has one
  let showComplete = $state(false);
  let completeAmount = $state("");
  let completeCategoryId = $state("");

  // Connect-to-existing-tx state
  let showConnect = $state(false);

  const attachableQuery = createQuery(() => ({
    queryKey: ["attachable_transactions", query.data?.group_id ?? null],
    queryFn: () => fetchAttachableTransactions(query.data?.group_id ?? null),
    enabled: showConnect,
    staleTime: 30_000,
  }));

  const connectMutation = createMutation(() => ({
    mutationFn: (txId: string) => attachShoppingListToTransaction(id, txId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      await queryClient.invalidateQueries({ queryKey: listKey });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["attachable_transactions"] });
      toast.success(m.toast_shopping_list_connected());
      showConnect = false;
    },
    onError: (err: { message?: string } | Error) => {
      const msg = (err as { message?: string }).message ?? "";
      if (msg.includes("sharing_scope_mismatch")) {
        toast.error(m.toast_sharing_scope_mismatch());
        return;
      }
      if (msg.includes("list_empty")) {
        toast.error(m.toast_list_empty());
        return;
      }
      toast.error(m.toast_error());
    },
  }));

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

  function submitAddItem(e: Event) {
    e.preventDefault();
    addItemMutation.mutate();
  }

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

  // Item row actions sheet (kebab + long-press) + helpers
  let actionsTarget = $state<ShoppingListItem | null>(null);
  let showActions = $state(false);
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  // Set when the long-press setTimeout fires so the subsequent click event
  // (synthesised on pointerup) doesn't also toggle the row.
  let longPressTriggered = false;

  function openActions(item: ShoppingListItem) {
    actionsTarget = item;
    showActions = true;
  }
  function closeActions() {
    showActions = false;
    actionsTarget = null;
  }
  function startLongPress(item: ShoppingListItem) {
    cancelLongPress();
    longPressTriggered = false;
    longPressTimer = setTimeout(() => {
      longPressTriggered = true;
      openActions(item);
    }, 500);
  }
  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }
  function openRenameFromActions() {
    if (!actionsTarget) return;
    renameTargetId = actionsTarget.id;
    renameValue = actionsTarget.name;
    showRename = true;
    showActions = false;
  }
  function submitRename(e: Event) {
    e.preventDefault();
    if (!renameTargetId || !renameValue.trim()) return;
    renameMutation.mutate({ itemId: renameTargetId, name: renameValue.trim() });
  }
  function deleteFromActions() {
    if (!actionsTarget) return;
    deleteItemMutation.mutate(actionsTarget.id);
    closeActions();
  }
  function toggleItem(item: ShoppingListItem) {
    if (!isActive) return;
    toggleMutation.mutate({ itemId: item.id, completed: !item.completed });
  }
  function rowClick(e: MouseEvent, item: ShoppingListItem) {
    // Skip the click that follows a long-press (otherwise the actions sheet
    // opens *and* the row toggles in the same gesture).
    if (longPressTriggered) {
      longPressTriggered = false;
      return;
    }
    toggleItem(item);
    // `e` is unused beyond signature parity; keep it referenced for clarity.
    void e;
  }
  function rowKeydown(e: KeyboardEvent, item: ShoppingListItem) {
    // Only react when the row itself owns the key event. Bubbled events from
    // the nested kebab/`Akcje` button or any future child control should not
    // toggle completion.
    if (e.currentTarget !== e.target) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleItem(item);
    }
  }
</script>

<div class="container mx-auto max-w-2xl space-y-4 px-4 py-6">
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
      <h1 class="text-2xl font-semibold text-slate-900 dark:text-white">{list.name}</h1>
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

    {#if list.shopping_list_items.length === 0}
      <p class="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
        {m.shopping_list_items_empty()}
      </p>
    {:else}
      <ul class="space-y-1">
        {#each list.shopping_list_items as item (item.id)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <li
            animate:flip={{ duration: motionDuration(240) }}
            in:slide={{ duration: motionDuration(180) }}
            out:slide={{ duration: motionDuration(160) }}
            class={cn(
              "flex items-center gap-3 rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3 backdrop-blur",
              isActive &&
                "cursor-pointer transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400/40 focus-visible:outline-none"
            )}
            role={isActive ? "button" : undefined}
            tabindex={isActive ? 0 : undefined}
            aria-label={isActive
              ? item.completed
                ? m.shopping_list_item_uncheck()
                : m.shopping_list_item_check()
              : undefined}
            onclick={(e) => rowClick(e, item)}
            onkeydown={(e) => rowKeydown(e, item)}
            onpointerdown={() => isActive && startLongPress(item)}
            onpointerup={cancelLongPress}
            onpointercancel={cancelLongPress}
            onpointermove={cancelLongPress}
          >
            <div
              class={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                item.completed ? "bg-accent-gradient border-transparent" : "border-white/15"
              )}
              aria-hidden="true"
            >
              {#if item.completed}
                <Check size={11} strokeWidth={3} class="text-slate-900" />
              {/if}
            </div>
            <span
              class={cn(
                "flex-1 text-sm",
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
                  openActions(item);
                }}
                class="shrink-0 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-100"
                aria-label={m.shopping_list_item_actions()}
              >
                <MoreHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
              </button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if isActive}
      <!-- Inline quick-add -->
      <form
        onsubmit={(e) => {
          e.preventDefault();
          if (!itemName.trim()) return;
          addItemMutation.mutate();
        }}
        class="flex gap-2"
      >
        <div class="relative flex-1">
          <input
            type="text"
            bind:value={itemName}
            autocomplete="off"
            placeholder={m.shopping_list_item_add()}
            onkeydown={(e) => suggestionRef?.handleKeydown(e)}
            class="w-full rounded-full border border-white/10 bg-slate-900/60 px-4 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
          />
          <ShoppingListSuggestions
            bind:this={suggestionRef}
            query={itemName}
            onselect={(name, qty, unit) => {
              itemName = name;
              itemQty = qty != null ? String(qty) : "";
              itemUnit = unit ?? "";
            }}
          />
        </div>
        <button
          type="submit"
          disabled={!itemName.trim() || addItemMutation.isPending}
          class="bg-accent-gradient flex h-10 w-10 items-center justify-center rounded-full text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:opacity-40"
          aria-label={m.shopping_list_item_add()}
        >
          <Plus size={18} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </form>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          onclick={() => (showConnect = true)}
          disabled={!hasItems}
          title={hasItems ? undefined : m.shopping_list_requires_items()}
          class="flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Link2 size={15} strokeWidth={1.8} aria-hidden="true" />
          {m.shopping_list_connect_title()}
        </button>
        <button
          type="button"
          onclick={openCompleteDialog}
          disabled={!hasItems}
          title={hasItems ? undefined : m.shopping_list_requires_items()}
          class="bg-accent-gradient rounded-full px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {m.shopping_list_complete_title()}
        </button>
      </div>
      {#if !hasItems}
        <p class="text-center text-xs text-slate-500">{m.shopping_list_requires_items()}</p>
      {/if}
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

<!-- Add item dialog -->
<Dialog open={showAddItem} onclose={() => (showAddItem = false)} title={m.shopping_list_item_add()}>
  <form onsubmit={submitAddItem} class="space-y-4">
    <div class="relative space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="item-name"
        >{m.shopping_list_item_name()}</label
      >
      <input
        id="item-name"
        type="text"
        required
        bind:value={itemName}
        autocomplete="off"
        onkeydown={(e) => suggestionRef?.handleKeydown(e)}
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      />
      <ShoppingListSuggestions
        bind:this={suggestionRef}
        query={itemName}
        onselect={(name, qty, unit) => {
          itemName = name;
          itemQty = qty != null ? String(qty) : "";
          itemUnit = unit ?? "";
        }}
      />
    </div>
    <div class="flex gap-3">
      <div class="flex-1 space-y-1">
        <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="item-qty"
          >{m.shopping_list_item_quantity()}</label
        >
        <input
          id="item-qty"
          type="number"
          min="0"
          step="any"
          bind:value={itemQty}
          class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
        />
      </div>
      <div class="flex-1 space-y-1">
        <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="item-unit"
          >{m.shopping_list_item_unit()}</label
        >
        <input
          id="item-unit"
          type="text"
          bind:value={itemUnit}
          placeholder={m.shopping_list_item_unit_placeholder()}
          class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
        />
      </div>
    </div>
    {#if addItemMutation.isError}
      <p class="text-sm text-rose-600">{m.common_error_title()}</p>
    {/if}
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showAddItem = false)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={addItemMutation.isPending}
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:opacity-50"
      >
        {addItemMutation.isPending ? m.common_saving() : m.common_add()}
      </button>
    </div>
  </form>
</Dialog>

<!-- Complete list dialog -->
<Dialog
  open={showComplete}
  onclose={() => (showComplete = false)}
  title={m.shopping_list_complete_title()}
>
  <form onsubmit={submitComplete} class="space-y-4">
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

<!-- Connect-to-existing-tx sheet -->
<Sheet
  open={showConnect}
  onclose={() => (showConnect = false)}
  title={m.shopping_list_connect_title()}
>
  <div class="space-y-3 pb-2">
    <p class="text-xs text-slate-400">{m.shopping_list_connect_help()}</p>
    {#if attachableQuery.isPending}
      <div class="space-y-2">
        {#each Array(4) as _, i (i)}
          <div class="h-14 animate-pulse rounded-xl bg-slate-800/60"></div>
        {/each}
      </div>
    {:else if (attachableQuery.data?.length ?? 0) === 0}
      <p class="py-6 text-center text-sm text-slate-500">{m.shopping_list_connect_empty()}</p>
    {:else}
      <ul class="max-h-[60vh] space-y-1.5 overflow-y-auto">
        {#each attachableQuery.data ?? [] as tx (tx.id)}
          <li>
            <button
              type="button"
              onclick={() => connectMutation.mutate(tx.id)}
              disabled={connectMutation.isPending}
              class="flex w-full items-center justify-between gap-3 rounded-xl border border-white/5 bg-slate-900/60 px-4 py-3 text-left backdrop-blur transition-colors hover:bg-white/5 disabled:opacity-40"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-slate-100">{tx.description}</p>
                <p class="mt-0.5 text-xs text-slate-500">
                  {formatDate(tx.date)} · {tx.category_name}
                </p>
              </div>
              <span class="shrink-0 text-sm font-semibold text-rose-300 tabular-nums"
                >−{formatCurrency(tx.amount)}</span
              >
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Sheet>

<!-- Item actions sheet (kebab / long-press) -->
<Sheet
  open={showActions}
  onclose={closeActions}
  title={actionsTarget?.name ?? m.shopping_list_item_actions()}
>
  <div class="space-y-2">
    <button
      type="button"
      onclick={openRenameFromActions}
      class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
      {m.shopping_list_item_rename()}
    </button>
    <button
      type="button"
      onclick={deleteFromActions}
      class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path
          d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
        />
      </svg>
      {m.common_delete()}
    </button>
  </div>
</Sheet>

<!-- Rename item dialog -->
<Dialog
  open={showRename}
  onclose={() => (showRename = false)}
  title={m.shopping_list_item_rename_title()}
>
  <form onsubmit={submitRename} class="space-y-4">
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-600 dark:text-slate-300" for="rename-input"
        >{m.shopping_list_item_name()}</label
      >
      <input
        id="rename-input"
        type="text"
        required
        bind:value={renameValue}
        autocomplete="off"
        class="w-full rounded-xl border border-white/10 bg-slate-900/60 px-3.5 py-2 text-sm text-slate-100 backdrop-blur placeholder:text-slate-500 focus:border-emerald-400/40 focus:ring-2 focus:ring-emerald-400/30 focus:outline-none"
      />
    </div>
    <div class="flex gap-2 pt-1">
      <button
        type="button"
        onclick={() => (showRename = false)}
        class="flex-1 rounded-full border border-white/10 bg-slate-900/60 py-2 text-sm font-medium text-slate-200 backdrop-blur transition-colors hover:bg-white/5"
      >
        {m.common_cancel()}
      </button>
      <button
        type="submit"
        disabled={renameMutation.isPending}
        class="bg-accent-gradient flex-1 rounded-full py-2 text-sm font-semibold text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)] transition-transform hover:brightness-110 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:outline-none disabled:opacity-50"
      >
        {renameMutation.isPending ? m.common_saving() : m.common_save()}
      </button>
    </div>
  </form>
</Dialog>
