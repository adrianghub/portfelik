<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import ShoppingListCategoryCombobox from "$lib/components/shopping-lists/ShoppingListCategoryCombobox.svelte";
  import ShoppingListItemEditSheet from "$lib/components/shopping-lists/ShoppingListItemEditSheet.svelte";
  import ShoppingListItemQuickAdd from "$lib/components/shopping-lists/ShoppingListItemQuickAdd.svelte";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";
  import ProgressBar from "$lib/components/ui/ProgressBar.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import { motionDuration } from "$lib/motion";
  import * as m from "$lib/paraglide/messages";
  import {
    compareShoppingListCategoryGroups,
    isShoppingListCategoryGroupDone,
    normalizeShoppingListCategory,
    SHOPPING_LIST_CATEGORY_FALLBACK,
  } from "$lib/shopping-list-categories";
  import { fetchCategories } from "$lib/services/categories";
  import { fetchUserGroups } from "$lib/services/groups";
  import {
    createShoppingItemCategory,
    fetchShoppingItemCategories,
  } from "$lib/services/shopping-item-categories";
  import {
    completeShoppingList,
    createShoppingListItem,
    deleteAllShoppingListItems,
    deleteShoppingListItem,
    fetchShoppingListById,
    setAllShoppingListItemsCompleted,
    updateShoppingList,
    updateShoppingListItem,
    updateShoppingListItemsCategory,
  } from "$lib/services/shopping-lists";
  import type { ShoppingListItem, ShoppingListWithItems } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import {
    Check,
    CheckCheck,
    ChevronDown,
    ListPlus,
    Pencil,
    Plus,
    Square,
    Trash2,
    Users,
  } from "lucide-svelte";
  import { onMount, tick } from "svelte";
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

  const itemCategoriesQuery = createQuery(() => ({
    queryKey: ["shopping_item_categories"],
    queryFn: fetchShoppingItemCategories,
    staleTime: 5 * 60_000,
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
      category,
      position,
    }: {
      shopping_list_id: string;
      name: string;
      quantity: number | null;
      unit: string | null;
      category: string | null;
      position: number;
    }) =>
      createShoppingListItem({
        shopping_list_id: id,
        name,
        quantity,
        unit,
        category,
        position,
      }),
    onMutate: async ({
      name,
      quantity,
      unit,
      category,
    }: {
      name: string;
      quantity: number | null;
      unit: string | null;
      category: string | null;
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
        category,
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

  // Delete item — optimistic; expose undo only after the delete is confirmed.
  const deleteItemMutation = createMutation(() => ({
    mutationFn: (item: ShoppingListItem) => deleteShoppingListItem(item.id),
    onMutate: async (item) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.filter((it) => it.id !== item.id),
        });
      }
      return { previous };
    },
    onSuccess: (_data, item) => {
      toast.success(m.toast_shopping_list_item_deleted(), {
        action: {
          label: m.common_undo(),
          onClick: () => restoreDeletedItem(item),
        },
        duration: 6000,
      });
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
        category: item.category,
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
      updates: {
        name: string;
        quantity: number | null;
        unit: string | null;
        category: string | null;
      };
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

  const removeCategoryMutation = createMutation(() => ({
    mutationFn: ({ itemIds }: { category: string; itemIds: string[] }) =>
      updateShoppingListItemsCategory(itemIds, null),
    onMutate: async ({ category, itemIds }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueryData<ShoppingListWithItems>(listKey);
      if (previous) {
        queryClient.setQueryData<ShoppingListWithItems>(listKey, {
          ...previous,
          shopping_list_items: previous.shopping_list_items.map((item) =>
            itemIds.includes(item.id) ? { ...item, category: null } : item
          ),
        });
      }
      removeDraftCategory(category);
      removeCategoryTarget = null;
      return { previous };
    },
    onSuccess: () => toast.success(m.shopping_list_category_removed()),
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(listKey, ctx.previous);
      toast.error(m.toast_error());
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey });
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
  const collapseStorageKey = $derived(id ? `shopping_list_collapsed_categories:${id}` : "");
  let collapsedCategories = $state(new Set<string>());
  let draftCategories = $state(new Set<string>());
  let newSectionCategory = $state("");
  let removeCategoryTarget = $state<{ category: string; items: ShoppingListItem[] } | null>(null);
  let collapseStateLoaded = $state(false);
  let shoppingMode = $state(false);
  let activeShoppingCategory = $state<string | null>(null);

  const groupedItems = $derived.by(() => {
    const map = new Map<string, ShoppingListItem[]>();
    for (const item of visibleItems) {
      const category = item.category?.trim() || SHOPPING_LIST_CATEGORY_FALLBACK;
      map.set(category, [...(map.get(category) ?? []), item]);
    }
    if (!itemSearch.trim()) {
      for (const category of draftCategories) {
        if (!map.has(category)) map.set(category, []);
      }
    }
    const order = new Map(
      (itemCategoriesQuery.data ?? []).map((category, index) => [category.name, index])
    );
    return Array.from(map.entries()).sort(([a, itemsA], [b, itemsB]) =>
      compareShoppingListCategoryGroups(
        {
          category: a,
          completed: completedInGroup(itemsA),
          total: itemsA.length,
          orderIndex: order.get(a),
        },
        {
          category: b,
          completed: completedInGroup(itemsB),
          total: itemsB.length,
          orderIndex: order.get(b),
        }
      )
    );
  });

  function completedInGroup(items: ShoppingListItem[]): number {
    return items.filter((item) => item.completed).length;
  }

  function isGroupDone(items: ShoppingListItem[]): boolean {
    return isShoppingListCategoryGroupDone({
      category: "",
      completed: completedInGroup(items),
      total: items.length,
    });
  }

  function itemCategoryName(item: ShoppingListItem): string {
    return item.category?.trim() || SHOPPING_LIST_CATEGORY_FALLBACK;
  }

  function allItemsInCategory(category: string): ShoppingListItem[] {
    return (query.data?.shopping_list_items ?? []).filter(
      (item) => itemCategoryName(item) === category
    );
  }

  onMount(() => {
    if (!collapseStorageKey) return;
    try {
      const raw = localStorage.getItem(collapseStorageKey);
      collapsedCategories = new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      collapsedCategories = new Set();
    }
    collapseStateLoaded = true;
  });

  $effect(() => {
    if (!collapseStateLoaded || !collapseStorageKey || typeof localStorage === "undefined") return;
    localStorage.setItem(collapseStorageKey, JSON.stringify(Array.from(collapsedCategories)));
  });

  $effect(() => {
    if (!shoppingMode) return;
    const categoryNames = groupedItems.map(([category]) => category);
    if (categoryNames.length === 0) {
      activeShoppingCategory = null;
    } else if (!activeShoppingCategory || !categoryNames.includes(activeShoppingCategory)) {
      activeShoppingCategory = categoryNames[0];
    }
  });

  function isCategoryCollapsed(category: string): boolean {
    if (shoppingMode) return activeShoppingCategory !== category;
    return collapsedCategories.has(category);
  }

  function toggleCategory(category: string) {
    if (shoppingMode) {
      activeShoppingCategory = category;
      return;
    }
    const next = new Set(collapsedCategories);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    collapsedCategories = next;
  }

  function toggleShoppingMode() {
    shoppingMode = !shoppingMode;
    if (shoppingMode) activeShoppingCategory = groupedItems[0]?.[0] ?? null;
  }

  function categoryToStoredValue(category: string): string | null {
    return normalizeShoppingListCategory(category);
  }

  async function addCategorySection(e?: SubmitEvent) {
    e?.preventDefault();
    const category =
      normalizeShoppingListCategory(newSectionCategory) ?? SHOPPING_LIST_CATEGORY_FALLBACK;
    const next = new Set(draftCategories);
    next.add(category);
    draftCategories = next;
    const collapsedNext = new Set(collapsedCategories);
    collapsedNext.delete(category);
    collapsedCategories = collapsedNext;
    activeShoppingCategory = category;
    newSectionCategory = "";
    await tick();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const exists = (itemCategoriesQuery.data ?? []).some(
      (itemCategory) => itemCategory.name === category
    );
    if (category !== SHOPPING_LIST_CATEGORY_FALLBACK && !exists) {
      try {
        await createShoppingItemCategory({
          name: category,
          position: itemCategoriesQuery.data?.length ?? 0,
        });
        await queryClient.invalidateQueries({ queryKey: ["shopping_item_categories"] });
      } catch {
        // The section is still useful even if saving it to the reusable vocabulary fails.
      }
    }
  }

  function removeDraftCategory(category: string) {
    const next = new Set(draftCategories);
    next.delete(category);
    draftCategories = next;

    const collapsedNext = new Set(collapsedCategories);
    collapsedNext.delete(category);
    collapsedCategories = collapsedNext;

    if (activeShoppingCategory === category) activeShoppingCategory = groupedItems[0]?.[0] ?? null;
  }

  function requestRemoveCategory(category: string) {
    const items = allItemsInCategory(category);
    if (items.length === 0) {
      removeDraftCategory(category);
      return;
    }
    removeCategoryTarget = { category, items };
  }

  function confirmRemoveCategory() {
    if (!removeCategoryTarget) return;
    removeCategoryMutation.mutate({
      category: removeCategoryTarget.category,
      itemIds: removeCategoryTarget.items.map((item) => item.id),
    });
  }

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

  function saveEdit(updates: {
    name: string;
    quantity: number | null;
    unit: string | null;
    category: string | null;
  }) {
    if (!editTarget) return;
    renameMutation.mutate({ id: editTarget.id, updates });
  }
  function deleteItem(item: ShoppingListItem) {
    deleteItemMutation.mutate(item);
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

    {#if list.shopping_list_items.length === 0 && groupedItems.length === 0}
      <EmptyState title={m.shopping_list_items_empty()} body={m.shopping_list_items_empty_hint()}>
        {#snippet icon()}
          <ListPlus size={28} strokeWidth={1.4} />
        {/snippet}
      </EmptyState>
    {/if}

    {#if isActive}
      <form
        onsubmit={addCategorySection}
        class="space-y-2 rounded-2xl border border-white/5 bg-slate-900/50 p-3"
      >
        <p class="text-xs text-slate-400">{m.shopping_list_category_section_hint()}</p>
        <div class="flex items-start gap-2">
          <ShoppingListCategoryCombobox
            bind:value={newSectionCategory}
            showLabel={false}
            id="new-shopping-list-section"
            placeholder={m.shopping_list_category_section_placeholder()}
          />
          <button
            type="submit"
            disabled={!newSectionCategory.trim()}
            class="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/15 px-3 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:opacity-50"
          >
            <Plus size={14} aria-hidden="true" />
            <span class="hidden sm:inline">{m.shopping_list_category_section_submit()}</span>
          </button>
        </div>
      </form>
    {/if}

    {#if list.shopping_list_items.length > 0 || groupedItems.length > 0}
      {#if itemTotal > 5}
        <input
          type="search"
          bind:value={itemSearch}
          placeholder={m.shopping_list_items_search_placeholder()}
          class="w-full rounded-lg border border-white/5 bg-slate-900/40 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/30 focus:ring-1 focus:ring-emerald-400/20 focus:outline-none"
        />
      {/if}
      <div class="flex flex-wrap items-center justify-between gap-2">
        {#if groupedItems.length > 1}
          <button
            type="button"
            onclick={toggleShoppingMode}
            aria-pressed={shoppingMode}
            class={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              shoppingMode
                ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200"
            )}
          >
            {m.shopping_list_shopping_mode()}
          </button>
        {/if}
        {#if isActive && itemTotal > 1}
          <div class="ml-auto flex items-center gap-1 text-slate-500">
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
      </div>

      {#if groupedItems.length === 0}
        <p
          class="rounded-xl border border-white/5 bg-slate-900/40 px-3 py-4 text-sm text-slate-500"
        >
          {m.shopping_list_items_search_empty()}
        </p>
      {:else}
        <div class="space-y-2">
          {#each groupedItems as [category, items] (category)}
            {@const collapsed = isCategoryCollapsed(category)}
            {@const completedCount = completedInGroup(items)}
            {@const groupDone = isGroupDone(items)}
            <section
              class={cn(
                "space-y-2 rounded-2xl border p-2 transition-colors",
                groupDone
                  ? "border-white/5 bg-slate-900/25 opacity-75"
                  : "border-white/5 bg-slate-900/45"
              )}
            >
              <div
                class={cn(
                  "flex items-center gap-1 rounded-xl border border-transparent transition-colors",
                  shoppingMode && activeShoppingCategory === category
                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
                    : "text-slate-200"
                )}
              >
                <button
                  type="button"
                  onclick={() => toggleCategory(category)}
                  class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/5"
                  aria-expanded={!collapsed}
                  aria-label={m.shopping_list_category_toggle({ category })}
                >
                  <ChevronDown
                    size={15}
                    strokeWidth={1.8}
                    class={cn("shrink-0 transition-transform", collapsed && "-rotate-90")}
                    aria-hidden="true"
                  />
                  <span
                    class={cn(
                      "min-w-0 flex-1 truncate font-medium",
                      groupDone && "text-slate-500 line-through"
                    )}
                  >
                    {category}
                  </span>
                </button>
                <span
                  class={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-xs tabular-nums",
                    groupDone
                      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
                      : "border-white/10 text-slate-400"
                  )}
                >
                  {completedCount}/{items.length}
                </span>
                {#if isActive && (category !== SHOPPING_LIST_CATEGORY_FALLBACK || items.length === 0)}
                  <button
                    type="button"
                    onclick={() => requestRemoveCategory(category)}
                    disabled={removeCategoryMutation.isPending}
                    class="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-40"
                    aria-label={m.shopping_list_category_remove({ category })}
                    title={m.shopping_list_category_remove({ category })}
                  >
                    <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                {/if}
              </div>
              {#if !collapsed}
                <ul class="space-y-1" transition:slide={{ duration: motionDuration(160) }}>
                  {#each items as item (item.id)}
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
                          item.completed
                            ? "border-emerald-400/60 bg-emerald-400/20"
                            : "border-white/15"
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
              {#if isActive && !collapsed}
                <div class="pt-1">
                  <ShoppingListItemQuickAdd
                    fixedCategory={categoryToStoredValue(category)}
                    disabled={addItemMutation.isPending}
                    onsubmit={({ name, quantity, unit, category: itemCategory }) =>
                      addItemMutation.mutate({
                        shopping_list_id: list.id,
                        name,
                        quantity,
                        unit,
                        category: itemCategory,
                        position: list.shopping_list_items.length + 1,
                      })}
                  />
                </div>
              {/if}
            </section>
          {/each}
        </div>
      {/if}
    {/if}

    {#if isActive}
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

<ConfirmDialog
  open={!!removeCategoryTarget}
  message={m.shopping_list_category_remove_confirm({
    category: removeCategoryTarget?.category ?? "",
    count: removeCategoryTarget?.items.length ?? 0,
  })}
  onconfirm={confirmRemoveCategory}
  onclose={() => (removeCategoryTarget = null)}
  pending={removeCategoryMutation.isPending}
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
