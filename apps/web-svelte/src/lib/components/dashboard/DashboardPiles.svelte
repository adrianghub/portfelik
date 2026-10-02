<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { requireSessionUserId, session } from "$lib/auth/session.svelte";
  import { addLocalDays, productDateIso } from "$lib/date-local";
  import { qk } from "$lib/query-keys";
  import { parseMoneyInput } from "$lib/money-input";
  import { fetchCategories, updateCategory } from "$lib/services/categories";
  import { normalizeCapAmount, pileWindow, spentInPile } from "$lib/services/pile-progress";
  import { fetchTransactions } from "$lib/services/transactions";
  import { toastError } from "$lib/toast-error";
  import type { CategoryCapPeriod, UserGroup } from "$lib/types";
  import { formatCurrency, formatDate } from "$lib/utils";
  import type { ScopeFilter } from "$lib/utils/list-view-url";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import { toast } from "svelte-sonner";
  import * as m from "$lib/paraglide/messages";

  interface Props {
    groupFilter: ScopeFilter;
    groups?: Pick<UserGroup, "id" | "name">[];
  }
  let { groupFilter, groups = [] }: Props = $props();

  const today = productDateIso(new Date());
  const queryClient = useQueryClient();

  const categoriesQuery = createQuery(() => ({
    queryKey: qk.categories(session.userId!),
    queryFn: fetchCategories,
    enabled: () => !!session.userId,
  }));

  const expenseCategories = $derived(
    (categoriesQuery.data ?? []).filter(
      (category) => category.type === "expense" && !category.archived_at
    )
  );

  const piles = $derived(
    expenseCategories.filter(
      (category) =>
        category.cap_amount != null &&
        category.cap_amount > 0 &&
        (category.cap_period === "month" || category.cap_period === "year")
    )
  );

  const window = $derived.by(() => {
    if (piles.length === 0) return null;
    let start = "9999-12-31";
    let end = "0000-01-01";
    for (const pile of piles) {
      const span = pileWindow(pile.cap_period!, today);
      if (span.start < start) start = span.start;
      if (span.end > end) end = span.end;
    }
    return { start, end };
  });

  const txQuery = createQuery(() => ({
    queryKey: qk.transactions.list(
      session.userId!,
      "piles",
      groupFilter,
      window?.start ?? "",
      window?.end ?? ""
    ),
    queryFn: () => fetchTransactions(window!.start, window!.end),
    enabled: !!session.userId && !!window,
  }));

  const rows = $derived(
    txQuery.isSuccess
      ? piles.map((pile) => {
          const spent = spentInPile(txQuery.data, pile.id, pile.cap_period!, today, groupFilter);
          const cap = pile.cap_amount!;
          const pct = Math.min(100, Math.round((spent / cap) * 100));
          const left = Math.max(0, cap - spent);
          const exceeded = Math.max(0, spent - cap);
          // Query windows end exclusively; the displayed deadline is inclusive.
          const periodEnd = addLocalDays(pileWindow(pile.cap_period!, today).end, -1);
          return { pile, spent, cap, pct, over: spent > cap, left, exceeded, periodEnd };
        })
      : []
  );

  const scopeLabel = $derived(
    groupFilter === "own"
      ? m.cap_scope_private()
      : groupFilter === "all"
        ? m.cap_scope_combined()
        : (groups.find((group) => group.id === groupFilter)?.name ?? m.group_badge_shared())
  );

  let limitOpen = $state(false);
  let limitCategoryId = $state("");
  let limitAmount = $state("");
  let limitPeriod = $state<CategoryCapPeriod>("month");
  let initialLimitCategoryId = $state("");
  let initialLimitAmount = $state("");
  let initialLimitPeriod = $state<CategoryCapPeriod>("month");
  const limitValid = $derived(limitAmount === "" || parseMoneyInput(limitAmount) !== null);
  const limitDirty = $derived(
    limitCategoryId !== initialLimitCategoryId ||
      limitAmount !== initialLimitAmount ||
      limitPeriod !== initialLimitPeriod
  );

  function openLimit(categoryId?: string) {
    const category =
      expenseCategories.find((item) => item.id === categoryId) ?? expenseCategories[0];
    limitCategoryId = category?.id ?? "";
    limitAmount = category?.cap_amount != null ? String(category.cap_amount) : "";
    limitPeriod = category?.cap_period === "year" ? "year" : "month";
    initialLimitCategoryId = limitCategoryId;
    initialLimitAmount = limitAmount;
    initialLimitPeriod = limitPeriod;
    limitOpen = true;
  }

  function requestLimitClose() {
    if (saveLimit.isPending) return;
    if (limitDirty && !globalThis.confirm(m.common_unsaved_changes_confirm())) return;
    limitOpen = false;
  }

  function onLimitCategory(id: string) {
    limitCategoryId = id;
    const category = expenseCategories.find((item) => item.id === id);
    limitAmount = category?.cap_amount != null ? String(category.cap_amount) : "";
    limitPeriod = category?.cap_period === "year" ? "year" : "month";
  }

  const saveLimit = createMutation(() => ({
    mutationFn: () => {
      const amount = normalizeCapAmount(limitAmount);
      return updateCategory(limitCategoryId, {
        cap_amount: amount,
        cap_period: amount == null ? null : limitPeriod,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: qk.categories(requireSessionUserId()) });
      toast.success(m.toast_category_updated());
      limitOpen = false;
    },
    onError: (err) => toastError(err),
  }));
</script>

<section class="mt-4" aria-labelledby="dashboard-piles-title">
  <div class="mb-2 flex items-center justify-between gap-3">
    <h2 id="dashboard-piles-title" class="text-sm font-medium text-slate-400">
      {m.dashboard_piles_title()}
    </h2>
    {#if categoriesQuery.isSuccess && expenseCategories.length > 0}
      <button
        type="button"
        class="focus-visible:ring-accent text-sm font-medium text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
        onclick={() => openLimit()}
      >
        {m.cap_set_action()}
      </button>
    {/if}
  </div>

  {#if categoriesQuery.isPending}
    <p class="text-sm text-slate-400" aria-live="polite">{m.common_loading()}</p>
  {:else if categoriesQuery.isError}
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm text-slate-400">{m.cap_load_error()}</p>
      <button
        type="button"
        class="focus-visible:ring-accent rounded-full border border-white/10 px-3 py-2 text-sm text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
        onclick={() => categoriesQuery.refetch()}
      >
        {m.common_retry()}
      </button>
    </div>
  {:else if piles.length === 0}
    <p class="text-sm text-slate-400">{m.cap_empty()}</p>
  {:else if txQuery.isPending}
    <p class="text-sm text-slate-400">{m.common_loading()}</p>
  {:else if txQuery.isError}
    <div class="flex items-center justify-between gap-3">
      <p class="text-sm text-slate-400">{m.common_error_description()}</p>
      <button
        type="button"
        class="focus-visible:ring-accent rounded-full border border-white/10 px-3 py-2 text-sm text-slate-200 focus-visible:ring-2 focus-visible:outline-none"
        onclick={() => txQuery.refetch()}
      >
        {m.common_retry()}
      </button>
    </div>
  {:else}
    <ul class="space-y-3">
      {#each rows as row (row.pile.id)}
        <li>
          <a href="/transactions?categoryId={row.pile.id}" class="block text-sm text-slate-200">
            {m.dashboard_piles_line({
              name: row.pile.name,
              spent: formatCurrency(row.spent),
              cap: formatCurrency(row.cap),
            })}
          </a>
          <p class="text-xs {row.over ? 'text-rose-300' : 'text-slate-400'}">
            {row.over
              ? m.cap_exceeded({ amount: formatCurrency(row.exceeded) })
              : m.cap_remaining({ left: formatCurrency(row.left) })}
            · {m.cap_until({ date: formatDate(row.periodEnd) })}
          </p>
          <div
            class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5"
            role="progressbar"
            aria-label={row.pile.name}
            aria-valuemin="0"
            aria-valuemax={row.cap}
            aria-valuenow={Math.min(row.spent, row.cap)}
          >
            <div
              class="h-full rounded-full {row.over ? 'bg-rose-400' : 'bg-accent-gradient'}"
              style="width: {row.pct}%"
            ></div>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<Dialog open={limitOpen} onclose={requestLimitClose} title={m.cap_set_action()}>
  <form
    class="space-y-4"
    onsubmit={(event) => {
      event.preventDefault();
      if (!limitCategoryId || saveLimit.isPending || !limitValid) return;
      void saveLimit.mutateAsync().catch(() => {
        // onError already toasted
      });
    }}
  >
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="limit-category">
        {m.transactions_filter_category()}
      </label>
      <select
        id="limit-category"
        class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
        value={limitCategoryId}
        onchange={(event) => onLimitCategory((event.currentTarget as HTMLSelectElement).value)}
      >
        {#each expenseCategories as category (category.id)}
          <option value={category.id}>{category.name}</option>
        {/each}
      </select>
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="limit-amount">
        {m.category_form_cap()}
      </label>
      <input
        id="limit-amount"
        type="text"
        inputmode="decimal"
        aria-invalid={!limitValid}
        bind:value={limitAmount}
        class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
      />
      {#if !limitValid}<p class="text-xs text-rose-300" role="alert">
          {m.error_invalid_amount()}
        </p>{/if}
    </div>
    <div class="space-y-1">
      <label class="text-xs font-medium text-slate-300" for="limit-period">
        {m.category_form_cap_period()}
      </label>
      <select
        id="limit-period"
        bind:value={limitPeriod}
        class="focus:border-accent/40 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100"
      >
        <option value="month">{m.category_form_cap_month()}</option>
        <option value="year">{m.category_form_cap_year()}</option>
      </select>
    </div>
    <p class="text-xs text-slate-400">{m.cap_scope({ scope: scopeLabel })}</p>
    <p class="text-xs text-slate-500">{m.category_form_cap_hint()}</p>
    <button
      type="submit"
      disabled={saveLimit.isPending || !limitCategoryId || !limitValid}
      class="bg-accent-gradient w-full rounded-full py-2 text-sm font-semibold text-slate-900 disabled:opacity-50"
    >
      {saveLimit.isPending ? m.common_saving() : m.cap_set_action()}
    </button>
  </form>
</Dialog>
