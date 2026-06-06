<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/stores";
  import * as m from "$lib/paraglide/messages";
  import {
    computePlanProgress,
    fetchLinkedTransactions,
    fetchRankedEligibleTransactions,
    linkPlanTransaction,
    type RankedTransaction,
  } from "$lib/services/plan-settlement";
  import { fetchShoppingListById } from "$lib/services/shopping-lists";
  import { cn, formatCurrency, formatDate } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { ArrowLeft, Sparkles } from "lucide-svelte";
  import { toast } from "svelte-sonner";

  const queryClient = useQueryClient();
  const id = $derived($page.params.id ?? "");

  const planQuery = createQuery(() => ({
    queryKey: ["shopping_list", id],
    queryFn: () => fetchShoppingListById(id),
    enabled: !!id,
  }));

  const rankedQuery = createQuery(() => ({
    queryKey: ["plan-ranked", id],
    queryFn: () => fetchRankedEligibleTransactions(id),
    enabled: !!id,
  }));

  const linkedQuery = createQuery(() => ({
    queryKey: ["plan-links", id],
    queryFn: () => fetchLinkedTransactions(id),
    enabled: !!id,
  }));

  const progress = $derived(
    planQuery.data
      ? computePlanProgress({
          planId: id,
          planName: planQuery.data.name,
          plannedAmount: planQuery.data.total_amount,
          linkedTransactions: linkedQuery.data ?? [],
        })
      : null
  );

  let dismissed = $state<Set<string>>(new Set());

  const suggestions = $derived(
    (rankedQuery.data ?? []).filter(
      (r) => !dismissed.has(r.tx.id) && !(linkedQuery.data ?? []).some((lt) => lt.id === r.tx.id)
    )
  );

  const linkMutation = createMutation(() => ({
    mutationFn: (txId: string) => linkPlanTransaction(id, txId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-links", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-ranked", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-eligible", id] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
      await queryClient.invalidateQueries({ queryKey: ["shopping_lists"] });
      toast.success(m.plan_settle_linked());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function rankBadgeClass(label: RankedTransaction["rankLabel"]): string {
    if (label === "high") return "bg-emerald-500/15 text-emerald-400 border-emerald-500/20";
    if (label === "medium") return "bg-amber-500/15 text-amber-400 border-amber-500/20";
    return "bg-slate-700/50 text-slate-400 border-white/10";
  }

  function rankLabel(r: RankedTransaction): string {
    if (r.rankLabel === "high") return m.plan_settle_high_rank({ pct: r.rankPct });
    if (r.rankLabel === "medium") return m.plan_settle_medium_rank({ pct: r.rankPct });
    return m.plan_settle_low_rank({ pct: r.rankPct });
  }

  function reasonLabel(key: string, label: string): string {
    if (key === "category") return m.plan_settle_reason_category({ name: label });
    if (key === "keyword") return m.plan_settle_reason_keyword({ word: label });
    if (key === "amount") return m.plan_settle_reason_amount();
    if (key === "other_category") return m.plan_settle_reason_other_category({ name: label });
    return label;
  }
</script>

<div class="mobile-detail-bottom container mx-auto max-w-2xl space-y-6 px-4 pt-6 md:pb-8">
  <!-- Header -->
  <div class="flex items-start gap-3">
    <button
      type="button"
      onclick={() => goto(`/plans/${id}`)}
      class="mt-0.5 shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-100"
      aria-label={m.common_back()}
    >
      <ArrowLeft size={16} strokeWidth={1.8} aria-hidden="true" />
    </button>
    <div class="min-w-0">
      <h1 class="text-2xl font-semibold text-white">{m.plan_settle_action()}</h1>
      {#if planQuery.data}
        <p class="mt-0.5 truncate text-sm text-slate-400">{planQuery.data.name}</p>
      {/if}
    </div>
  </div>

  <!-- Compact progress summary -->
  {#if progress && progress.plannedAmount != null && progress.plannedAmount > 0}
    {@const pct = Math.round(Math.min(1, progress.linkedAmount / progress.plannedAmount) * 100)}
    <div class="rounded-xl border border-white/5 bg-slate-900/50 px-4 py-3">
      <div class="flex items-center justify-between gap-2 text-sm">
        <span class="text-slate-300">
          <span class="text-accent font-semibold tabular-nums">
            {formatCurrency(progress.linkedAmount)}
          </span>
          <span class="text-slate-400"> z {formatCurrency(progress.plannedAmount)}</span>
        </span>
        <span
          class={cn(
            "text-xs font-semibold tabular-nums",
            pct >= 90 ? "text-amber-400" : "text-accent"
          )}
        >
          {pct}% · {m.plan_detail_remaining({ amount: formatCurrency(progress.remaining ?? 0) })}
        </span>
      </div>
      <div class="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
        <div
          class="bg-accent-gradient h-full rounded-full transition-all"
          style="width: {pct}%"
        ></div>
      </div>
    </div>
  {/if}

  <!-- Tagline -->
  <p class="text-sm text-slate-400">
    {m.plan_settle_tagline_prefix()}
    <strong class="text-slate-200">{m.plan_settle_tagline_cta()}</strong>
    {m.plan_settle_tagline_suffix()}
  </p>

  <!-- Suggestions -->
  <section class="space-y-3">
    <h2 class="text-eyebrow text-slate-400">{m.plan_settle_suggestions_header()}</h2>

    {#if rankedQuery.isPending}
      {#each [0, 1, 2] as _, i (i)}
        <div class="h-20 animate-pulse rounded-2xl bg-slate-800/50"></div>
      {/each}
    {:else if suggestions.length === 0}
      <p class="py-4 text-center text-sm text-slate-400">{m.plan_settle_no_eligible()}</p>
    {:else}
      {#each suggestions as ranked (ranked.tx.id)}
        <div class="rounded-2xl border border-white/5 bg-slate-900/60 p-4">
          <!-- Top row: description + amount -->
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="truncate font-semibold text-slate-100">{ranked.tx.description}</p>
              <p class="mt-0.5 text-xs text-slate-400">
                {formatDate(ranked.tx.date)}{ranked.tx.category_name
                  ? ` · ${ranked.tx.category_name}`
                  : ""}
              </p>
            </div>
            <span class="shrink-0 text-sm font-bold text-rose-300 tabular-nums">
              −{formatCurrency(ranked.tx.amount)}
            </span>
          </div>

          <!-- Rank badge -->
          <div class="mt-2.5 flex flex-wrap items-center gap-2">
            <span
              class={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                rankBadgeClass(ranked.rankLabel)
              )}
            >
              <Sparkles size={9} strokeWidth={2} aria-hidden="true" />
              {rankLabel(ranked)}
            </span>

            <!-- Reason chips -->
            {#each ranked.reasons as reason (reason.key)}
              <span
                class={cn(
                  "rounded-full border px-1.5 py-0.5 text-[10px]",
                  reason.signal === "match"
                    ? "border-white/10 text-slate-400"
                    : "border-amber-500/30 text-amber-400"
                )}
              >
                {reason.signal === "match" ? "✓" : "ⓘ"}
                {reasonLabel(reason.key, reason.label)}
              </span>
            {/each}
          </div>

          <!-- Actions -->
          <div class="mt-3 flex gap-2">
            <button
              type="button"
              onclick={() => linkMutation.mutate(ranked.tx.id)}
              disabled={linkMutation.isPending}
              class="bg-accent-gradient focus-visible:ring-accent inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-slate-900 shadow-[0_0_12px_var(--color-accent-glow)] transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
            >
              {m.plan_settle_link()}
            </button>
            <button
              type="button"
              onclick={() => dismissed.add(ranked.tx.id)}
              class="focus-visible:ring-accent inline-flex h-8 items-center rounded-full border border-white/10 px-3 text-xs font-medium text-slate-400 transition-colors hover:bg-white/5 focus-visible:ring-2 focus-visible:outline-none"
            >
              {m.plan_settle_reject()}
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </section>

  <!-- Already linked (read-only) -->
  {#if (linkedQuery.data ?? []).length > 0}
    <section class="space-y-2">
      <h2 class="text-eyebrow text-slate-400">{m.plan_settle_linked_heading()}</h2>
      <ul class="space-y-1">
        {#each linkedQuery.data ?? [] as tx (tx.id)}
          <li
            class="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-slate-900/40 px-3 py-2 text-xs"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium text-slate-200">{tx.description}</p>
              <p class="mt-0.5 text-slate-400">{formatDate(tx.date)}</p>
            </div>
            <div class="flex shrink-0 items-center gap-2">
              <span
                class="border-accent/20 bg-accent/10 text-accent rounded-full border px-2 py-0.5 text-[10px] font-medium"
              >
                {m.plan_linked_badge()}
              </span>
              <span class="font-semibold text-rose-300 tabular-nums">
                −{formatCurrency(tx.amount)}
              </span>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}
</div>
