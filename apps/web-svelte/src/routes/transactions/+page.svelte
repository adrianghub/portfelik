<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import BulkActionsBar from "$lib/components/transactions/BulkActionsBar.svelte";
  import CashPositionStrip from "$lib/components/transactions/CashPositionStrip.svelte";
  import CategoryBreakdown from "$lib/components/transactions/CategoryBreakdown.svelte";
  import CategoryFilterControl from "$lib/components/transactions/CategoryFilterControl.svelte";
  import DateRangePicker from "$lib/components/transactions/DateRangePicker.svelte";
  import FiltersMenu from "$lib/components/transactions/FiltersMenu.svelte";
  import SummaryCards from "$lib/components/transactions/SummaryCards.svelte";
  import TransactionDataActions from "$lib/components/transactions/TransactionDataActions.svelte";
  import TransactionDetailSheet from "$lib/components/transactions/TransactionDetailSheet.svelte";
  import TransactionDialog from "$lib/components/transactions/TransactionDialog.svelte";
  import TransactionTable from "$lib/components/transactions/TransactionTable.svelte";
  import ConfirmDialog from "$lib/components/ui/ConfirmDialog.svelte";
  import SearchModal from "$lib/components/ui/SearchModal.svelte";
  import * as m from "$lib/paraglide/messages";
  import {
    fetchPrivateCashPosition,
    forecastPosition,
    livePosition,
    runningBalances,
  } from "$lib/services/cash-position";
  import { createCategory, fetchCategories } from "$lib/services/categories";
  import { makeCreateCategoryInline } from "$lib/category-create";
  import { fetchMyGroupRoles, fetchUserGroups } from "$lib/services/groups";
  import { fetchLinkedTransactionIds } from "$lib/services/plan-settlement";
  import { computeLedgerSummary } from "$lib/services/transaction-cashflow";
  import { canManageTransaction } from "$lib/services/transaction-permissions";
  import {
    computeSummary,
    deleteTransaction,
    deleteTransactions,
    fetchTransactionById,
    fetchTransactions,
    updateTransactionsCategory,
    updateTransactionsStatus,
  } from "$lib/services/transactions";
  import { supabase } from "$lib/supabase";
  import { parseScopeFilter } from "$lib/utils/list-view-url";
  import { syncListViewUrl } from "$lib/utils/navigation";
  import type { TransactionStatus, TransactionType, TransactionWithCategory } from "$lib/types";
  import {
    cn,
    formatDate,
    fullMonthOf,
    getDateRangeBounds,
    monthNameLocative,
    monthYearLabel,
  } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { onMount } from "svelte";
  import { Plus, Search, X } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();

  const createCategoryInline = makeCreateCategoryInline({
    createCategory,
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["categories"] }),
    toastSuccess: () => toast.success(m.toast_category_created()),
    toastError: () => toast.error(m.toast_error()),
  });

  const now = new Date();

  function parseIsoDateParam(value: string | null): string | null {
    return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  }

  function dateParts(value: string | null): { year: number; month: number } | null {
    if (!value) return null;
    const [year, month] = value.split("-").map(Number);
    return year && month ? { year, month } : null;
  }

  function addOneDay(value: string): string {
    const d = new Date(`${value}T00:00:00`);
    d.setDate(d.getDate() + 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  const explicitStartDate = $derived(parseIsoDateParam($page.url.searchParams.get("startDate")));
  const explicitEndDate = $derived(parseIsoDateParam($page.url.searchParams.get("endDate")));
  const explicitStartParts = $derived(dateParts(explicitStartDate));
  const explicitEndParts = $derived(dateParts(explicitEndDate));

  const startYear = $derived(
    Number($page.url.searchParams.get("startYear")) || explicitStartParts?.year || now.getFullYear()
  );
  const startMonth = $derived(
    Number($page.url.searchParams.get("startMonth")) ||
      explicitStartParts?.month ||
      now.getMonth() + 1
  );
  const endYear = $derived(
    Number($page.url.searchParams.get("endYear")) || explicitEndParts?.year || startYear
  );
  const endMonth = $derived(
    Number($page.url.searchParams.get("endMonth")) || explicitEndParts?.month || startMonth
  );
  const categoryId = $derived($page.url.searchParams.get("categoryId") ?? undefined);
  const statusFilter = $derived($page.url.searchParams.get("status") ?? undefined);
  const typeFilter = $derived(
    ($page.url.searchParams.get("type") as "income" | "expense" | null) ?? undefined
  );

  const bounds = $derived.by(() => {
    if (explicitStartDate && explicitEndDate) {
      return { start: explicitStartDate, end: addOneDay(explicitEndDate) };
    }
    return getDateRangeBounds(startYear, startMonth, endYear, endMonth);
  });

  const shortMonth = (mo: number) =>
    new Intl.DateTimeFormat("pl-PL", { month: "short" }).format(new Date(2000, mo - 1, 1));
  function compactDay(iso: string, withYear: boolean): string {
    const [y, mo, d] = iso.split("-").map(Number);
    return `${d} ${shortMonth(mo)}${withYear ? ` ${y}` : ""}`;
  }
  function labelForFullMonth(year: number, month: number): string {
    return monthYearLabel(year, month);
  }
  const isDefaultDateFilter = $derived.by(() => {
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    if (explicitStartDate && explicitEndDate) {
      const fm = fullMonthOf(explicitStartDate, explicitEndDate);
      return fm?.year === cy && fm?.month === cm;
    }
    return startYear === cy && startMonth === cm && endYear === cy && endMonth === cm;
  });

  const dateLabel = $derived.by(() => {
    if (explicitStartDate && explicitEndDate) {
      const [sy, sm, sd] = explicitStartDate.split("-").map(Number);
      const [ey, em] = explicitEndDate.split("-").map(Number);
      if (explicitStartDate === explicitEndDate) return compactDay(explicitStartDate, true);
      const fm = fullMonthOf(explicitStartDate, explicitEndDate);
      if (fm) return labelForFullMonth(fm.year, fm.month);
      if (sy === ey && sm === em) return `${sd}–${compactDay(explicitEndDate, true)}`;
      if (sy === ey)
        return `${compactDay(explicitStartDate, false)} – ${compactDay(explicitEndDate, true)}`;
      return `${compactDay(explicitStartDate, true)} – ${compactDay(explicitEndDate, true)}`;
    }
    return startYear === endYear && startMonth === endMonth
      ? labelForFullMonth(startYear, startMonth)
      : `${monthYearLabel(startYear, startMonth)} – ${monthYearLabel(endYear, endMonth)}`;
  });

  const emptyLabel = $derived.by(() => {
    if (explicitStartDate && explicitEndDate) {
      const fm = fullMonthOf(explicitStartDate, explicitEndDate);
      if (fm) return m.transactions_empty_month({ period: monthNameLocative(fm.month) });
      return m.transactions_empty_range({
        from: formatDate(explicitStartDate),
        to: formatDate(explicitEndDate),
      });
    }
    if (startYear === endYear && startMonth === endMonth) {
      return m.transactions_empty_month({ period: monthNameLocative(startMonth) });
    }
    return m.transactions_empty_range({
      from: monthYearLabel(startYear, startMonth),
      to: monthYearLabel(endYear, endMonth),
    });
  });

  const txQuery = createQuery(() => ({
    queryKey: [
      "transactions",
      startYear,
      startMonth,
      endYear,
      endMonth,
      explicitStartDate,
      explicitEndDate,
      categoryId,
    ],
    queryFn: () => fetchTransactions(bounds.start, bounds.end, categoryId),
  }));

  const statusSet = $derived(statusFilter ? new Set(statusFilter.split(",")) : null);

  const groupFilter = $derived(parseScopeFilter($page.url.searchParams));

  // Derived cash position. The strip + per-row running balance read the private
  // pool anchor plus the full paid history since the anchor's as_of_date —
  // independent of the visible month/category filters. `showCashView` (defined
  // after groupsQuery) widens this to solo users whose only scope is "all".
  const isPrivateScope = $derived(groupFilter === "own");
  const CASH_END = "9999-12-31"; // sentinel for fetchTransactions' exclusive .lt() upper bound

  const cashAnchorQuery = createQuery(() => ({
    queryKey: ["cash-position"],
    queryFn: fetchPrivateCashPosition,
  }));

  const anchorStart = $derived(cashAnchorQuery.data?.as_of_date ?? "2000-01-01");

  const paidHistoryQuery = createQuery(() => ({
    queryKey: ["transactions", "cash-history", anchorStart],
    queryFn: () => fetchTransactions(anchorStart, CASH_END),
    enabled: cashAnchorQuery.isSuccess,
  }));

  // Private (non-group) rows only — the pool is a personal balance.
  const privatePaidTxs = $derived(
    (paidHistoryQuery.data ?? [])
      .filter((t) => (t.group_id ?? null) === null)
      .map((t) => ({ id: t.id, type: t.type, amount: t.amount, status: t.status, date: t.date }))
  );

  const cashAnchor = $derived(cashAnchorQuery.data ?? null);
  const cashLive = $derived(livePosition(cashAnchor, privatePaidTxs));
  const cashForecast = $derived(forecastPosition(cashAnchor, privatePaidTxs));

  // Quick-view presets. `view` is a URL param so a preset is shareable and
  // survives reload. "unlinked" (Bez planu) and "inne" are client-side filters
  // layered onto filteredTxs; "all" / "month" just reset the relevant params.
  const viewFilter = $derived($page.url.searchParams.get("view") ?? undefined);

  const linkedIdsQuery = createQuery(() => ({
    queryKey: ["plan-links", "all"],
    queryFn: fetchLinkedTransactionIds,
    enabled: viewFilter === "unlinked",
  }));
  const linkedIds = $derived(linkedIdsQuery.data ?? new Set<string>());

  // filteredTxs: applies BOTH status filter AND group filter so it's the
  // canonical "what the user is looking at" set used by summary,
  // CategoryBreakdown, CSV export, etc.
  const filteredTxs = $derived.by(() => {
    if (!txQuery.data) return undefined;
    return txQuery.data.filter((tx) => {
      const matchStatus = !statusSet || statusSet.has(tx.status);
      const matchType = !typeFilter || tx.type === typeFilter;
      const matchGroup =
        groupFilter === "all" ||
        (groupFilter === "own" ? tx.group_id === null : tx.group_id === groupFilter);
      const matchView =
        viewFilter === "unlinked"
          ? !linkedIds.has(tx.id)
          : viewFilter === "inne"
            ? inneCategoryIds.has(tx.category_id)
            : true;
      return matchStatus && matchType && matchGroup && matchView;
    });
  });

  // visibleTxs adds the search filter on top - search is row-only UI sugar
  // so it deliberately doesn't affect totals.
  let searchQuery = $state("");
  const visibleTxs = $derived(
    filteredTxs?.filter((tx) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        tx.description?.toLowerCase().includes(q) || tx.counterparty?.toLowerCase().includes(q)
      );
    })
  );

  const TX_CHUNK_SIZE = 80;
  let renderedTxCount = $state(TX_CHUNK_SIZE);
  const renderedTxs = $derived((visibleTxs ?? []).slice(0, renderedTxCount));

  $effect(() => {
    void visibleTxs;
    renderedTxCount = TX_CHUNK_SIZE;
  });

  function txSentinel(node: HTMLElement) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          renderedTxCount = Math.min(renderedTxCount + TX_CHUNK_SIZE, visibleTxs?.length ?? 0);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  let currentUserId = $state<string | null>(null);
  onMount(async () => {
    const { data } = await supabase.auth.getSession();
    currentUserId = data.session?.user.id ?? null;
  });

  let selectedIds = $state(new Set<string>());

  const groupRolesQuery = createQuery(() => ({
    queryKey: ["my-group-roles"],
    queryFn: fetchMyGroupRoles,
    enabled: !!currentUserId,
  }));

  function txCanManage(tx: TransactionWithCategory): boolean {
    if (!currentUserId) return false;
    return canManageTransaction(tx, currentUserId, groupRolesQuery.data ?? new Map());
  }

  function manageableSelectedIds(): string[] {
    return Array.from(selectedIds).filter((id) => {
      const tx = filteredTxs?.find((row) => row.id === id);
      return tx ? txCanManage(tx) : false;
    });
  }

  // Common transaction type across the current bulk selection, or null when the
  // selection is empty or mixes income + expense. Inline category creation in the
  // bulk bar is gated on this so we never create an expense category for income
  // rows (or vice versa); mixed selections fall back to pick-only.
  const bulkSelectionType = $derived.by((): TransactionType | null => {
    const types = new Set<TransactionType>();
    for (const id of selectedIds) {
      const tx = txQuery.data?.find((row) => row.id === id);
      if (tx) types.add(tx.type);
    }
    return types.size === 1 ? [...types][0] : null;
  });

  const summaryMode = $derived(statusSet ? ("filtered" as const) : ("ledger" as const));
  const summary = $derived(
    filteredTxs
      ? statusSet
        ? computeSummary(filteredTxs)
        : computeLedgerSummary(filteredTxs)
      : null
  );

  const categoriesQuery = createQuery(() => ({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  }));

  // "Inne" quick-view = the two per-user fallback categories import assigns to
  // uncategorized rows ("Inne wydatki" / "Inne przychody"). Matched by name,
  // mirroring commit_import_session's fallback resolution.
  const inneCategoryIds = $derived(
    new Set(
      (categoriesQuery.data ?? [])
        .filter((c) => c.name === "Inne wydatki" || c.name === "Inne przychody")
        .map((c) => c.id)
    )
  );

  const filterCategories = $derived(
    categoriesQuery.data?.filter((c) => !typeFilter || c.type === typeFilter) ?? []
  );

  const tableEmptyLabel = $derived.by(() => {
    const base = txQuery.data ?? [];
    if (searchQuery && (filteredTxs?.length ?? 0) > 0 && (visibleTxs?.length ?? 0) === 0) {
      return m.transactions_empty_search();
    }
    if ((filteredTxs?.length ?? 0) === 0 && base.length > 0) {
      return m.transactions_empty_filtered();
    }
    return emptyLabel;
  });

  const tableEmptyHint = $derived.by(() => {
    if (searchQuery && (filteredTxs?.length ?? 0) > 0 && (visibleTxs?.length ?? 0) === 0) {
      return m.transactions_empty_search_hint();
    }
    if ((filteredTxs?.length ?? 0) === 0 && (txQuery.data?.length ?? 0) > 0) {
      return m.transactions_empty_filtered_hint();
    }
    return m.transactions_empty_hint();
  });

  const groupsQuery = createQuery(() => ({
    queryKey: ["user_groups"],
    queryFn: fetchUserGroups,
    enabled: !!currentUserId,
  }));

  // Solo users (no groups) never get the own/all tabs and stay in the default
  // "all" scope — yet every row they have is private, so the cash pool applies.
  // Treat that as the cash view; group users keep the strict own-scope gate so a
  // mixed "all" ledger hides the personal pool.
  const soloAllScope = $derived(
    groupFilter === "all" && groupsQuery.isSuccess && (groupsQuery.data?.length ?? 0) === 0
  );
  const showCashView = $derived(isPrivateScope || soloAllScope);

  // Per-row running balance only once an opening anchor exists — otherwise the
  // column would accumulate from 0 while the strip still asks to set a balance.
  const runningBalanceById = $derived(
    showCashView && cashAnchor ? runningBalances(cashAnchor, privatePaidTxs) : undefined
  );

  // Dialog state
  let dialogOpen = $state(false);
  let editTarget = $state<TransactionWithCategory | null>(null);
  let deleteTargetId = $state<string | null>(null);
  let sheetTx = $state<TransactionWithCategory | null>(null);
  let dismissedRequestedTxId = $state<string | null>(null);

  const requestedTxId = $derived($page.url.searchParams.get("txId"));
  const requestedTxFromCurrentPage = $derived.by(() => {
    if (!requestedTxId || !txQuery.data) return null;
    return txQuery.data.find((t) => t.id === requestedTxId) ?? null;
  });
  const requestedTxQuery = createQuery(() => ({
    queryKey: ["transactions", "by-id", requestedTxId],
    queryFn: () => fetchTransactionById(requestedTxId!),
    enabled: !!requestedTxId && !requestedTxFromCurrentPage,
  }));

  $effect(() => {
    if (!requestedTxId) {
      dismissedRequestedTxId = null;
      return;
    }
    if (requestedTxId === dismissedRequestedTxId) return;
    const match = requestedTxFromCurrentPage ?? requestedTxQuery.data;
    if (match && sheetTx?.id !== match.id) sheetTx = match;
  });
  let bulkDeleteConfirm = $state(false);
  let searchModalOpen = $state(false);
  let stickyFiltersRef = $state<HTMLDivElement | null>(null);
  let stickyFiltersHeight = $state(0);

  function closeSearch() {
    searchModalOpen = false;
    searchQuery = "";
  }

  function toggleSearch() {
    if (searchModalOpen) closeSearch();
    else searchModalOpen = true;
  }

  $effect(() => {
    const el = stickyFiltersRef;
    if (!el) {
      stickyFiltersHeight = 0;
      return;
    }

    const observer = new ResizeObserver(() => {
      stickyFiltersHeight = el.offsetHeight;
    });
    stickyFiltersHeight = el.offsetHeight;
    observer.observe(el);
    return () => observer.disconnect();
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      searchModalOpen = true;
    }
  }

  const deleteMutation = createMutation(() => ({
    mutationFn: () => deleteTransaction(deleteTargetId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_transaction_deleted());
      deleteTargetId = null;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const bulkDeleteMutation = createMutation(() => ({
    mutationFn: () => deleteTransactions(manageableSelectedIds()),
    onSuccess: async () => {
      const count = selectedIds.size;
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_transactions_bulk_deleted({ count }));
      selectedIds = new Set<string>();
      bulkDeleteConfirm = false;
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const bulkStatusMutation = createMutation(() => ({
    mutationFn: (status: TransactionStatus) =>
      updateTransactionsStatus(manageableSelectedIds(), status),
    onSuccess: async () => {
      const count = selectedIds.size;
      await invalidateAfterSettle();
      toast.success(m.toast_transactions_bulk_status({ count }));
      selectedIds = new Set<string>();
    },
    onError: () => toast.error(m.toast_error()),
  }));

  // Settling can flip a plan-linked transaction to paid, so plan progress must refresh too.
  async function invalidateAfterSettle() {
    await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
    await queryClient.invalidateQueries({ queryKey: ["plan-progress-list"] });
  }

  const settleMutation = createMutation(() => ({
    mutationFn: (vars: { id: string; prev: TransactionStatus }) =>
      updateTransactionsStatus([vars.id], "paid"),
    onSuccess: async (_data, vars) => {
      await invalidateAfterSettle();
      toast.success(m.toast_transaction_settled(), {
        action: {
          label: m.toast_transaction_settle_undo(),
          onClick: () => {
            void updateTransactionsStatus([vars.id], vars.prev).then(() => invalidateAfterSettle());
          },
        },
      });
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function quickSettle(tx: TransactionWithCategory) {
    settleMutation.mutate({ id: tx.id, prev: tx.status });
  }

  const bulkCategoryMutation = createMutation(() => ({
    mutationFn: (catId: string) => updateTransactionsCategory(manageableSelectedIds(), catId),
    onSuccess: async () => {
      const count = selectedIds.size;
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      toast.success(m.toast_transactions_bulk_category({ count }));
      selectedIds = new Set<string>();
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const bulkPending = $derived(
    bulkDeleteMutation.isPending || bulkStatusMutation.isPending || bulkCategoryMutation.isPending
  );

  function onApplyDateRange(start: string, end: string) {
    const p = new URLSearchParams($page.url.searchParams);
    p.set("startDate", start);
    p.set("endDate", end);
    p.delete("startYear");
    p.delete("startMonth");
    p.delete("endYear");
    p.delete("endMonth");
    goto(`/transactions?${p.toString()}`, { replaceState: false });
  }

  function onClearDateFilter() {
    const p = new URLSearchParams($page.url.searchParams);
    p.delete("startDate");
    p.delete("endDate");
    p.delete("startYear");
    p.delete("startMonth");
    p.delete("endYear");
    p.delete("endMonth");
    goto(`/transactions?${p.toString()}`, { replaceState: false });
  }

  function onTypeChange(type: "income" | "expense" | undefined) {
    const p = new URLSearchParams($page.url.searchParams);
    if (type) p.set("type", type);
    else p.delete("type");
    goto(`/transactions?${p.toString()}`, { replaceState: false });
  }

  function onStatusChange(status: string | undefined) {
    const p = new URLSearchParams($page.url.searchParams);
    if (status) p.set("status", status);
    else p.delete("status");
    goto(`/transactions?${p.toString()}`, { replaceState: false });
  }

  function onClearFilters() {
    const p = new URLSearchParams($page.url.searchParams);
    p.delete("type");
    p.delete("status");
    goto(`/transactions?${p.toString()}`, { replaceState: false });
  }

  // Quick-view preset actions. Each mutates the shared URL filter state; no
  // parallel filtering pipeline.
  function setViewPreset(view: "unlinked" | "inne" | undefined) {
    const p = new URLSearchParams($page.url.searchParams);
    if (view && viewFilter !== view) p.set("view", view);
    else p.delete("view"); // toggle off when re-tapping the active preset
    goto(`/transactions?${p.toString()}`, { replaceState: false });
  }

  function applyAllPreset() {
    const p = new URLSearchParams($page.url.searchParams);
    p.delete("type");
    p.delete("status");
    p.delete("categoryId");
    p.delete("view");
    searchQuery = "";
    goto(`/transactions?${p.toString()}`, { replaceState: false });
  }

  function applyMonthPreset() {
    const p = new URLSearchParams($page.url.searchParams);
    const cy = now.getFullYear();
    const cm = now.getMonth() + 1;
    p.set("startYear", String(cy));
    p.set("startMonth", String(cm));
    p.set("endYear", String(cy));
    p.set("endMonth", String(cm));
    p.delete("startDate");
    p.delete("endDate");
    goto(`/transactions?${p.toString()}`, { replaceState: false });
  }

  // A preset chip is "active" when its slice of the URL state currently holds.
  const isAllPresetActive = $derived(!viewFilter && !typeFilter && !statusFilter && !categoryId);

  const statusLabels: Record<string, string> = {
    paid: m.transactions_status_paid(),
    upcoming: m.transactions_status_upcoming(),
    draft: m.transactions_status_draft(),
    overdue: m.transactions_status_overdue(),
  };

  // Applied filters shown as removable chips below the toolbar (only when set).
  const activeFilters = $derived.by(() => {
    const chips: { key: string; label: string; clear: () => void }[] = [];
    if (typeFilter) {
      chips.push({
        key: "type",
        label: typeFilter === "income" ? m.common_income() : m.common_expense(),
        clear: () => onTypeChange(undefined),
      });
    }
    if (statusFilter) {
      chips.push({
        key: "status",
        label: statusLabels[statusFilter] ?? statusFilter,
        clear: () => onStatusChange(undefined),
      });
    }
    return chips;
  });

  function openAdd() {
    editTarget = null;
    dialogOpen = true;
  }

  function onCategoryChange(id: string | undefined) {
    const params = new URLSearchParams($page.url.searchParams);
    if (id) params.set("categoryId", id);
    else params.delete("categoryId");
    goto(`/transactions?${params.toString()}`, { replaceState: false });
  }

  function closeTransactionSheet() {
    if (requestedTxId) {
      dismissedRequestedTxId = requestedTxId;
      const params = new URLSearchParams($page.url.searchParams);
      params.delete("txId");
      const query = params.toString();
      void goto(query ? `/transactions?${query}` : "/transactions", {
        replaceState: true,
        noScroll: true,
        keepFocus: true,
      });
    }
    sheetTx = null;
  }

  // CSV helpers
  function csvEscape(val: string): string {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) {
      return '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }

  function handleExport() {
    if (!filteredTxs?.length) return;
    const headers = [
      "date",
      "description",
      "amount",
      "type",
      "status",
      "category",
      "is_recurring",
      "recurring_day",
    ];
    const rows = filteredTxs.map((tx) =>
      [
        tx.date,
        tx.description,
        tx.amount.toString(),
        tx.type,
        tx.status,
        tx.category_name,
        tx.is_recurring ? "true" : "false",
        tx.recurring_day?.toString() ?? "",
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfelik-transakcje-${new Date().toISOString().slice(0, 7)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<svelte:head>
  <title>{m.transactions_title()} · Portfelik</title>
</svelte:head>

<svelte:window onkeydown={onWindowKeydown} />

<div class="container mx-auto max-w-4xl space-y-4 px-4 py-6">
  <div class="flex flex-wrap items-center justify-between gap-3">
    <div>
      <h1 class="text-hero font-semibold text-slate-100">{m.transactions_title()}</h1>
      {#if groupsQuery.data}
        <p class="mt-0.5 hidden text-xs text-slate-400 md:block">
          {groupsQuery.data.length > 0
            ? m.transactions_subtitle_groups()
            : m.transactions_subtitle_own()}
        </p>
      {/if}
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <button
        onclick={openAdd}
        class="focus-visible:ring-accent hidden h-9 items-center gap-1.5 rounded-full border border-white/10 px-3.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none md:inline-flex"
        title={m.transaction_manual_add_hint()}
      >
        + {m.transaction_manual_add()}
      </button>
      <TransactionDataActions exportDisabled={!filteredTxs?.length} onexport={handleExport} />
    </div>
  </div>

  <!-- Sticky filter bar: date + category visible, type/status behind Inne filtry -->
  {#if categoriesQuery.data && selectedIds.size === 0}
    <div
      bind:this={stickyFiltersRef}
      class="sticky top-14 z-30 -mx-4 border-b border-white/5 bg-slate-950"
    >
      <div class="flex items-center gap-2 overflow-x-auto px-4 py-2 sm:overflow-x-visible">
        <button
          type="button"
          onclick={toggleSearch}
          class="focus-visible:ring-accent relative hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none md:flex {searchModalOpen
            ? 'border-accent/40 bg-accent/15 text-accent'
            : 'border-white/10 bg-slate-900/60 text-slate-300 hover:bg-white/5'}"
          aria-label={searchModalOpen
            ? m.transactions_search_close()
            : m.transactions_search_open()}
          aria-pressed={searchModalOpen}
        >
          <Search size={15} strokeWidth={1.8} aria-hidden="true" />
          {#if searchQuery}
            <span class="bg-accent-gradient absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
            ></span>
          {/if}
        </button>
        <DateRangePicker
          label={dateLabel}
          startDate={explicitStartDate}
          endDate={explicitEndDate}
          onchange={onApplyDateRange}
          clearable={!isDefaultDateFilter}
          onclear={onClearDateFilter}
        />
        <CategoryFilterControl
          categories={filterCategories}
          selectedId={categoryId}
          onchange={onCategoryChange}
        />
        <FiltersMenu
          type={typeFilter}
          status={statusFilter}
          ontypechange={onTypeChange}
          onstatuschange={onStatusChange}
          onclear={onClearFilters}
        />
      </div>
      <div
        class="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-slate-950 to-transparent sm:hidden"
        aria-hidden="true"
      ></div>
    </div>
  {/if}

  {#if activeFilters.length > 0}
    <div class="flex flex-wrap gap-2">
      {#each activeFilters as f (f.key)}
        <span
          class="border-accent/30 bg-accent/10 text-accent flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 text-xs font-medium"
        >
          {f.label}
          <button
            type="button"
            onclick={f.clear}
            class="text-accent/80 hover:bg-accent/20 hover:text-accent rounded-full p-0.5 transition-colors"
            aria-label={m.transactions_filter_clear()}
          >
            <X size={12} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      {/each}
    </div>
  {/if}

  {#if groupsQuery.data && groupsQuery.data.length > 0}
    <div role="tablist" aria-label="Grupa" class="flex flex-wrap gap-1">
      <button
        type="button"
        role="tab"
        aria-selected={groupFilter === "own"}
        onclick={() => syncListViewUrl("/transactions", $page.url.searchParams, { group: "own" })}
        class={cn(
          "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          groupFilter === "own"
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
            : "border border-white/5 text-slate-300 hover:bg-white/5"
        )}
      >
        {m.group_filter_own()}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={groupFilter === "all"}
        onclick={() => syncListViewUrl("/transactions", $page.url.searchParams, { group: "all" })}
        class={cn(
          "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          groupFilter === "all"
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
            : "border border-white/5 text-slate-300 hover:bg-white/5"
        )}
      >
        {m.group_filter_all()}
      </button>
      {#each groupsQuery.data as g (g.id)}
        <button
          type="button"
          role="tab"
          aria-selected={groupFilter === g.id}
          onclick={() => syncListViewUrl("/transactions", $page.url.searchParams, { group: g.id })}
          class={cn(
            "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
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

  <div class="flex flex-wrap gap-2" role="group" aria-label={m.transactions_view_all()}>
    {#each [{ key: "all", label: m.transactions_view_all(), active: isAllPresetActive, run: applyAllPreset }, { key: "unlinked", label: m.transactions_view_unlinked(), active: viewFilter === "unlinked", run: () => setViewPreset("unlinked") }, { key: "inne", label: m.transactions_view_inne(), active: viewFilter === "inne", run: () => setViewPreset("inne") }, { key: "month", label: m.transactions_view_month(), active: isDefaultDateFilter, run: applyMonthPreset }] as preset (preset.key)}
      <button
        type="button"
        aria-pressed={preset.active}
        onclick={preset.run}
        class={cn(
          "focus-visible:ring-accent rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
          preset.active
            ? "bg-accent-gradient text-slate-900 shadow-[0_0_18px_var(--color-accent-glow)]"
            : "border border-white/5 text-slate-300 hover:bg-white/5"
        )}
      >
        {preset.label}
      </button>
    {/each}
  </div>

  {#if showCashView}
    <CashPositionStrip live={cashLive} forecast={cashForecast} hasAnchor={!!cashAnchorQuery.data} />
  {/if}

  {#if summary}
    <SummaryCards
      {summary}
      mode={summaryMode}
      activeType={typeFilter}
      ontypeclick={(type) => onTypeChange(typeFilter === type ? undefined : type)}
    />
  {:else if txQuery.isLoading}
    <div class="grid grid-cols-3 gap-3">
      {#each [0, 1, 2] as _, i (i)}
        <div
          class="h-20 animate-pulse rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800"
        ></div>
      {/each}
    </div>
  {/if}

  {#if summary && summary.total_expenses > 0}
    <CategoryBreakdown categories={summary.categories} oncategoryclick={onCategoryChange} />
  {/if}

  {#if selectedIds.size > 0 && categoriesQuery.data}
    <BulkActionsBar
      count={selectedIds.size}
      categories={categoriesQuery.data}
      pending={bulkPending}
      onclear={() => (selectedIds = new Set<string>())}
      onsetstatus={(status) => bulkStatusMutation.mutate(status)}
      onsetcategory={(catId) => bulkCategoryMutation.mutate(catId)}
      oncreatecategory={createCategoryInline}
      createType={bulkSelectionType}
      ondelete={() => (bulkDeleteConfirm = true)}
    />
  {/if}

  {#if txQuery.isLoading}
    <div class="h-48 animate-pulse rounded-2xl border border-white/5 bg-slate-900/60"></div>
  {:else if txQuery.isError}
    <p class="text-sm text-rose-300">{m.common_error_title()}</p>
  {:else if visibleTxs}
    <TransactionTable
      transactions={renderedTxs}
      {currentUserId}
      {runningBalanceById}
      canManage={txCanManage}
      emptyLabel={tableEmptyLabel}
      emptyHint={tableEmptyHint}
      bind:selectedIds
      stickyHeaderTop={`calc(3.5rem + ${stickyFiltersHeight}px)`}
      onrowclick={(tx) => (sheetTx = tx)}
      onsettle={quickSettle}
      ondelete={(id: string) => (deleteTargetId = id)}
    />
    {#if renderedTxCount < visibleTxs.length}
      <div use:txSentinel class="h-px" aria-hidden="true"></div>
    {/if}
  {/if}
</div>

<button
  onclick={openAdd}
  aria-label={m.transaction_manual_add()}
  title={m.transaction_manual_add_hint()}
  class="mobile-floating-action bg-accent-gradient fixed right-4 bottom-(--mobile-action-bottom) z-40 flex h-14 w-14 items-center justify-center rounded-full text-slate-900 shadow-[0_0_24px_var(--color-accent-glow)] transition-all active:scale-95 md:hidden"
>
  <Plus size={24} strokeWidth={2.3} aria-hidden="true" />
</button>

<button
  onclick={toggleSearch}
  aria-label={searchModalOpen ? m.transactions_search_close() : m.transactions_search_open()}
  aria-pressed={searchModalOpen}
  class="mobile-floating-action fixed bottom-(--mobile-action-bottom) left-4 z-40 flex h-14 w-14 items-center justify-center rounded-full border shadow-[0_0_24px_rgba(15,23,42,0.55)] transition-all active:scale-95 md:hidden {searchModalOpen
    ? 'border-accent/40 bg-accent/20 text-accent'
    : 'border-white/10 bg-slate-900/90 text-slate-100'}"
>
  <Search size={23} strokeWidth={2.1} aria-hidden="true" />
  {#if searchQuery}
    <span class="bg-accent-gradient absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full"></span>
  {/if}
</button>

<SearchModal
  open={searchModalOpen}
  onclose={closeSearch}
  value={searchQuery}
  onsearchchange={(q) => (searchQuery = q)}
>
  <TransactionTable
    layout="cards"
    transactions={visibleTxs ?? []}
    {currentUserId}
    emptyLabel={tableEmptyLabel}
    emptyHint={tableEmptyHint}
    onrowclick={(tx) => {
      closeSearch();
      sheetTx = tx;
    }}
  />
</SearchModal>

<TransactionDialog open={dialogOpen} onclose={() => (dialogOpen = false)} initial={editTarget} />

<TransactionDetailSheet
  transaction={sheetTx}
  {currentUserId}
  groupRoles={groupRolesQuery.data ?? new Map()}
  onclose={closeTransactionSheet}
  onedit={sheetTx && txCanManage(sheetTx)
    ? (tx) => {
        sheetTx = null;
        editTarget = tx;
        dialogOpen = true;
      }
    : undefined}
  ondelete={sheetTx && txCanManage(sheetTx)
    ? (id) => {
        sheetTx = null;
        deleteTargetId = id;
      }
    : undefined}
/>

<ConfirmDialog
  open={!!deleteTargetId}
  message={m.common_confirm_delete_description()}
  onconfirm={() => deleteMutation.mutate()}
  onclose={() => (deleteTargetId = null)}
  pending={deleteMutation.isPending}
/>

<ConfirmDialog
  open={bulkDeleteConfirm}
  message={m.transactions_delete_selected({ count: selectedIds.size })}
  onconfirm={() => bulkDeleteMutation.mutate()}
  onclose={() => (bulkDeleteConfirm = false)}
  pending={bulkDeleteMutation.isPending}
/>
