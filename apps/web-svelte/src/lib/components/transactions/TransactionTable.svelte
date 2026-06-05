<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import type { TransactionWithCategory } from "$lib/types";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { ArrowDown, ArrowUp, ArrowUpDown, Check, Users, Wallet } from "lucide-svelte";
  import EmptyState from "$lib/components/ui/EmptyState.svelte";

  interface Props {
    transactions: TransactionWithCategory[];
    currentUserId?: string | null;
    ondelete?: (id: string) => void;
    onrowclick?: (tx: TransactionWithCategory) => void;
    emptyLabel?: string;
    emptyHint?: string;
    selectedIds?: Set<string>;
    /** When set, the header row sticks at this CSS top offset (e.g. "top-[6.75rem]").
        Omitted inside the search palette so the header never floats over rows. */
    stickyHeaderOffset?: string;
    /** Optional inline CSS top value (e.g. "calc(3.5rem + 48px)") for sticky header. */
    stickyHeaderTop?: string;
  }
  let {
    transactions,
    ondelete,
    onrowclick,
    emptyLabel,
    emptyHint,
    selectedIds = $bindable(new Set<string>()),
    stickyHeaderOffset,
    stickyHeaderTop,
  }: Props = $props();

  type SortKey = "date" | "description" | "category" | "status" | "amount";
  type SortDirection = "asc" | "desc";

  let sortKey = $state<SortKey>("date");
  let sortDirection = $state<SortDirection>("desc");

  const isShared = (tx: TransactionWithCategory) => tx.group_id !== null;

  $effect(() => {
    void transactions;
    selectedIds = new Set<string>();
  });

  function toggleAll() {
    if (allSelected) {
      selectedIds = new Set<string>();
    } else {
      selectedIds = new Set(sortedTransactions.map((tx) => tx.id));
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
  }

  const statusLabel: Record<string, string> = {
    paid: m.transactions_status_paid(),
    draft: m.transactions_status_draft(),
    upcoming: m.transactions_status_upcoming(),
    overdue: m.transactions_status_overdue(),
  };

  const statusClass: Record<string, string> = {
    paid: "border border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
    draft: "border border-white/10 bg-slate-800/60 text-slate-400",
    upcoming: "border border-sky-400/20 bg-sky-400/10 text-sky-300",
    overdue: "border border-rose-400/20 bg-rose-400/10 text-rose-300",
  };

  function localYmd(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function dayKey(iso: string): string {
    // Local-day grouping so a tx at 23:30 Warsaw doesn't bleed into the
    // next UTC day's bucket.
    return localYmd(new Date(iso));
  }
  function dayLabel(key: string): string {
    const today = localYmd(new Date());
    if (key === today) return "Dziś";
    const y = new Date();
    y.setDate(y.getDate() - 1);
    if (key === localYmd(y)) return "Wczoraj";
    return formatDate(key);
  }

  function signedAmount(tx: TransactionWithCategory): number {
    return tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);
  }

  function compareBySortKey(a: TransactionWithCategory, b: TransactionWithCategory): number {
    switch (sortKey) {
      case "date":
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      case "description":
        return a.description.localeCompare(b.description, "pl", { sensitivity: "base" });
      case "category":
        return a.category_name.localeCompare(b.category_name, "pl", { sensitivity: "base" });
      case "status":
        return (statusLabel[a.status] ?? a.status).localeCompare(
          statusLabel[b.status] ?? b.status,
          "pl",
          {
            sensitivity: "base",
          }
        );
      case "amount":
        return signedAmount(a) - signedAmount(b);
    }
  }

  const sortedTransactions = $derived.by(() =>
    transactions
      .map((tx, index) => ({ tx, index }))
      .sort((a, b) => {
        const compared = compareBySortKey(a.tx, b.tx);
        const directed = sortDirection === "asc" ? compared : -compared;
        return directed || a.index - b.index;
      })
      .map(({ tx }) => tx)
  );

  const allSelected = $derived(
    sortedTransactions.length > 0 && sortedTransactions.every((tx) => selectedIds.has(tx.id))
  );
  const someSelected = $derived(sortedTransactions.some((tx) => selectedIds.has(tx.id)));

  function toggleSort(nextKey: SortKey): void {
    if (sortKey === nextKey) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
      return;
    }
    sortKey = nextKey;
    sortDirection = nextKey === "date" ? "desc" : "asc";
  }

  function ariaSort(key: SortKey): "ascending" | "descending" | "none" {
    if (sortKey !== key) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }

  function sortLabel(key: SortKey, column: string): string {
    const nextDirection =
      sortKey === key
        ? sortDirection === "asc"
          ? "desc"
          : "asc"
        : key === "date"
          ? "desc"
          : "asc";
    return m.transactions_sort_by({
      column,
      direction:
        nextDirection === "desc"
          ? m.transactions_sort_direction_desc()
          : m.transactions_sort_direction_asc(),
    });
  }

  const dayGroups = $derived.by(() => {
    const groups = new Map<string, TransactionWithCategory[]>();
    for (const tx of sortedTransactions) {
      const k = dayKey(tx.date);
      const arr = groups.get(k) ?? [];
      arr.push(tx);
      groups.set(k, arr);
    }
    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      label: dayLabel(key),
      items,
    }));
  });
</script>

{#snippet sortIndicator(key: SortKey)}
  {#if sortKey !== key}
    <ArrowUpDown size={12} strokeWidth={1.8} />
  {:else if sortDirection === "asc"}
    <ArrowUp size={12} strokeWidth={1.8} />
  {:else}
    <ArrowDown size={12} strokeWidth={1.8} />
  {/if}
{/snippet}

{#if transactions.length === 0}
  <EmptyState
    title={emptyLabel ?? m.transactions_empty()}
    body={emptyHint ?? m.transactions_empty_hint()}
  >
    {#snippet icon()}
      <Wallet size={28} strokeWidth={1.4} />
    {/snippet}
  </EmptyState>
{:else}
  <!-- Mobile card list -->
  <div class="space-y-3 sm:hidden" aria-label={m.transactions_title()}>
    {#each dayGroups as group (group.key)}
      <section class="space-y-1.5">
        <h3 class="text-eyebrow px-1 py-1 text-slate-400">{group.label}</h3>
        <ul class="space-y-1.5">
          {#each group.items as tx (tx.id)}
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            <li
              class="rounded-2xl border border-white/5 bg-slate-900/60 px-4 py-3 backdrop-blur transition-colors hover:bg-white/5"
              class:cursor-pointer={!!onrowclick}
              class:ring-2={selectedIds.has(tx.id)}
              class:ring-slate-400={selectedIds.has(tx.id)}
              role={onrowclick && !ondelete ? "button" : undefined}
              tabindex={onrowclick ? 0 : undefined}
              onclick={() => onrowclick?.(tx)}
              onkeydown={(e) => {
                if (e.key === "Enter" || e.key === " ") onrowclick?.(tx);
              }}
            >
              <div class="flex items-start justify-between gap-3">
                {#if ondelete}
                  <button
                    type="button"
                    onclick={(e) => {
                      e.stopPropagation();
                      toggleOne(tx.id);
                    }}
                    class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors {selectedIds.has(
                      tx.id
                    )
                      ? 'bg-accent-gradient border-transparent'
                      : 'border-white/15 hover:border-white/30'}"
                    aria-label={m.transactions_select_all()}
                  >
                    {#if selectedIds.has(tx.id)}
                      <Check size={11} strokeWidth={2.5} class="text-slate-900" />
                    {/if}
                  </button>
                {/if}
                <span
                  class="min-w-0 flex-1 truncate text-sm leading-snug font-medium text-slate-100"
                >
                  {tx.description}
                  {#if tx.is_recurring}
                    <span class="ml-1 text-xs text-slate-400" aria-label="cykliczna">↻</span>
                  {/if}
                  {#if isShared(tx)}
                    <span
                      class="border-accent/20 bg-accent/10 text-accent ml-1 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px]"
                    >
                      <Users size={9} />
                    </span>
                  {/if}
                </span>
                <span
                  class={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    tx.type === "income" ? "text-emerald-300" : "text-rose-300"
                  )}
                >
                  {tx.type === "income" ? "+" : "−"}{formatCurrency(tx.amount, tx.currency)}
                </span>
              </div>
              <div class="mt-1.5 flex flex-wrap items-center gap-2">
                <span class="text-xs text-slate-400">{tx.category_name}</span>
                <span
                  class={cn(
                    "ml-auto inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    statusClass[tx.status] ??
                      "border border-white/10 bg-slate-800/60 text-slate-400"
                  )}
                >
                  {statusLabel[tx.status] ?? tx.status}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>

  <!-- Desktop table -->
  <div class="hidden rounded-2xl border border-white/5 bg-slate-900/60 backdrop-blur sm:block">
    <table class="w-full text-sm">
      <thead
        class={cn(
          (stickyHeaderOffset || stickyHeaderTop) &&
            `sticky z-20 bg-slate-900 ${stickyHeaderOffset ?? ""}`
        )}
        style={stickyHeaderTop ? `top: ${stickyHeaderTop}` : undefined}
      >
        <tr class="border-b border-white/5 bg-white/5">
          {#if ondelete}
            <th scope="col" class="w-10 py-3 pl-4">
              <button
                type="button"
                onclick={toggleAll}
                class="flex h-4 w-4 items-center justify-center rounded border border-white/15 transition-colors {allSelected
                  ? 'bg-accent-gradient border-transparent'
                  : someSelected
                    ? 'border-slate-900 bg-slate-400 dark:border-slate-400 dark:bg-slate-500'
                    : 'border-white/15 hover:border-white/30'}"
                aria-label={allSelected
                  ? m.transactions_deselect_all()
                  : m.transactions_select_all()}
              >
                {#if allSelected}
                  <Check size={11} strokeWidth={2.5} class="text-slate-900" />
                {:else if someSelected}
                  <Check size={11} strokeWidth={2.5} class="text-slate-900" />
                {/if}
              </button>
            </th>
          {/if}
          <th scope="col" aria-sort={ariaSort("date")} class="px-4 py-3 text-left">
            <button
              type="button"
              class="text-eyebrow focus-visible:ring-accent inline-flex items-center gap-1.5 text-slate-400 transition-colors hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
              aria-label={sortLabel("date", m.transactions_col_date())}
              onclick={() => toggleSort("date")}
            >
              {m.transactions_col_date()}
              {@render sortIndicator("date")}
            </button>
          </th>
          <th scope="col" aria-sort={ariaSort("description")} class="px-4 py-3 text-left">
            <button
              type="button"
              class="text-eyebrow focus-visible:ring-accent inline-flex items-center gap-1.5 text-slate-400 transition-colors hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
              aria-label={sortLabel("description", m.transactions_col_description())}
              onclick={() => toggleSort("description")}
            >
              {m.transactions_col_description()}
              {@render sortIndicator("description")}
            </button>
          </th>
          <th scope="col" aria-sort={ariaSort("category")} class="px-4 py-3 text-left">
            <button
              type="button"
              class="text-eyebrow focus-visible:ring-accent inline-flex items-center gap-1.5 text-slate-400 transition-colors hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
              aria-label={sortLabel("category", m.transactions_col_category())}
              onclick={() => toggleSort("category")}
            >
              {m.transactions_col_category()}
              {@render sortIndicator("category")}
            </button>
          </th>
          <th scope="col" aria-sort={ariaSort("status")} class="px-4 py-3 text-left">
            <button
              type="button"
              class="text-eyebrow focus-visible:ring-accent inline-flex items-center gap-1.5 text-slate-400 transition-colors hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
              aria-label={sortLabel("status", m.transactions_col_status())}
              onclick={() => toggleSort("status")}
            >
              {m.transactions_col_status()}
              {@render sortIndicator("status")}
            </button>
          </th>
          <th scope="col" aria-sort={ariaSort("amount")} class="px-4 py-3 text-right">
            <button
              type="button"
              class="text-eyebrow focus-visible:ring-accent ml-auto inline-flex items-center gap-1.5 text-slate-400 transition-colors hover:text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
              aria-label={sortLabel("amount", m.transactions_col_amount())}
              onclick={() => toggleSort("amount")}
            >
              {m.transactions_col_amount()}
              {@render sortIndicator("amount")}
            </button>
          </th>
        </tr>
      </thead>
      <tbody>
        {#each sortedTransactions as tx (tx.id)}
          <tr
            class={cn(
              "border-b border-white/5 transition-colors last:border-0 hover:bg-white/5",
              !!onrowclick && "cursor-pointer",
              selectedIds.has(tx.id) && "bg-white/5"
            )}
            role={onrowclick && !ondelete ? "button" : undefined}
            tabindex={onrowclick ? 0 : undefined}
            onclick={() => onrowclick?.(tx)}
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ") onrowclick?.(tx);
            }}
          >
            {#if ondelete}
              <td class="w-10 py-3 pl-4">
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    toggleOne(tx.id);
                  }}
                  class="flex h-4 w-4 items-center justify-center rounded border transition-colors {selectedIds.has(
                    tx.id
                  )
                    ? 'bg-accent-gradient border-transparent'
                    : 'border-white/15 hover:border-white/30'}"
                  aria-label={m.transactions_select_all()}
                >
                  {#if selectedIds.has(tx.id)}
                    <Check size={11} strokeWidth={2.5} class="text-slate-900" />
                  {/if}
                </button>
              </td>
            {/if}
            <td class="px-4 py-3 whitespace-nowrap text-slate-400">{formatDate(tx.date)}</td>
            <td class="max-w-xs truncate px-4 py-3 text-slate-100">
              {tx.description}
              {#if tx.is_recurring}
                <span class="ml-1 text-xs text-slate-400" aria-label="cykliczna">↻</span>
              {/if}
              {#if isShared(tx)}
                <span
                  class="border-accent/20 bg-accent/10 text-accent ml-1 inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px]"
                >
                  <Users size={10} />
                </span>
              {/if}
            </td>
            <td class="px-4 py-3 text-slate-400">{tx.category_name}</td>
            <td class="px-4 py-3">
              <span
                class={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  statusClass[tx.status] ?? "border border-white/10 bg-slate-800/60 text-slate-400"
                )}
              >
                {statusLabel[tx.status] ?? tx.status}
              </span>
            </td>
            <td
              class={cn(
                "px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums",
                tx.type === "income" ? "text-emerald-300" : "text-rose-300"
              )}
            >
              {tx.type === "income" ? "+" : "−"}{formatCurrency(tx.amount, tx.currency)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}
