<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import { session } from "$lib/auth/session.svelte";
  import { productDateIso } from "$lib/date-local";
  import { qk } from "$lib/query-keys";
  import { fetchCategories } from "$lib/services/categories";
  import { spentInPile, pileWindow } from "$lib/services/pile-progress";
  import { fetchTransactions } from "$lib/services/transactions";
  import { formatCurrency } from "$lib/utils";
  import * as m from "$lib/paraglide/messages";

  const today = productDateIso(new Date());

  const categoriesQuery = createQuery(() => ({
    queryKey: qk.categories(session.userId!),
    queryFn: fetchCategories,
    enabled: () => !!session.userId,
  }));

  const piles = $derived(
    (categoriesQuery.data ?? []).filter(
      (category) =>
        category.type === "expense" &&
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
      window?.start ?? "",
      window?.end ?? ""
    ),
    queryFn: () => fetchTransactions(window!.start, window!.end),
    enabled: () => !!session.userId && !!window,
  }));

  const rows = $derived(
    piles.map((pile) => {
      const spent = spentInPile(txQuery.data ?? [], pile.id, pile.cap_period!, today);
      const cap = pile.cap_amount!;
      const pct = Math.min(100, Math.round((spent / cap) * 100));
      return { pile, spent, cap, pct, over: spent > cap };
    })
  );
</script>

{#if piles.length > 0}
  <section class="mt-4" aria-labelledby="dashboard-piles-title">
    <h2 id="dashboard-piles-title" class="mb-2 text-sm font-medium text-slate-400">
      {m.dashboard_piles_title()}
    </h2>
    <ul class="space-y-3">
      {#each rows as row (row.pile.id)}
        <li>
          <p class="text-sm text-slate-200">
            {m.dashboard_piles_line({
              name: row.pile.name,
              spent: formatCurrency(row.spent),
              cap: formatCurrency(row.cap),
            })}
          </p>
          <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              class="h-full rounded-full {row.over ? 'bg-rose-400' : 'bg-accent-gradient'}"
              style="width: {row.pct}%"
            ></div>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}
