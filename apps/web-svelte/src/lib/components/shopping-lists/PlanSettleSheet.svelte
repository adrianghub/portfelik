<script lang="ts">
  import * as m from "$lib/paraglide/messages";
  import Dialog from "$lib/components/ui/Dialog.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import {
    fetchEligibleSettlementTransactions,
    fetchLinkedTransactions,
    linkPlanTransaction,
    unlinkPlanTransaction,
    computePlanProgress,
  } from "$lib/services/plan-settlement";
  import type { TransactionWithCategory } from "$lib/types";
  import { formatCurrency, formatDate } from "$lib/utils";
  import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
  import { toast } from "svelte-sonner";

  interface Props {
    open: boolean;
    planId: string;
    planName: string;
    plannedAmount: number | null;
    onclose: () => void;
  }

  let { open, planId, planName, plannedAmount, onclose }: Props = $props();
  const queryClient = useQueryClient();

  const linkedQuery = createQuery(() => ({
    queryKey: ["plan-links", planId],
    queryFn: () => fetchLinkedTransactions(planId),
    enabled: open && !!planId,
  }));

  const eligibleQuery = createQuery(() => ({
    queryKey: ["plan-eligible", planId],
    queryFn: () => fetchEligibleSettlementTransactions(planId),
    enabled: open && !!planId,
  }));

  const progress = $derived(
    computePlanProgress({
      planId,
      planName,
      plannedAmount,
      linkedTransactions: linkedQuery.data ?? [],
    })
  );

  const linkMutation = createMutation(() => ({
    mutationFn: (txId: string) => linkPlanTransaction(planId, txId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-links", planId] });
      await queryClient.invalidateQueries({ queryKey: ["plan-eligible", planId] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
      await queryClient.invalidateQueries({ queryKey: ["shopping_list", planId] });
      toast.success(m.plan_settle_linked());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  const unlinkMutation = createMutation(() => ({
    mutationFn: (txId: string) => unlinkPlanTransaction(planId, txId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["plan-links", planId] });
      await queryClient.invalidateQueries({ queryKey: ["plan-eligible", planId] });
      await queryClient.invalidateQueries({ queryKey: ["plan-progress"] });
      toast.success(m.plan_settle_unlinked());
    },
    onError: () => toast.error(m.toast_error()),
  }));

  function isLinked(tx: TransactionWithCategory): boolean {
    return (linkedQuery.data ?? []).some((l) => l.id === tx.id);
  }
</script>

<Dialog {open} {onclose} title={m.plan_settle_title()}>
  <div class="space-y-4">
    <p class="text-sm text-slate-300">{m.plan_settle_body({ name: planName })}</p>

    <div class="rounded-xl border border-white/10 bg-slate-900/50 px-3 py-2 text-sm">
      <p class="text-slate-200">
        {m.plan_settle_progress({
          linked: formatCurrency(progress.linkedAmount),
          count: progress.linkedCount,
        })}
      </p>
      {#if progress.plannedAmount != null && progress.plannedAmount > 0}
        <p class="mt-1 text-xs text-slate-400">
          {m.plan_settle_remaining({
            planned: formatCurrency(progress.plannedAmount),
            remaining: formatCurrency(progress.remaining ?? 0),
          })}
        </p>
      {/if}
    </div>

    {#if linkedQuery.data && linkedQuery.data.length > 0}
      <section>
        <h3 class="text-eyebrow mb-2 text-slate-400">{m.plan_settle_linked_heading()}</h3>
        <ul class="max-h-40 space-y-1 overflow-y-auto">
          {#each linkedQuery.data as tx (tx.id)}
            <li
              class="flex items-center justify-between gap-2 rounded-lg border border-white/5 px-2 py-1.5 text-xs"
            >
              <span class="min-w-0 truncate text-slate-200">
                {tx.description} · {formatDate(tx.date)}
              </span>
              <div class="flex shrink-0 items-center gap-2">
                <span class="text-rose-300 tabular-nums">−{formatCurrency(tx.amount)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={unlinkMutation.isPending}
                  onclick={() => unlinkMutation.mutate(tx.id)}
                >
                  {m.plan_settle_unlink()}
                </Button>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section>
      <h3 class="text-eyebrow mb-2 text-slate-400">{m.plan_settle_pick_heading()}</h3>
      {#if eligibleQuery.isPending}
        <div class="h-24 animate-pulse rounded-xl bg-slate-800/50"></div>
      {:else if (eligibleQuery.data ?? []).length === 0}
        <p class="text-xs text-slate-400">{m.plan_settle_no_eligible()}</p>
      {:else}
        <ul class="max-h-56 space-y-1 overflow-y-auto">
          {#each eligibleQuery.data ?? [] as tx (tx.id)}
            {#if !isLinked(tx)}
              <li
                class="flex items-center justify-between gap-2 rounded-lg border border-white/5 px-2 py-1.5 text-xs"
              >
                <span class="min-w-0 truncate text-slate-200">
                  {tx.description} · {formatDate(tx.date)}
                </span>
                <div class="flex shrink-0 items-center gap-2">
                  <span class="text-rose-300 tabular-nums">−{formatCurrency(tx.amount)}</span>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={linkMutation.isPending}
                    onclick={() => linkMutation.mutate(tx.id)}
                  >
                    {m.plan_settle_link()}
                  </Button>
                </div>
              </li>
            {/if}
          {/each}
        </ul>
      {/if}
    </section>

    <div class="flex justify-end">
      <Button variant="ghost" onclick={onclose}>{m.common_close()}</Button>
    </div>
  </div>
</Dialog>
